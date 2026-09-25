// Soldiers and bugs: lanes, orders, targeting, movement and bumping into each other.
// Nobody is micro-managed: each unit follows its lane, shoots whatever is closest, and obeys the
// lane order (ADVANCE / HOLD) its team set.
import { DT, FIELD_X0, FIELD_X1, LANES, MAP_H, MAP_W } from '../shared/constants.js';
import { HITS_AIR, UNITS } from '../shared/units.js';
import { forwardOf, laneAt } from '../shared/map.js';
import { fireAttack, rectDist, targetPoint } from './combat.js';

const CELL = 2;
const CW = Math.ceil(MAP_W / CELL);
const CH = Math.ceil(MAP_H / CELL);
const HOLD_DEPTH = 5; // tiles in front of the own gate where HOLD units wait
const RETARGET_TICKS = 8;

export function spawnUnit(sim, type, team, lane, x, y) {
  const def = UNITS[type];
  const t = sim.teams[team];
  const hp = def.hp * (t.hpMult || 1);
  const u = {
    id: sim.nextId++, type, team, lane, x, y, px: x, py: y, hp, maxHp: hp,
    cd: sim.rng.range(0, def.attack.cooldown), target: null, facing: forwardOf(team), burn: 0, burnTeam: -1,
    air: !!def.air, r: def.radius, spread: sim.rng.range(-1, 1), moving: false, dead: false, born: sim.tick,
  };
  sim.units.push(u);
  t.unitCount++;
  t.deployed++;
  return u;
}

// ------------------------------------------------------------------ spatial hash

export function buildSpatial(sim) {
  const n = sim.units.length;
  if (!sim.cellHead) sim.cellHead = new Int32Array(CW * CH);
  sim.cellHead.fill(-1);
  if (!sim.cellNext || sim.cellNext.length < n) sim.cellNext = new Int32Array(Math.max(64, n * 2));
  for (let i = 0; i < n; i++) {
    const u = sim.units[i];
    const c = cellOf(u.x, u.y);
    sim.cellNext[i] = sim.cellHead[c];
    sim.cellHead[c] = i;
  }
}

function cellOf(x, y) {
  const cx = Math.min(CW - 1, Math.max(0, Math.floor(x / CELL)));
  const cy = Math.min(CH - 1, Math.max(0, Math.floor(y / CELL)));
  return cy * CW + cx;
}

/** Visit every unit within radius r of (x, y). Return true from fn to stop early. */
export function queryUnits(sim, x, y, r, fn) {
  const x0 = Math.max(0, Math.floor((x - r) / CELL));
  const x1 = Math.min(CW - 1, Math.floor((x + r) / CELL));
  const y0 = Math.max(0, Math.floor((y - r) / CELL));
  const y1 = Math.min(CH - 1, Math.floor((y + r) / CELL));
  const r2 = r * r;
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      for (let i = sim.cellHead[cy * CW + cx]; i !== -1; i = sim.cellNext[i]) {
        const u = sim.units[i];
        if (!u || u.dead) continue;
        const dx = u.x - x;
        const dy = u.y - y;
        if (dx * dx + dy * dy <= r2 && fn(u)) return;
      }
    }
  }
}

// ------------------------------------------------------------------ targeting

function canHit(attack, target) {
  if (!target.air) return attack.kind !== 'bomb';
  return (HITS_AIR[attack.dtype] || 0) > 0;
}

function nearestEnemyUnit(sim, u, attack, radius) {
  let best = null;
  let bestD = Infinity;
  queryUnits(sim, u.x, u.y, radius, (o) => {
    if (!sim.hostile(u.team, o.team) || !canHit(attack, o)) return false;
    const dx = o.x - u.x;
    const dy = o.y - u.y;
    const d = dx * dx + dy * dy + (o.air ? 4 : 0); // prefer ground targets a little
    if (d < bestD || (d === bestD && o.id < best.id)) {
      best = o;
      bestD = d;
    }
    return false;
  });
  return best;
}

function woundedFriend(sim, u, radius) {
  let best = null;
  let bestNeed = 0;
  queryUnits(sim, u.x, u.y, radius, (o) => {
    if (o.team !== u.team || o === u || UNITS[o.type].vehicle || o.air) return false;
    const need = o.maxHp - o.hp;
    if (need > bestNeed + 0.5) {
      best = o;
      bestNeed = need;
    }
    return false;
  });
  return best;
}

/** Nearest enemy structure in reach (the lane's gate in the field, anything inside an enemy factory). */
function nearestEnemyStructure(sim, u, radius) {
  let best = null;
  let bestD = Infinity;
  const consider = (b) => {
    if (!b || b.dead || !sim.hostile(u.team, b.team)) return;
    const d = rectDist(u.x, u.y, b);
    if (d <= radius && (d < bestD || (d === bestD && b.id < best.id))) {
      best = b;
      bestD = d;
    }
  };
  const inField = u.x >= FIELD_X0 && u.x < FIELD_X1;
  if (inField && !u.air) {
    for (const t of sim.enemiesOf(u.team)) consider(sim.laneEnd(t, u.lane));
    return best;
  }
  const r = Math.ceil(radius) + 1;
  const x0 = Math.max(0, Math.floor(u.x) - r);
  const x1 = Math.min(MAP_W - 1, Math.floor(u.x) + r);
  const y0 = Math.max(0, Math.floor(u.y) - r);
  const y1 = Math.min(MAP_H - 1, Math.floor(u.y) + r);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) consider(sim.buildingAt(x, y));
  return best;
}

