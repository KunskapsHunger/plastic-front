// Belt routing and machine siting for AI commanders. Deterministic A* over the factory grid.
import { DX, DY, MAP_H, MAP_W, opposite } from '../shared/constants.js';
import { BUILDINGS } from '../shared/buildings.js';
import { T_FLOOR, idx, zoneTeam } from '../shared/map.js';
import { placementError } from './commands.js';

const EMITTERS = new Set(['scoop', 'press', 'tinworks', 'mill', 'bench', 'reclaimer']);
const TURN_COST = 0.6;
const CROSS_COST = 4;
const DEPOSIT_COST = 2.5;
const MAX_EXPANSIONS = 6000;

/** Tiles directly in front of a building's output edge. */
export function outputTiles(b) {
  const out = [];
  const d = b.dir;
  const span = d === 0 || d === 2 ? b.h : b.w;
  for (let i = 0; i < span; i++) {
    if (d === 0) out.push([b.x + b.w, b.y + i]);
    else if (d === 2) out.push([b.x - 1, b.y + i]);
    else if (d === 1) out.push([b.x + i, b.y + b.h]);
    else out.push([b.x + i, b.y - 1]);
  }
  return out;
}

/** Every tile that some machine would push items into: belts must not wander across them. */
function reservedTiles(sim, team, except) {
  const set = new Set();
  for (const b of sim.buildings) {
    if (b.team !== team || b === except || !EMITTERS.has(b.type)) continue;
    for (const [x, y] of outputTiles(b)) set.add(idx(x, y));
  }
  return set;
}

function freeFloor(sim, team, x, y, blocked) {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && zoneTeam(x) === team
    && sim.map.terrain[idx(x, y)] === T_FLOOR && !sim.grid[idx(x, y)] && !blocked?.has(idx(x, y));
}

/** Tile set for virtual obstacles: planned buildings ({x,y,w,h}) and planned belts ([x,y,dir]). */
export function blockSet(items) {
  const set = new Set();
  for (const it of items) {
    if (Array.isArray(it)) set.add(idx(it[0], it[1]));
    else for (let y = it.y; y < it.y + it.h; y++) for (let x = it.x; x < it.x + it.w; x++) set.add(idx(x, y));
  }
  return set;
}

/**
 * Can a new belt travelling in `d` hop over the belt at (x, y) by turning it into a junction?
 * Only straight, perpendicular runs qualify, so the old belt keeps flowing through.
 */
function crossable(sim, team, x, y, d) {
  const b = sim.buildingAt(x, y);
  if (!b || b.team !== team) return false;
  if (b.type === 'junction') return true;
  if (b.type !== 'belt' || (b.dir & 1) === (d & 1)) return false;
  const back = sim.buildingAt(x - DX[b.dir], y - DY[b.dir]);
  const ahead = sim.buildingAt(x + DX[b.dir], y + DY[b.dir]);
  const straightIn = back && ((back.type === 'belt' && back.dir === b.dir) || back.type === 'junction');
  const straightOut = ahead && ahead.type === 'belt' && ahead.dir === b.dir;
  return !!(straightIn && straightOut);
}

/** Tiles next to `target` from which a belt pointing in would feed it: [[x, y, dirIntoTarget]]. */
function entryTiles(target) {
  const res = [];
  const { x, y, w, h } = target;
  for (let i = 0; i < w; i++) {
    res.push([x + i, y - 1, 1]);
    res.push([x + i, y + h, 3]);
  }
  for (let i = 0; i < h; i++) {
    res.push([x - 1, y + i, 0]);
    res.push([x + w, y + i, 2]);
  }
  return res;
}

class Heap {
  constructor() {
    this.a = [];
  }

  static better(p, q) {
    return p.f < q.f || (p.f === q.f && p.k < q.k);
  }

  push(n) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!Heap.better(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }

  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && Heap.better(a[l], a[m])) m = l;
        if (r < a.length && Heap.better(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }

  get size() {
    return this.a.length;
  }
}

/**
 * Route a belt from `src`'s output to any input face of `dst`.
 * @returns {Array<[x, y, dir]>|null} belt tiles, or null when no path exists.
 */
