// Conveyors, junctions, splitters and sorters, plus the universal item hand-off (`offer`).
// Belt items are objects { t: itemId, pos: 0..1, ox, oy } whose identity survives hand-offs, so the
// renderer can glide them smoothly between ticks (ox/oy = world position at the start of the tick).
import { DX, DY, left, opposite, right } from '../shared/constants.js';
import { BELT_SPACING } from '../shared/buildings.js';
import { acceptIntoStructure } from './production.js';

export const TRANSPORT = new Set(['belt', 'junction', 'splitter', 'sorter']);
const JUNCTION_DELAY = 2; // ticks an item spends crossing a junction
const JUNCTION_CAP = 2;

export function initTransport(b) {
  if (b.type === 'belt') b.items = [];
  else if (b.type === 'junction') b.jq = [[], [], [], []];
  else if (b.type === 'splitter' || b.type === 'sorter') {
    b.buf = null;
    b.rr = 0;
  }
}

export function beltWorldPos(b, pos) {
  return [b.x + 0.5 + (pos - 0.5) * DX[b.dir], b.y + 0.5 + (pos - 0.5) * DY[b.dir]];
}

/**
 * Try to hand `it` (travelling in direction `dir`) to building `b`. Returns true if it was taken.
 * `extra` is how far past the tile edge the item already travelled (keeps belts compressed).
 */
export function offer(sim, b, it, dir, extra = 0) {
  if (!b || b.dead || b.building > 0) return false;
  switch (b.type) {
    case 'belt': return offerBelt(b, it, dir, extra);
    case 'junction': {
      const q = b.jq[dir];
      if (q.length >= JUNCTION_CAP) return false;
      q.push({ it, timer: JUNCTION_DELAY });
      return true;
    }
    case 'splitter':
    case 'sorter':
      if (b.buf || dir === opposite(b.dir)) return false;
      b.buf = it;
      return true;
    default:
      return acceptIntoStructure(sim, b, it.t);
  }
}

function offerBelt(b, it, dir, extra) {
  if (b.dir === opposite(dir)) return false;
  const items = b.items;
  if (b.dir === dir) {
    // from behind: joins at the tail
    let pos = Math.max(0, extra);
    if (items.length) {
      const tail = items[items.length - 1].pos;
      if (tail < BELT_SPACING) return false;
      pos = Math.min(pos, tail - BELT_SPACING);
    }
    it.pos = pos;
    items.push(it);
    return true;
  }
  // side-load into the middle of the tile
  const pos = 0.5;
  for (const o of items) if (Math.abs(o.pos - pos) < BELT_SPACING) return false;
  it.pos = pos;
  let i = 0;
  while (i < items.length && items[i].pos > pos) i++;
  items.splice(i, 0, it);
  return true;
}

function tileAhead(sim, x, y, d) {
  return sim.buildingAt(x + DX[d], y + DY[d]);
}

function updateBelt(sim, b) {
  const items = b.items;
  if (!items.length) return;
  const step = sim.teams[b.team].beltStep;
  for (const it of items) {
    const [wx, wy] = beltWorldPos(b, it.pos);
    it.ox = wx;
    it.oy = wy;
  }
  // Downstream belts already moved this tick, so the lead item queues right behind their tail.
  const target = tileAhead(sim, b.x, b.y, b.dir);
  const chained = target?.type === 'belt' && target.dir === b.dir;
  const tailLimit = () => (chained && target.items.length
    ? 1 + target.items[target.items.length - 1].pos - BELT_SPACING : Infinity);
  let limit = tailLimit();
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    it.pos = Math.min(it.pos + step, limit);
    if (i === 0 && it.pos >= 1) {
      if (target && offer(sim, target, it, b.dir, it.pos - 1)) {
        items.shift();
        limit = tailLimit();
        continue;
      }
      it.pos = 1;
    }
    limit = it.pos - BELT_SPACING;
    i++;
  }
}

function updateJunction(sim, b) {
  for (let d = 0; d < 4; d++) {
    const q = b.jq[d];
    if (!q.length) continue;
    for (const e of q) if (e.timer > 0) e.timer--;
    const head = q[0];
    if (head.timer > 0) continue;
    head.it.ox = b.x + 0.5;
    head.it.oy = b.y + 0.5;
    const target = tileAhead(sim, b.x, b.y, d);
    if (target && offer(sim, target, head.it, d, 0)) q.shift();
  }
}

function updateRouter(sim, b) {
  const it = b.buf;
  if (!it) return;
  it.ox = b.x + 0.5;
  it.oy = b.y + 0.5;
  let dirs;
  if (b.type === 'sorter' && b.filter) {
    dirs = it.t === b.filter ? [b.dir] : [left(b.dir), right(b.dir)];
  } else if (b.type === 'sorter') {
    dirs = [b.dir];
  } else {
    dirs = [b.dir, left(b.dir), right(b.dir)];
  }
  for (let k = 0; k < dirs.length; k++) {
    const d = dirs[(b.rr + k) % dirs.length];
    const target = tileAhead(sim, b.x, b.y, d);
    if (target && offer(sim, target, it, d, 0)) {
      b.buf = null;
      b.rr = (b.rr + k + 1) % dirs.length;
      return;
    }
  }
}

export function updateTransport(sim) {
  for (const b of sim.transportOrder) {
    if (b.dead || b.building > 0) continue;
    if (b.type === 'belt') updateBelt(sim, b);
    else if (b.type === 'junction') updateJunction(sim, b);
    else updateRouter(sim, b);
  }
}

/**
 * Downstream-first update order, so a full belt moves as one piece instead of opening gaps at every
 * tile boundary. Recomputed whenever something is built or removed.
 */
export function computeTransportOrder(sim) {
  const list = sim.buildings.filter((b) => TRANSPORT.has(b.type));
  const depth = new Map();
  const visiting = new Set();
  const depthOf = (b) => {
    if (depth.has(b.id)) return depth.get(b.id);
    if (b.type !== 'belt' || visiting.has(b.id)) return 0;
    visiting.add(b.id);
    const next = tileAhead(sim, b.x, b.y, b.dir);
    const d = next && TRANSPORT.has(next.type) ? depthOf(next) + 1 : 0;
    visiting.delete(b.id);
    depth.set(b.id, d);
    return d;
  };
  for (const b of list) depthOf(b);
  list.sort((a, b) => depth.get(a.id) - depth.get(b.id) || a.id - b.id);
  sim.transportOrder = list;
}

/** Items currently held by a transport building (for refunds, rendering and hashing). */
export function transportItems(b) {
  if (b.type === 'belt') return b.items;
  if (b.type === 'junction') return b.jq.flat().map((e) => e.it);
  return b.buf ? [b.buf] : [];
}
