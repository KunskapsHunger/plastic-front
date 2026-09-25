// Global constants shared by the simulation, the client and the netcode.

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
/** Peers exchange a state hash this often (ticks). */
export const HASH_INTERVAL = 40;

export const MAP_W = 136;
export const MAP_H = 44;
export const FACTORY_W = 36;
export const FIELD_X0 = FACTORY_W; // first battlefield column
export const FIELD_X1 = MAP_W - FACTORY_W; // first column of the far factory

export const TEAM_GREEN = 0;
export const TEAM_TAN = 1;
export const TEAM_SWARM = 2;
export const TEAMS = [TEAM_GREEN, TEAM_TAN];
export const TEAM_NAMES = ['Green', 'Tan', 'Swarm'];

export const MODE_SKIRMISH = 'skirmish';
export const MODE_BUGHUNT = 'bughunt';

/** Directions: 0 east, 1 south, 2 west, 3 north. */
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
export const opposite = (d) => (d + 2) & 3;
export const left = (d) => (d + 3) & 3;
export const right = (d) => (d + 1) & 3;

export const LANES = [
  { y0: 1, y1: 13 },
  { y0: 16, y1: 28 },
  { y0: 31, y1: 43 },
];
export const laneCenter = (lane) => (LANES[lane].y0 + LANES[lane].y1) / 2;

export const START_REQUISITION = 400;
export const ALLOWANCE_PER_SEC = 4;
export const MAX_UNITS_PER_TEAM = 220;