export function routeBelt(sim, team, src, dst, blocked = null) {
  const reserved = reservedTiles(sim, team, src);
  // planned machines also spill from their output edges
  if (blocked?.planned) for (const p of blocked.planned) if (p !== src) for (const [x, y] of outputTiles(p)) reserved.add(idx(x, y));
  const goals = new Map();
  for (const [x, y, d] of entryTiles(dst)) {
    if (freeFloor(sim, team, x, y, blocked) && !reserved.has(idx(x, y))) goals.set(idx(x, y), d);
  }
  if (!goals.size) return null;
  const starts = outputTiles(src).filter(([x, y]) => freeFloor(sim, team, x, y, blocked));
  if (!starts.length) return null;
  const gxs = [...goals.keys()].map((k) => [k % MAP_W, Math.floor(k / MAP_W)]);
  const h = (x, y) => {
    let best = Infinity;
    for (const [gx, gy] of gxs) best = Math.min(best, Math.abs(gx - x) + Math.abs(gy - y));
    return best;
  };
  // state = tile * 4 + incoming direction
  const g = new Map();
  const prev = new Map();
  const hops = new Map(); // state → tile index of a belt hopped over to reach it
  const heap = new Heap();
  let counter = 0;
  for (const [x, y] of starts) {
    const s = idx(x, y) * 4 + src.dir;
    g.set(s, 0);
    heap.push({ s, f: h(x, y), k: counter++ });
  }
  let found = -1;
  let expansions = 0;
  while (heap.size && expansions++ < MAX_EXPANSIONS) {
    const { s } = heap.pop();
    const tile = s >> 2;
    const inDir = s & 3;
    const x = tile % MAP_W;
    const y = Math.floor(tile / MAP_W);
    if (goals.has(tile)) {
      found = s;
      break;
    }
    const base = g.get(s);
    for (let d = 0; d < 4; d++) {
      if (d === opposite(inDir)) continue;
      let nx = x + DX[d];
      let ny = y + DY[d];
      let extra = 0;
      let hop = -1;
      // hop straight over a perpendicular belt (it becomes a junction)
      if (d === inDir && !freeFloor(sim, team, nx, ny, blocked) && !blocked?.has(idx(nx, ny)) && crossable(sim, team, nx, ny, d)) {
        hop = idx(nx, ny);
        nx += DX[d];
        ny += DY[d];
        extra = CROSS_COST;
      }
      if (!freeFloor(sim, team, nx, ny, blocked) || reserved.has(idx(nx, ny))) continue;
      const cost = base + 1 + extra + (d !== inDir ? TURN_COST : 0) + (sim.map.deposits[idx(nx, ny)] ? DEPOSIT_COST : 0);
      const ns = idx(nx, ny) * 4 + d;
      if (cost < (g.get(ns) ?? Infinity)) {
        g.set(ns, cost);
        prev.set(ns, s);
        if (hop >= 0) hops.set(ns, hop);
        else hops.delete(ns);
        heap.push({ s: ns, f: cost + h(nx, ny), k: counter++ });
      }
    }
  }
  if (found < 0) return null;
  // walk back: each tile's belt points toward the next tile in the path
  const chain = [];
  for (let s = found; s !== undefined; s = prev.get(s)) chain.push(s);
  chain.reverse();
  const tiles = [];
  chain.forEach((s, i) => {
    const t = s >> 2;
    if (hops.has(s)) {
      const j = hops.get(s);
      tiles.push([j % MAP_W, Math.floor(j / MAP_W), s & 3, 'junction']);
    }
    const dir = i + 1 < chain.length ? chain[i + 1] & 3 : goals.get(t);
    tiles.push([t % MAP_W, Math.floor(t / MAP_W), dir]);
  });
  // the first belt must not face back into its source
  if (tiles[0][2] === opposite(src.dir)) return null;
  return tiles;
}

