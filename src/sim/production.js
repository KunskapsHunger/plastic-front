// Scoops, machines, turrets, gates, the HQ and reclaimers: everything that makes, eats or fires items.
import { DT, DX, DY, MAX_UNITS_PER_TEAM, TEAM_GREEN } from '../shared/constants.js';
import {
  BUILDINGS, GATE_DEPLOY_TIME, GATE_QUEUE, MACHINE_BUFFER, OUTPUT_BUFFER, RECIPES, RECLAIM_PERIOD, SCOOP_PERIOD,
} from '../shared/buildings.js';
import { ITEMS, isCrate } from '../shared/items.js';
import { DEPOSIT_ITEM, idx } from '../shared/map.js';
import { offer } from './transport.js';
import { spawnUnit } from './army.js';
import { fireAttack, findTargetForStructure } from './combat.js';

export const MACHINES = new Set(['press', 'tinworks', 'mill', 'bench']);
export const TURRETS = new Set(['popgun', 'mortarpit', 'flak']);

export function initProduction(sim, b) {
  const def = BUILDINGS[b.type];
  b.out = [];
  b.progress = 0;
  b.rr = 0;
  if (MACHINES.has(b.type)) {
    b.recipe = b.recipe && def.recipes.includes(b.recipe) ? b.recipe : def.recipes[0];
    b.inv = {};
  } else if (b.type === 'scoop') {
    b.kinds = [];
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        const k = sim.map.deposits[idx(x, y)];
        if (k) b.kinds.push(DEPOSIT_ITEM[k]);
      }
    }
  } else if (TURRETS.has(b.type) || b.type === 'gate' || b.type === 'hq') {
    b.shots = 0;
    b.cd = 0;
    if (b.type === 'gate') b.queue = [];
  }
}

/** Items a machine still wants of each ingredient. */
function wants(b, item) {
  const r = RECIPES[b.recipe];
  const need = r?.in[item];
  if (!need) return false;
  return (b.inv[item] || 0) < need * MACHINE_BUFFER;
}

export function acceptIntoStructure(sim, b, item) {
  const def = BUILDINGS[b.type];
  if (MACHINES.has(b.type)) {
    if (!wants(b, item)) return false;
    b.inv[item] = (b.inv[item] || 0) + 1;
    return true;
  }
  if (TURRETS.has(b.type)) {
    if (item !== def.ammo || b.shots + def.shotsPerAmmo > def.maxShots) return false;
    b.shots += def.shotsPerAmmo;
    return true;
  }
  if (b.type === 'gate') {
    if (!isCrate(item) || b.queue.length >= GATE_QUEUE) return false;
    b.queue.push(item);
    return true;
  }
  if (b.type === 'hq') {
    const team = sim.teams[b.team];
    team.req += ITEMS[item]?.value || 0;
    team.bonds += ITEMS[item]?.value || 0;
    return true;
  }
  return false;
}

/** Push the first buffered output through the building's front edge, alternating between edge tiles. */
function emit(sim, b) {
  if (!b.out.length) return;
  const d = b.dir;
  const span = d === 0 || d === 2 ? b.h : b.w;
  for (let k = 0; k < span; k++) {
    const i = (b.rr + k) % span;
    let tx;
    let ty;
    if (d === 0) [tx, ty] = [b.x + b.w, b.y + i];
    else if (d === 2) [tx, ty] = [b.x - 1, b.y + i];
    else if (d === 1) [tx, ty] = [b.x + i, b.y + b.h];
    else [tx, ty] = [b.x + i, b.y - 1];
    const target = sim.buildingAt(tx, ty);
    if (!target || target === b) continue;
    const it = { t: b.out[0], pos: 0, ox: tx + 0.5 - DX[d] * 0.9, oy: ty + 0.5 - DY[d] * 0.9 };
    if (offer(sim, target, it, d, 0)) {
      b.out.shift();
      b.rr = (i + 1) % span;
      sim.events.push({ e: 'emit', id: b.id });
      return;
    }
  }
}

