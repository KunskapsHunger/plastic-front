// Player commands. Every peer applies the same validated commands in the same order, and anything
// invalid is ignored everywhere alike. `canPlace` is also used by the client for the build ghost.
import { MAP_H, MAP_W, TEAM_SWARM } from '../shared/constants.js';
import { BUILDINGS, GATE_REBUILD_SAFE_RADIUS, RECIPES, REFUND } from '../shared/buildings.js';
import { ITEMS } from '../shared/items.js';
import { TECHS, techAvailable } from '../shared/tech.js';
import { T_FLOOR, idx, zoneTeam } from '../shared/map.js';
import { MACHINES } from './production.js';
import { TRANSPORT } from './transport.js';
import { queryUnits } from './army.js';
import { createAI } from './ai.js';

const MAX_BATCH = 400;

export function hasTech(sim, team, id) {
  return !id || sim.teams[team].researched.has(id);
}

/** @returns {string|null} a reason the building can't go there, or null when it can. */
export function placementError(sim, team, type, x, y) {
  const def = BUILDINGS[type];
  if (!def || def.fixed) return 'Unknown building';
  if (!hasTech(sim, team, def.tech)) return 'Not yet researched';
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'Bad position';
  if (x < 0 || y < 0 || x + def.w > MAP_W || y + def.h > MAP_H) return 'Out of bounds';
  let deposit = false;
  for (let yy = y; yy < y + def.h; yy++) {
    for (let xx = x; xx < x + def.w; xx++) {
      if (zoneTeam(xx) !== team || sim.map.terrain[idx(xx, yy)] !== T_FLOOR) return 'Build on your own factory floor';
      if (sim.grid[idx(xx, yy)]) return 'Something is in the way';
      if (sim.map.deposits[idx(xx, yy)]) deposit = true;
    }
  }
  if (type === 'scoop' && !deposit) return 'Scoops must sit on a deposit';
  return null;
}

function spend(sim, team, amount) {
  const t = sim.teams[team];
  if (t.req < amount) return false;
  t.req -= amount;
  return true;
}

function build(sim, player, team, c) {
  const type = String(c.type);
  if (placementError(sim, team, type, c.x, c.y)) return null;
  const def = BUILDINGS[type];
  if (!spend(sim, team, def.cost)) {
    sim.events.push({ e: 'broke', team, player });
    return null;
  }
  const recipe = MACHINES.has(type) && def.recipes.includes(c.recipe) && hasTech(sim, team, RECIPES[c.recipe].tech)
    ? c.recipe : null;
  const b = sim.addBuilding(team, player, type, c.x, c.y, (c.dir | 0) & 3, { recipe });
  sim.events.push({ e: 'built', id: b.id, type, team, player });
  return b;
}

/** Drag-placed conveyors: a belt dragged over an existing belt re-points it instead. */
function line(sim, player, team, c) {
  const type = String(c.type);
  if (!TRANSPORT.has(type) || !Array.isArray(c.tiles)) return;
  for (const t of c.tiles.slice(0, MAX_BATCH)) {
    if (!Array.isArray(t)) continue;
    const [x, y, dir] = t;
    const kind = TRANSPORT.has(t[3]) ? t[3] : type;
    const existing = sim.buildingAt(x, y);
    if (existing && existing.team === team && existing.type === kind) {
      if (kind !== 'junction') existing.dir = (dir | 0) & 3;
      sim.transportDirty = true;
      continue;
    }
    if (existing && existing.team === team && kind === 'junction' && existing.type === 'belt') {
      // bridge a crossing: the old belt's cargo carries on through the junction
      if (sim.teams[team].req < BUILDINGS.junction.cost) break;
      const cargo = existing.items;
      sim.removeBuilding(existing);
      const j = build(sim, player, team, { type: 'junction', x, y, dir: 0 });
      const keep = j ? cargo.slice(0, 2) : [];
      for (const it of keep) j.jq[existing.dir].push({ it, timer: 1 });
      // whatever the junction can't hold is refunded rather than silently lost
      for (const it of cargo.slice(keep.length)) sim.teams[team].req += ITEMS[it.t]?.value || 0;
      continue;
    }
    if (!build(sim, player, team, { type: kind, x, y, dir })) {
      if (sim.teams[team].req < BUILDINGS[kind].cost) break;
    }
  }
}

function refundItems(sim, team, b) {
  let value = 0;
  for (const it of sim.heldItems(b)) value += ITEMS[it.t]?.value || 0;
  if (b.out) for (const item of b.out) value += ITEMS[item]?.value || 0;
  return value * 0.5;
}

