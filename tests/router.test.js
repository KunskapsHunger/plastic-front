import { describe, expect, it } from './_expect.js';
import { Sim } from '../src/sim/world.js';
import { routeBelt } from '../src/sim/router.js';
import { TEAM_GREEN } from '../src/shared/constants.js';

describe('belt router', () => {
  it('bridges an existing belt with a junction instead of giving up', () => {
    const sim = new Sim({ seed: 1, players: [{ id: 'g', team: TEAM_GREEN }] });
    sim.teams[TEAM_GREEN].req = 5000;
    // a long vertical wall of belt between the press and the bench
    const wall = [];
    for (let y = 2; y < 42; y++) wall.push([20, y, 1]);
    sim.step([
      { p: 'g', c: { c: 'line', type: 'belt', tiles: wall } },
      { p: 'g', c: { c: 'build', type: 'press', x: 14, y: 14, dir: 0 } },
      { p: 'g', c: { c: 'build', type: 'bench', x: 26, y: 14, dir: 0, recipe: 'rifle' } },
    ]);
    const press = sim.buildingAt(14, 14);
    const bench = sim.buildingAt(26, 14);
    const tiles = routeBelt(sim, TEAM_GREEN, press, bench);
    expect(tiles === null).toBe(false);
    const crossing = tiles.filter((t) => t[3] === 'junction');
    expect(crossing.length).toBe(1);
    sim.step([{ p: 'g', c: { c: 'line', type: 'belt', tiles } }]);
    const j = sim.buildingAt(crossing[0][0], crossing[0][1]);
    expect(j.type).toBe('junction');
    // figures reach the bench across the junction, and the wall keeps flowing
    press.inv = { pellets: 4 };
    for (let i = 0; i < 200; i++) sim.step();
    expect(bench.inv.figure || 0).toBeGreaterThan(0);
  });
});