function acquire(sim, u, def) {
  const a = def.attack;
  if (a.kind === 'heal') return woundedFriend(sim, u, a.range + 2);
  if (a.kind === 'bomb') return nearestEnemyStructure(sim, u, 3) || nearestEnemyUnit(sim, u, a, 1.5);
  const aggro = a.range + (a.kind === 'lob' && a.range > 8 ? 1 : 3);
  return nearestEnemyUnit(sim, u, a, aggro) || nearestEnemyStructure(sim, u, aggro);
}

function targetAlive(t) {
  return t && !t.dead && t.hp > 0;
}

// ------------------------------------------------------------------ movement goals

function gateRow(sim, team, lane) {
  const g = sim.laneEnd(team, lane);
  return g ? g.y + g.h / 2 : (LANES[lane].y0 + LANES[lane].y1) / 2;
}

/** Where a unit with nothing to shoot wants to go. */
function goal(sim, u) {
  const fwd = forwardOf(u.team);
  const inField = u.x >= FIELD_X0 && u.x < FIELD_X1;
  const enemy = sim.enemiesOf(u.team)[0];
  const lane = LANES[u.lane];
  const laneY = (lane.y0 + lane.y1) / 2 + u.spread * ((lane.y1 - lane.y0) / 2 - 1.2);

  if (u.air) {
    const t = nearestEnemyStructure(sim, u, 60) || sim.hq(enemy);
    if (t) {
      const [tx, ty] = targetPoint(t);
      return { x: tx, y: ty };
    }
    return { x: fwd > 0 ? FIELD_X1 : FIELD_X0, y: laneY };
  }

  const ownSide = fwd > 0 ? u.x < FIELD_X0 : u.x >= FIELD_X1;
  if (ownSide) {
    // a defender who chased invaders inside: head back out through the lane's gate
    return { x: fwd > 0 ? FIELD_X0 + 1 : FIELD_X1 - 1, y: gateRow(sim, u.team, u.lane) };
  }
  if (!inField) {
    const hq = sim.hq(enemy);
    if (hq) return { x: hq.x + hq.w / 2, y: hq.y + hq.h / 2 };
    return { x: u.x, y: u.y };
  }
  const order = sim.teams[u.team].laneOrders?.[u.lane] ?? 'advance';
  if (order === 'hold') {
    const holdX = fwd > 0 ? FIELD_X0 + HOLD_DEPTH : FIELD_X1 - HOLD_DEPTH;
    return { x: holdX + u.spread * 1.5, y: laneY, hold: true };
  }
  const end = sim.laneEnd(enemy, u.lane);
  const fenceX = fwd > 0 ? FIELD_X1 : FIELD_X0;
  if (end && !end.dead) return { x: fenceX - fwd * 0.5, y: laneY };
  // the gate is down: funnel through the breach
  const gy = gateRow(sim, enemy, u.lane);
  const nearFence = Math.abs(u.x - fenceX) < 4;
  return { x: fenceX + fwd * 2, y: nearFence ? gy : laneY + (gy - laneY) * 0.5 };
}

// ------------------------------------------------------------------ constraints

function passable(sim, team, lane, y, crossingTeamSide) {
  // the fence between a factory and the sandbox only opens at gate rows
  const g = sim.laneEnd(crossingTeamSide, lane);
  if (!g) return false;
  const open = g.dead || g.team === team;
  return open && y > g.y + 0.1 && y < g.y + g.h - 0.1;
}

function laneOfY(y) {
  const l = laneAt(Math.floor(y));
  return l;
}

function constrain(sim, u, oldX) {
  const r = u.r;
  if (u.air) {
    u.x = Math.min(MAP_W - 0.5, Math.max(0.5, u.x));
    u.y = Math.min(MAP_H - 0.5, Math.max(0.5, u.y));
    return;
  }
  const wasField = oldX >= FIELD_X0 && oldX < FIELD_X1;
  const greenSide = sim.teamOnSide(0);
  const rightSide = sim.teamOnSide(1);
  if (wasField) {
    // crossing into a factory?
    if (u.x < FIELD_X0 + r * 0.5) {
      if (!passable(sim, u.team, u.lane, u.y, greenSide)) u.x = FIELD_X0 + r * 0.5;
    } else if (u.x > FIELD_X1 - r * 0.5) {
      if (!passable(sim, u.team, u.lane, u.y, rightSide)) u.x = FIELD_X1 - r * 0.5;
    }
    const inFieldNow = u.x >= FIELD_X0 && u.x < FIELD_X1;
    if (inFieldNow) {
      const lane = LANES[u.lane];
      u.y = Math.min(lane.y1 - r, Math.max(lane.y0 + r, u.y));
    }
  } else {
    // inside a factory: may only leave through a gate row
    const side = oldX < FIELD_X0 ? greenSide : rightSide;
    if (u.x >= FIELD_X0 && u.x < FIELD_X1) {
      const lane = laneOfY(u.y);
      if (lane < 0 || !passable(sim, u.team, lane, u.y, side)) u.x = oldX < FIELD_X0 ? FIELD_X0 - 0.01 : FIELD_X1;
      else u.lane = lane;
    }
    u.x = Math.min(MAP_W - r, Math.max(r, u.x));
    u.y = Math.min(MAP_H - r, Math.max(r, u.y));
  }
}