function updateMachine(sim, b) {
  const r = RECIPES[b.recipe];
  if (!r) return;
  const team = sim.teams[b.team];
  if (b.progress > 0) {
    b.progress += DT * (b.type === 'bench' ? team.benchMult : 1);
    if (b.progress >= r.time) {
      b.progress = 0;
      for (const [item, n] of Object.entries(r.out)) for (let i = 0; i < n; i++) b.out.push(item);
      b.crafted = (b.crafted || 0) + 1;
      sim.events.push({ e: 'craft', id: b.id, item: Object.keys(r.out)[0] });
    }
  } else if (b.out.length < OUTPUT_BUFFER) {
    const ready = Object.entries(r.in).every(([item, n]) => (b.inv[item] || 0) >= n);
    if (ready) {
      for (const [item, n] of Object.entries(r.in)) b.inv[item] -= n;
      b.progress = DT;
    }
  }
  b.active = b.progress > 0;
  emit(sim, b);
}

function updateScoop(sim, b) {
  if (!b.kinds.length) return;
  const team = sim.teams[b.team];
  const period = (SCOOP_PERIOD * 4) / b.kinds.length / team.drillMult;
  b.active = b.out.length < 2;
  if (b.active) {
    b.progress += DT;
    if (b.progress >= period) {
      b.progress -= period;
      b.out.push(b.kinds[b.rrKind = ((b.rrKind ?? -1) + 1) % b.kinds.length]);
    }
  }
  emit(sim, b);
}

function updateReclaimer(sim, b) {
  const team = sim.teams[b.team];
  b.active = team.scrap >= 1 && b.out.length < 2;
  if (b.active) {
    b.progress += DT;
    if (b.progress >= RECLAIM_PERIOD) {
      b.progress = 0;
      team.scrap -= 1;
      b.out.push('pellets');
    }
  }
  emit(sim, b);
}

function updateTurret(sim, b) {
  const def = BUILDINGS[b.type];
  if (b.cd > 0) b.cd -= DT;
  const armed = b.type === 'gate' || b.type === 'hq' || b.shots > 0;
  if (!armed || b.cd > 0) return;
  const target = findTargetForStructure(sim, b, def);
  if (!target) return;
  if (b.type !== 'gate' && b.type !== 'hq') b.shots--;
  b.cd = def.attack.cooldown;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  b.aimX = target.x - cx;
  b.aimY = target.y - cy;
  fireAttack(sim, { team: b.team, x: cx, y: cy, src: b.type, bid: b.id }, def.attack, target, 1);
}

function updateGate(sim, b) {
  updateTurret(sim, b);
  if (!b.queue.length) {
    b.progress = 0;
    return;
  }
  const team = sim.teams[b.team];
  if (team.unitCount >= MAX_UNITS_PER_TEAM) return;
  b.progress += DT;
  if (b.progress < GATE_DEPLOY_TIME) return;
  b.progress = 0;
  const crate = b.queue.shift();
  const fwd = b.team === TEAM_GREEN ? 1 : -1;
  const x = fwd > 0 ? b.x + b.w + 0.4 : b.x - 0.4;
  const y = b.y + b.h / 2 + sim.rng.range(-0.9, 0.9);
  const u = spawnUnit(sim, ITEMS[crate].unit, b.team, b.lane, x, y);
  sim.events.push({ e: 'deploy', id: b.id, unit: u.type, team: b.team, x: u.x, y: u.y });
}

export function updateProduction(sim) {
  for (const b of sim.buildings) {
    if (b.dead) continue;
    if (b.building > 0) {
      b.building--;
      continue;
    }
    if (MACHINES.has(b.type)) updateMachine(sim, b);
    else if (b.type === 'scoop') updateScoop(sim, b);
    else if (b.type === 'reclaimer') updateReclaimer(sim, b);
    else if (b.type === 'gate') updateGate(sim, b);
    else if (TURRETS.has(b.type) || b.type === 'hq') updateTurret(sim, b);
  }
}
