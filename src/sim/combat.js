// Shots, lobbed explosives, flames, bombs, healing glue, and the accounting of heroism.
import { DT } from '../shared/constants.js';
import { ARMOR_APPLIES, HITS_AIR, UNITS } from '../shared/units.js';
import { BUILDINGS } from '../shared/buildings.js';
import { queryUnits } from './army.js';

const SCATTER = { grenadier: 0.35, mortar: 0.7, mortarpit: 0.8, tank: 0.2, colossus: 0.3, bombardier: 0.5 };
const CONE_COS = 0.8;

/** Distance from a point to a building's rectangle (0 inside). */
export function rectDist(x, y, b) {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.sqrt(dx * dx + dy * dy);
}

export function targetPoint(t) {
  return t.w ? [t.x + t.w / 2, t.y + t.h / 2] : [t.x, t.y];
}

/** Structure turrets (and the HQ / gates) pick the nearest hostile unit in range. */
export function findTargetForStructure(sim, b, def) {
  const a = def.attack;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const reach = a.range + Math.max(b.w, b.h) / 2;
  let best = null;
  let bestD = Infinity;
  queryUnits(sim, cx, cy, reach, (o) => {
    if (!sim.hostile(b.team, o.team)) return false;
    if (def.airOnly ? !o.air : o.air && !(HITS_AIR[a.dtype] > 0)) return false;
    const d = rectDist(o.x, o.y, b);
    if (a.minRange && d < a.minRange) return false;
    if (d <= a.range && (d < bestD || (d === bestD && o.id < best.id))) {
      best = o;
      bestD = d;
    }
    return false;
  });
  return best;
}

/**
 * Fire one attack from `shooter` ({team, x, y, src, uid?, bid?, facing?}) at `target` (unit or building).
 */
export function fireAttack(sim, shooter, a, target, dmgMult) {
  const [tx, ty] = targetPoint(target);
  const dmg = a.damage * dmgMult;
  switch (a.kind) {
    case 'hitscan': {
      const airMult = target.air ? HITS_AIR[a.dtype] || 0 : 1;
      hit(sim, target, dmg * airMult, a.dtype, shooter.team, shooter.src);
      sim.events.push({ e: 'shot', src: shooter.src, uid: shooter.uid, team: shooter.team, x: shooter.x, y: shooter.y, tx, ty });
      break;
    }
    case 'melee': {
      if (a.splash) splash(sim, tx, ty, a.splash, dmg, a.dtype, shooter.team, shooter.src, true);
      else hit(sim, target, dmg, a.dtype, shooter.team, shooter.src);
      sim.events.push({ e: 'bite', src: shooter.src, team: shooter.team, x: tx, y: ty });
      break;
    }
    case 'heal': {
      target.hp = Math.min(target.maxHp, target.hp + a.damage * a.cooldown);
      sim.events.push({ e: 'heal', x: shooter.x, y: shooter.y, tx, ty, team: shooter.team });
      break;
    }
    case 'cone': {
      let fx = tx - shooter.x;
      let fy = ty - shooter.y;
      const fl = Math.sqrt(fx * fx + fy * fy) || 1;
      fx /= fl;
      fy /= fl;
      queryUnits(sim, shooter.x, shooter.y, a.range + 0.5, (o) => {
        if (!sim.hostile(shooter.team, o.team) || o.air) return false;
        const dx = o.x - shooter.x;
        const dy = o.y - shooter.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        if ((dx * fx + dy * fy) / d < CONE_COS) return false;
        hit(sim, o, dmg, 'fire', shooter.team, shooter.src);
        if (!o.dead && !UNITS[o.type].vehicle) {
          o.burn = Math.max(o.burn, a.burn || 0);
          o.burnTeam = shooter.team;
        }
        return false;
      });
      if (target.w) hit(sim, target, dmg, 'fire', shooter.team, shooter.src);
      sim.events.push({ e: 'flame', uid: shooter.uid, team: shooter.team, x: shooter.x, y: shooter.y, tx, ty });
      break;
    }
    case 'lob': {
      const s = SCATTER[shooter.src] || 0.3;
      const lx = tx + sim.rng.range(-s, s);
      const ly = ty + sim.rng.range(-s, s);
      sim.projectiles.push({
        id: sim.nextId++, src: shooter.src, team: shooter.team, x0: shooter.x, y0: shooter.y, x1: lx, y1: ly,
        t: 0, flight: a.flight, dmg, splash: a.splash, dtype: a.dtype,
      });
      sim.events.push({ e: 'launch', src: shooter.src, uid: shooter.uid, team: shooter.team, x: shooter.x, y: shooter.y });
      break;
    }
    case 'bomb': {
      splash(sim, tx, ty, a.splash, dmg, a.dtype, shooter.team, shooter.src, true);
      sim.events.push({ e: 'boom', src: shooter.src, team: shooter.team, x: tx, y: ty, r: a.splash });
      break;
    }
    default:
      break;
  }
}

function hit(sim, target, dmg, dtype, team, src) {
  if (target.w) sim.damageBuilding(target, dmg, dtype, team);
  else sim.damageUnit(target, dmg, dtype, team, src);
}

/** Area damage with a soft falloff. Hits ground units, and buildings when `structures` is set. */
export function splash(sim, x, y, radius, dmg, dtype, team, src, structures = true) {
  queryUnits(sim, x, y, radius + 0.5, (o) => {
    if (!sim.hostile(team, o.team) || o.air) return false;
    const dx = o.x - x;
    const dy = o.y - y;
    const d = Math.sqrt(dx * dx + dy * dy) - o.r;
    if (d > radius) return false;
    const f = d <= radius * 0.4 ? 1 : 1 - 0.7 * ((d - radius * 0.4) / (radius * 0.6));
    sim.damageUnit(o, dmg * f, dtype, team, src);
    return false;
  });
  if (!structures) return;
  const x0 = Math.floor(x - radius);
  const x1 = Math.floor(x + radius);
  const y0 = Math.floor(y - radius);
  const y1 = Math.floor(y + radius);
  const seen = new Set();
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const b = sim.buildingAt(tx, ty);
      if (!b || seen.has(b.id) || b.dead || !sim.hostile(team, b.team)) continue;
      seen.add(b.id);
      if (rectDist(x, y, b) <= radius) sim.damageBuilding(b, dmg * 0.8, dtype, team);
    }
  }
}

export function updateProjectiles(sim) {
  const keep = [];
  for (const p of sim.projectiles) {
    p.t += DT;
    if (p.t < p.flight) {
      keep.push(p);
      continue;
    }
    splash(sim, p.x1, p.y1, p.splash, p.dmg, p.dtype, p.team, p.src, true);
    sim.events.push({ e: 'boom', src: p.src, team: p.team, x: p.x1, y: p.y1, r: p.splash, dtype: p.dtype });
  }
  sim.projectiles = keep;
}

/** Armor-adjusted damage. */
export function mitigate(def, dmg, dtype) {
  const armor = def.armor || 0;
  return dmg * (1 - armor * (ARMOR_APPLIES[dtype] ?? 1));
}

export function buildingDef(b) {
  return BUILDINGS[b.type];
}
