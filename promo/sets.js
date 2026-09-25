// Scene helpers for the promo films: where things are, and how to stage a proper fight.
import { TEAM_GREEN, TEAM_TAN, laneCenter } from '../src/shared/constants.js';
import { posterArt } from '../src/ui/menu.js';
import { applyCommand } from '../src/sim/commands.js';
import { routeBelt, siteBuilding } from '../src/sim/router.js';

export { TEAM_GREEN, TEAM_TAN };

export const LANE_Y = [laneCenter(0), laneCenter(1), laneCenter(2)];

/** Centre of the first building of a type on a team, or a fallback point. */
export function find(set, type, team = TEAM_GREEN, fallback = [18, 22], where = () => true) {
  const list = set.sim.buildings.filter((b) => b.type === type && b.team === team && !b.dead && where(b));
  if (!list.length) return fallback;
  const b = list[0];
  return [b.x + b.w / 2, b.y + b.h / 2];
}

/** Two armies facing off across a lane at x = cx. */
export function battle(set, lane, cx, green, tan, spread = 1, enemy = TEAM_TAN) {
  const y = LANE_Y[lane];
  const place = (types, team, dir) => types.forEach((type, i) => {
    const col = Math.floor(i / 6);
    const row = (i % 6) - 2.5;
    set.spawn(type, team, lane, cx - dir * (2.5 + col * 1.1 * spread), y + row * 1.5 * spread);
  });
  place(green, TEAM_GREEN, 1);
  place(tan, enemy, -1);
  set.sim.teams[TEAM_GREEN].laneOrders[lane] = 'advance';
  set.sim.teams[enemy].laneOrders[lane] = 'advance';
}

export const many = (type, n) => Array.from({ length: n }, () => type);

/** A column of fresh recruits stepping out of a team's gate. */
export function parade(set, team, lane, n) {
  const g = set.sim.laneEnd(team, lane);
  const fwd = team === TEAM_GREEN ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const x = fwd > 0 ? g.x + g.w + 0.4 + (i % 3) * 0.3 : g.x - 0.4 - (i % 3) * 0.3;
    set.spawn('rifle', team, lane, x, g.y + 0.2 + ((i * 0.53) % 1.6));
  }
}

/** Drop a firecracker shell on a spot (it lands `flight` seconds later). */
export function shell(set, x, y, { team = TEAM_TAN, dmg = 400, splash = 1.4, flight = 0.8, from = 6 } = {}) {
  set.sim.projectiles.push({
    id: set.sim.nextId++, src: 'mortarpit', team, x0: x + from, y0: y - 2, x1: x, y1: y, t: 0, flight, dmg, splash, dtype: 'blast',
  });
}

/** The poster army man (without the caption) as an image for the end card. */
export function loadArt() {
  const svg = posterArt({ caption: false });
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  const img = new Image();
  return new Promise((resolve) => {
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Build a Reclaimer near the HQ, belted into it, so the fallen visibly become War Bonds. */
export function reclaimerLine(set) {
  const sim = set.sim;
  const t = sim.teams[TEAM_GREEN];
  t.req += 2000;
  t.scrap += 500;
  const hq = sim.hq(TEAM_GREEN);
  const spot = siteBuilding(sim, TEAM_GREEN, 'reclaimer', hq.x + 8, hq.y + 3, hq.x + 2, hq.y + 3, { maxR: 10 });
  if (!spot) return;
  applyCommand(sim, 'g', { c: 'build', type: 'reclaimer', x: spot.x, y: spot.y, dir: spot.dir });
  const r = sim.buildingAt(spot.x, spot.y);
  r.building = 0;
  const tiles = routeBelt(sim, TEAM_GREEN, r, hq);
  if (tiles) applyCommand(sim, 'g', { c: 'line', type: 'belt', tiles });
  for (let i = 0; i < 200; i++) sim.step();
}
