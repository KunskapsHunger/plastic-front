// The playroom layout. Fixed and mirrored, so every match is fair and the AI's plans always fit.
// Everything is authored for the Green side (left) and mirrored for Tan (right).
import { FACTORY_W, FIELD_X0, FIELD_X1, LANES, MAP_H, MAP_W, MODE_BUGHUNT, TEAM_GREEN, TEAM_SWARM, TEAM_TAN } from './constants.js';

export const T_FLOOR = 0; // buildable factory floor
export const T_FIELD = 1; // the sandbox (walkable, not buildable)
export const T_WALL = 2; // block walls between lanes
export const T_YARD = 3; // the backyard (Bug Hunt)

export const D_NONE = 0;
export const D_PELLETS = 1;
export const D_TIN = 2;
export const D_POWDER = 3;
export const DEPOSIT_ITEM = [null, 'pellets', 'tin', 'powder'];

/** Deposits on the Green side as [kind, x, y, w, h]. */
const GREEN_DEPOSITS = [
  [D_PELLETS, 7, 3, 5, 5],
  [D_PELLETS, 7, 36, 5, 5],
  [D_POWDER, 15, 19, 4, 6],
  [D_TIN, 22, 9, 4, 4],
  [D_TIN, 22, 31, 4, 4],
  [D_PELLETS, 27, 20, 3, 4],
  [D_POWDER, 13, 10, 4, 3],
  [D_POWDER, 13, 31, 4, 3],
];

export const HQ_RECT = { x: 1, y: 19, w: 4, h: 6 };
export const GATE_RECTS = LANES.map((l) => ({ x: FACTORY_W - 2, y: Math.round((l.y0 + l.y1) / 2) - 1, w: 2, h: 2 }));

/** Mirror a Green-side rect onto the Tan side. */
export function mirrorRect(r) {
  return { ...r, x: MAP_W - r.x - r.w };
}

export const idx = (x, y) => y * MAP_W + x;
export const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

/** Which team may build on column x (-1 for nobody). */
export function zoneTeam(x) {
  if (x < FACTORY_W) return TEAM_GREEN;
  if (x >= FIELD_X1) return TEAM_TAN;
  return -1;
}

export function isFieldColumn(x) {
  return x >= FIELD_X0 && x < FIELD_X1;
}

export function laneAt(y) {
  for (let i = 0; i < LANES.length; i++) if (y >= LANES[i].y0 && y < LANES[i].y1) return i;
  return -1;
}

/**
 * Build the static layout.
 * @returns {{terrain: Uint8Array, deposits: Uint8Array, structures: Array<{type, team, x, y, w, h, lane?}>}}
 */
export function buildMap(mode) {
  const terrain = new Uint8Array(MAP_W * MAP_H);
  const deposits = new Uint8Array(MAP_W * MAP_H);
  const bughunt = mode === MODE_BUGHUNT;

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      let t = T_FLOOR;
      if (isFieldColumn(x)) t = laneAt(y) >= 0 ? T_FIELD : T_WALL;
      else if (bughunt && x >= FIELD_X1) t = T_YARD;
      terrain[idx(x, y)] = t;
    }
  }

  const stamp = ([kind, x, y, w, h], mirror) => {
    const r = mirror ? mirrorRect({ x, y, w, h }) : { x, y, w, h };
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) deposits[idx(xx, yy)] = kind;
  };
  for (const d of GREEN_DEPOSITS) {
    stamp(d, false);
    if (!bughunt) stamp(d, true);
  }

  const structures = [{ type: 'hq', team: TEAM_GREEN, ...HQ_RECT }];
  GATE_RECTS.forEach((r, lane) => structures.push({ type: 'gate', team: TEAM_GREEN, lane, ...r }));
  if (bughunt) {
    structures.push({ type: 'hive', team: TEAM_SWARM, ...mirrorRect(HQ_RECT) });
    GATE_RECTS.forEach((r, lane) => structures.push({ type: 'burrow', team: TEAM_SWARM, lane, ...mirrorRect(r) }));
  } else {
    structures.push({ type: 'hq', team: TEAM_TAN, ...mirrorRect(HQ_RECT) });
    GATE_RECTS.forEach((r, lane) => structures.push({ type: 'gate', team: TEAM_TAN, lane, ...mirrorRect(r) }));
  }
  return { terrain, deposits, structures };
}

/** The x coordinate a team's units treat as "forward" (+1 for Green, -1 for everyone on the right). */
export const forwardOf = (team) => (team === TEAM_GREEN ? 1 : -1);
