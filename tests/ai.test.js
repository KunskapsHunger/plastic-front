import { describe, expect, it } from './_expect.js';
import { Sim } from '../src/sim/world.js';
import { TEAM_GREEN, TEAM_TAN, TICK_RATE } from '../src/shared/constants.js';

function aiWar(seed, minutes, levels = ['normal', 'normal']) {
  const sim = new Sim({
    seed,
    players: [
      { id: 'a', name: 'A', team: TEAM_GREEN, ai: levels[0] },
      { id: 'b', name: 'B', team: TEAM_TAN, ai: levels[1] },
    ],
  });
  for (let i = 0; i < minutes * 60 * TICK_RATE && !sim.over; i++) sim.step();
  return sim;
}

describe('AI commanders', () => {
  it('build working production lines on both sides of the map', () => {
    const sim = aiWar(3, 3);
    for (const team of [TEAM_GREEN, TEAM_TAN]) {
      const t = sim.teams[team];
      const benches = sim.buildings.filter((b) => b.team === team && b.type === 'bench');
      expect(benches.length).toBeGreaterThan(1);
      expect(t.deployed).toBeGreaterThan(10);
    }
  }, 60000);

  it('fight a whole war to a finish', () => {
    const sim = aiWar(5, 40, ['hard', 'easy']);
    const g = sim.teams[TEAM_GREEN];
    const t = sim.teams[TEAM_TAN];
    console.log(`  war: over=${sim.over} winner=${sim.winner} minutes=${(sim.tick / 1200).toFixed(1)} ` +
      `green dep=${g.deployed} cas=${g.casualties} res=${[...g.researched].join(',')} | tan dep=${t.deployed} cas=${t.casualties}`);
    expect(g.casualties + t.casualties).toBeGreaterThan(50);
  }, 240000);
});

describe('lockstep with generals', () => {
  it('two peers running the same AI war stay bit-identical', () => {
    const make = () => new Sim({
      seed: 4242,
      players: [
        { id: 'a', name: 'A', team: TEAM_GREEN, ai: 'hard' },
        { id: 'b', name: 'B', team: TEAM_TAN, ai: 'normal' },
      ],
    });
    const x = make();
    const y = make();
    for (let i = 0; i < 20 * 60 * 4; i++) {
      x.step();
      y.step();
      if (i % 400 === 0) expect(x.hash()).toBe(y.hash());
    }
    expect(x.hash()).toBe(y.hash());
    expect(x.units.length + x.buildings.length).toBeGreaterThan(60);
  }, 120000);
});