function remove(sim, team, c) {
  if (!Array.isArray(c.tiles)) return;
  const seen = new Set();
  for (const t of c.tiles.slice(0, MAX_BATCH)) {
    if (!Array.isArray(t)) continue;
    const b = sim.buildingAt(t[0], t[1]);
    if (!b || seen.has(b.id) || b.team !== team || BUILDINGS[b.type].fixed) continue;
    seen.add(b.id);
    sim.teams[team].req += BUILDINGS[b.type].cost * REFUND + refundItems(sim, team, b);
    sim.removeBuilding(b);
    sim.events.push({ e: 'removed', type: b.type, team, x: b.x + b.w / 2, y: b.y + b.h / 2 });
  }
}

function ownBuilding(sim, team, id) {
  const b = sim.byId.get(id | 0);
  return b && b.team === team && !b.dead ? b : null;
}

function research(sim, team, id) {
  const t = sim.teams[team];
  const tech = TECHS[id];
  if (!tech || !techAvailable(t.researched, id) || t.glory < tech.cost) return;
  t.glory -= tech.cost;
  t.researched.add(id);
  t.researchLog.push({ id, tick: sim.tick });
  if (id === 'hp1') t.hpMult = 1.2;
  if (id === 'dmg1') t.dmgMult = 1.15;
  if (id === 'drills2') t.drillMult = 1.4;
  if (id === 'bench2') t.benchMult = 1.3;
  if (id === 'belts2') t.beltStep *= 1.5;
  sim.events.push({ e: 'research', team, tech: id });
}

function rebuildGate(sim, team, lane) {
  const g = sim.laneEnd(team, lane | 0);
  if (!g || !g.dead) return;
  let threatened = false;
  queryUnits(sim, g.x + 1, g.y + 1, GATE_REBUILD_SAFE_RADIUS, (u) => {
    threatened = sim.hostile(team, u.team);
    return threatened;
  });
  if (threatened || !spend(sim, team, BUILDINGS.gate.cost)) return;
  g.dead = false;
  g.hp = g.maxHp;
  g.queue = [];
  g.building = 40;
  sim.events.push({ e: 'rebuilt', team, lane: g.lane });
}

/** The host's own bookkeeping commands (e.g. a deserter's factory goes to an AI general). */
function hostCommand(sim, c) {
  if (c.c !== 'aiTakeover') return;
  const p = sim.players.get(String(c.id));
  if (!p || p.ai) return;
  p.ai = 'normal';
  const ai = createAI(sim, p);
  ai.next = sim.tick + 20;
  sim.ais.push(ai);
  sim.events.push({ e: 'takeover', player: p.id, name: p.name, team: p.team });
}

export function applyCommand(sim, player, c) {
  if (!c || typeof c !== 'object') return;
  if (player === '__host') {
    hostCommand(sim, c);
    return;
  }
  const team = sim.teamOf(player);
  if (team < 0 || team === TEAM_SWARM || sim.teams[team].defeated) return;
  switch (c.c) {
    case 'build':
      build(sim, player, team, c);
      break;
    case 'line':
      line(sim, player, team, c);
      break;
    case 'remove':
      remove(sim, team, c);
      break;
    case 'rotate': {
      const b = ownBuilding(sim, team, c.id);
      if (b && !BUILDINGS[b.type].fixed) {
        b.dir = (c.dir ?? b.dir + 1) & 3;
        sim.transportDirty = true;
      }
      break;
    }
    case 'recipe': {
      const b = ownBuilding(sim, team, c.id);
      const def = b && BUILDINGS[b.type];
      if (!b || !MACHINES.has(b.type) || !def.recipes.includes(c.recipe)) break;
      if (!hasTech(sim, team, RECIPES[c.recipe].tech) || b.recipe === c.recipe) break;
      // switching recipes scraps the half-made part; ingredients stay for recipes that share them
      b.recipe = c.recipe;
      b.progress = 0;
      for (const k of Object.keys(b.inv)) if (!RECIPES[c.recipe].in[k]) delete b.inv[k];
      break;
    }
    case 'filter': {
      const b = ownBuilding(sim, team, c.id);
      if (b && b.type === 'sorter' && (c.item === null || ITEMS[c.item])) b.filter = c.item;
      break;
    }
    case 'research':
      research(sim, team, String(c.tech));
      break;
    case 'order':
      if ((c.lane | 0) >= 0 && (c.lane | 0) < 3 && (c.order === 'advance' || c.order === 'hold')) {
        sim.teams[team].laneOrders[c.lane | 0] = c.order;
        sim.events.push({ e: 'order', team, lane: c.lane | 0, order: c.order, player });
      }
      break;
    case 'rebuild':
      rebuildGate(sim, team, c.lane);
      break;
    case 'ping':
      if (Number.isFinite(c.x) && Number.isFinite(c.y)) {
        sim.pings.push({ team, x: c.x, y: c.y, player, until: sim.tick + 80 });
        sim.events.push({ e: 'ping', team, x: c.x, y: c.y, player });
      }
      break;
    case 'surrender':
      if (!sim.over) {
        sim.teams[team].defeated = true;
        sim.checkVictory();
      }
      break;
    default:
      break;
  }
}