function separate(sim) {
  const units = sim.units;
  const n = units.length;
  for (let i = 0; i < n; i++) {
    const u = units[i];
    if (u.dead) continue;
    const reach = u.r + 1.4;
    queryUnits(sim, u.x, u.y, reach, (o) => {
      if (o.id <= u.id || o.air !== u.air) return false;
      let dx = o.x - u.x;
      let dy = o.y - u.y;
      const min = u.r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) return false;
      let d = Math.sqrt(d2);
      if (d < 1e-4) {
        dx = ((o.id * 7) % 11) / 11 - 0.5;
        dy = ((o.id * 13) % 7) / 7 - 0.5;
        d = Math.sqrt(dx * dx + dy * dy) || 1;
      }
      const push = (min - d) * 0.4;
      const nx = dx / d;
      const ny = dy / d;
      // heavy units shove light ones
      const wu = u.r * u.r;
      const wo = o.r * o.r;
      const su = wo / (wu + wo);
      const so = wu / (wu + wo);
      u.x -= nx * push * su * 2;
      u.y -= ny * push * su * 2;
      o.x += nx * push * so * 2;
      o.y += ny * push * so * 2;
      return false;
    });
  }
}

// ------------------------------------------------------------------ update

function step(sim, u) {
  const def = UNITS[u.type];
  const a = def.attack;
  const team = sim.teams[u.team];
  if (u.cd > 0) u.cd -= DT;

  if ((sim.tick + u.id) % RETARGET_TICKS === 0 || !targetAlive(u.target)) {
    const t = acquire(sim, u, def);
    u.target = t;
  }
  if (u.target && !targetAlive(u.target)) u.target = null;
  if (a.kind === 'heal' && u.target && u.target.hp >= u.target.maxHp) u.target = null;

  let mx = 0;
  let my = 0;
  let speed = def.speed;
  u.moving = false;
  if (u.target) {
    const t = u.target;
    const [tx, ty] = targetPoint(t);
    const ddx = tx - u.x;
    const ddy = ty - u.y;
    const dist = t.w ? rectDist(u.x, u.y, t) : Math.sqrt(ddx * ddx + ddy * ddy) - (t.r || 0);
    u.facing = tx >= u.x ? 1 : -1;
    const inRange = dist <= a.range && !(a.minRange && dist < a.minRange);
    if (inRange && !(u.air && a.kind === 'bomb' && dist > a.range)) {
      if (u.cd <= 0) {
        u.cd = a.cooldown;
        fireAttack(sim, { team: u.team, x: u.x, y: u.y, src: u.type, uid: u.id, facing: u.facing }, a, t, team.dmgMult || 1);
      }
      if (u.air) {
        // aircraft keep flying over their target
        mx = tx - u.x;
        my = ty - u.y;
      }
    } else if (a.minRange && dist < a.minRange) {
      mx = -forwardOf(u.team);
    } else {
      mx = tx - u.x;
      my = ty - u.y;
    }
  } else {
    const g = goal(sim, u);
    mx = g.x - u.x;
    my = g.y - u.y;
    if (g.hold && mx * mx + my * my < 0.3) {
      mx = 0;
      my = 0;
    }
    if (mx !== 0) u.facing = mx > 0 ? 1 : -1;
  }
  const len = Math.sqrt(mx * mx + my * my);
  if (len > 0.05) {
    speed = Math.min(speed * DT, len);
    const oldX = u.x;
    u.x += (mx / len) * speed;
    u.y += (my / len) * speed;
    u.moving = true;
    constrain(sim, u, oldX);
  } else {
    constrain(sim, u, u.x);
  }
}

export function updateArmy(sim) {
  const units = sim.units;
  for (const u of units) {
    u.px = u.x;
    u.py = u.y;
  }
  buildSpatial(sim);
  for (const u of units) {
    if (u.dead) continue;
    if (u.burn > 0) {
      u.burn -= DT;
      sim.damageUnit(u, 4 * DT, 'fire', u.burnTeam, 'burn');
      if (u.dead) continue;
    }
    step(sim, u);
  }
  separate(sim);
  for (const u of units) if (!u.dead) constrain(sim, u, u.x);
  sim.reapUnits();
  buildSpatial(sim); // indices shifted when the dead were removed
}