/** Facing that points from a rect's centre toward a point. */
export function facingToward(x, y, w, h, tx, ty) {
  const dx = tx - (x + w / 2);
  const dy = ty - (y + h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 0 : 2;
  return dy >= 0 ? 1 : 3;
}

/**
 * Find a spot for a building near (cx, cy), facing toward (tx, ty), with a free output edge
 * and a free ring around it for belts. Returns {x, y, dir} or null.
 */
export function siteBuilding(sim, team, type, cx, cy, tx, ty, opts = {}) {
  return siteCandidates(sim, team, type, cx, cy, tx, ty, opts)[0] || null;
}

/** Up to `opts.count` good spots, best first. */
export function siteCandidates(sim, team, type, cx, cy, tx, ty, opts = {}) {
  const def = BUILDINGS[type];
  const maxR = opts.maxR ?? 14;
  const deposit = opts.deposit ?? null;
  const reserved = reservedTiles(sim, team, null);
  const found = [];
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.round(cx - def.w / 2) + dx;
        const y = Math.round(cy - def.h / 2) + dy;
        if (placementError(sim, team, type, x, y)) continue;
        let cover = 0;
        let depositTiles = 0;
        let blocked = false;
        for (let yy = y; yy < y + def.h; yy++) {
          for (let xx = x; xx < x + def.w; xx++) {
            if (reserved.has(idx(xx, yy))) blocked = true;
            const k = sim.map.deposits[idx(xx, yy)];
            if (k) depositTiles++;
            if (deposit && k === deposit) cover++;
          }
        }
        if (blocked || (deposit && cover < (opts.minCover ?? 3))) continue;
        if (!deposit && depositTiles) continue; // keep ore free for scoops
        const dir = facingToward(x, y, def.w, def.h, tx, ty);
        const fake = { x, y, w: def.w, h: def.h, dir };
        const outs = outputTiles(fake);
        // every output tile must be open floor, or the machine would spill into someone else's belt
        if (!outs.every(([ox, oy]) => freeFloor(sim, team, ox, oy) && !reserved.has(idx(ox, oy)))) continue;
        if (!opts.tight && !ringMostlyFree(sim, team, x, y, def.w, def.h)) continue;
        found.push({ x, y, dir, score: r * 10 - cover * 6 });
      }
    }
    if (found.length >= (opts.count ?? 1) && r >= 2) break;
  }
  found.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
  return found.slice(0, opts.count ?? 1);
}

function ringMostlyFree(sim, team, x, y, w, h) {
  let free = 0;
  let total = 0;
  for (let xx = x - 1; xx <= x + w; xx++) {
    for (let yy = y - 1; yy <= y + h; yy++) {
      if (xx >= x && xx < x + w && yy >= y && yy < y + h) continue;
      total++;
      if (freeFloor(sim, team, xx, yy)) free++;
    }
  }
  return free >= total * 0.6;
}

/**
 * Best free scoop spot on a deposit kind, as close as possible to (nx, ny), facing (tx, ty).
 * Scans the whole factory so it never gives up on a crowded pile while another sits untouched.
 */
export function siteScoop(sim, team, kind, nx, ny, tx, ty, minCover = 3) {
  const reserved = reservedTiles(sim, team, null);
  let best = null;
  let bestD = Infinity;
  for (let y = 0; y < MAP_H - 1; y++) {
    for (let x = 0; x < MAP_W - 1; x++) {
      if (zoneTeam(x) !== team || zoneTeam(x + 1) !== team) continue;
      let cover = 0;
      let blocked = false;
      for (let yy = y; yy < y + 2; yy++) {
        for (let xx = x; xx < x + 2; xx++) {
          if (sim.map.deposits[idx(xx, yy)] === kind) cover++;
          if (reserved.has(idx(xx, yy))) blocked = true;
        }
      }
      if (cover < minCover || blocked || placementError(sim, team, 'scoop', x, y)) continue;
      const dir = facingToward(x, y, 2, 2, tx, ty);
      const outs = outputTiles({ x, y, w: 2, h: 2, dir });
      if (!outs.every(([ox, oy]) => freeFloor(sim, team, ox, oy) && !reserved.has(idx(ox, oy)))) continue;
      const d = (x + 1 - nx) * (x + 1 - nx) + (y + 1 - ny) * (y + 1 - ny) - cover * 2;
      if (d < bestD) {
        bestD = d;
        best = { x, y, dir };
      }
    }
  }
  return best;
}
