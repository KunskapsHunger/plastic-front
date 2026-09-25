import { describe, expect, it } from './_expect.js';
import { Sim } from '../src/sim/world.js';
import { spawnUnit } from '../src/sim/army.js';
import { placementError } from '../src/sim/commands.js';
import { TEAM_GREEN, TEAM_TAN, TICK_RATE } from '../src/shared/constants.js';

const PLAYERS = [
  { id: 'g', name: 'Green', team: TEAM_GREEN },
  { id: 't', name: 'Tan', team: TEAM_TAN },
];

function newSim(extra = {}) {
  return new Sim({ seed: 7, mode: 'skirmish', players: PLAYERS, ...extra });
}

function run(sim, ticks, cmds = []) {
  sim.step(cmds);
  for (let i = 1; i < ticks; i++) sim.step();
}

describe('placement', () => {
  it('only allows building on your own floor', () => {
    const sim = newSim();
    expect(placementError(sim, TEAM_GREEN, 'belt', 20, 20)).toBeNull();
    expect(placementError(sim, TEAM_GREEN, 'belt', 120, 20)).not.toBe(null);
    expect(placementError(sim, TEAM_TAN, 'belt', 120, 20)).toBeNull();
    expect(placementError(sim, TEAM_GREEN, 'belt', 50, 20)).not.toBe(null); // the sandbox
  });

  it('requires scoops to touch a deposit and blocks overlaps', () => {
    const sim = newSim();
    expect(placementError(sim, TEAM_GREEN, 'scoop', 7, 3)).toBeNull();
    expect(placementError(sim, TEAM_GREEN, 'scoop', 1, 1)).not.toBe(null);
    expect(placementError(sim, TEAM_GREEN, 'belt', 2, 20)).not.toBe(null); // the HQ is there
  });

  it('charges requisition and refuses when broke', () => {
    const sim = newSim();
    const before = sim.teams[TEAM_GREEN].req;
    sim.step([{ p: 'g', c: { c: 'build', type: 'press', x: 14, y: 14, dir: 0 } }]);
    expect(sim.teams[TEAM_GREEN].req).toBeLessThan(before - 79);
    sim.teams[TEAM_GREEN].req = 0;
    sim.step([{ p: 'g', c: { c: 'build', type: 'press', x: 20, y: 14, dir: 0 } }]);
    expect(sim.buildingAt(20, 14)).toBeNull();
  });
});

describe('factory', () => {
  it('scoops pellets onto a belt and the press makes figures', () => {
    const sim = newSim();
    const tiles = [9, 10, 11].map((x) => [x, 3, 0]);
    run(sim, 1, [
      { p: 'g', c: { c: 'build', type: 'scoop', x: 7, y: 3, dir: 0 } },
      { p: 'g', c: { c: 'line', type: 'belt', tiles } },
      { p: 'g', c: { c: 'build', type: 'press', x: 12, y: 3, dir: 0 } },
    ]);
    run(sim, 12 * TICK_RATE);
    const press = sim.buildingAt(12, 3);
    expect(press.type).toBe('press');
    expect(press.crafted || 0).toBeGreaterThan(2);
  });

  it('keeps a saturated belt compressed', () => {
    const sim = newSim();
    const tiles = [];
    for (let x = 14; x < 30; x++) tiles.push([x, 16, 0]);
    run(sim, 1, [{ p: 'g', c: { c: 'line', type: 'belt', tiles } }]);
    const first = sim.buildingAt(14, 16);
    // feed as fast as the belt accepts for a while
    for (let i = 0; i < 200; i++) {
      if (!first.items.length || first.items[first.items.length - 1].pos >= 0.25) {
        first.items.push({ t: 'pellets', pos: 0, ox: 0, oy: 0 });
      }
      sim.step();
    }
    // the end of the line is blocked, so the belt backs up solid without items overlapping
    const xs = [];
    for (let x = 14; x < 30; x++) for (const it of sim.buildingAt(x, 16).items) xs.push(x + it.pos);
    xs.sort((p, q) => p - q);
    expect(sim.buildingAt(22, 16).items.length).toBe(4);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(0.249);
    expect(xs.length).toBeGreaterThan(60);
  });

  it('assembles riflemen that march out of the gate', () => {
    const sim = newSim();
    // bench at (28,5) facing east, outputs into (31,5..7); belt to the top gate at (34,6)
    run(sim, 1, [
      { p: 'g', c: { c: 'build', type: 'bench', x: 28, y: 5, dir: 0, recipe: 'rifle' } },
      { p: 'g', c: { c: 'line', type: 'belt', tiles: [[31, 6, 0], [32, 6, 0], [33, 6, 0]] } },
    ]);
    const bench = sim.buildingAt(28, 5);
    bench.inv = { figure: 2, caps: 4 };
    run(sim, 8 * TICK_RATE);
    const mine = sim.units.filter((u) => u.team === TEAM_GREEN);
    expect(sim.teams[TEAM_GREEN].deployed).toBeGreaterThan(0);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0].type).toBe('rifle');
    expect(mine[0].lane).toBe(0);
  });

  it('turrets consume ammo to shoot', () => {
    const sim = newSim();
    run(sim, 1, [{ p: 'g', c: { c: 'build', type: 'popgun', x: 30, y: 20, dir: 0 } }]);
    const nest = sim.buildingAt(30, 20);
    nest.shots = 3;
    const bug = spawnUnit(sim, 'rifle', TEAM_TAN, 1, 32, 20.5);
    bug.hp = 1000;
    bug.maxHp = 1000;
    run(sim, 3 * TICK_RATE);
    expect(nest.shots).toBe(0);
    expect(bug.hp).toBeLessThan(1000);
  });
});

describe('the front', () => {
  it('kills, pays bounties, and honours the fallen', () => {
    const sim = newSim();
    for (let i = 0; i < 6; i++) spawnUnit(sim, 'rifle', TEAM_GREEN, 1, 60, 20 + i);
    for (let i = 0; i < 3; i++) spawnUnit(sim, 'rifle', TEAM_TAN, 1, 64, 20 + i);
    run(sim, 30 * TICK_RATE);
    const g = sim.teams[TEAM_GREEN];
    const t = sim.teams[TEAM_TAN];
    expect(t.casualties).toBe(3);
    expect(g.kills).toBe(3);
    expect(g.glory).toBeGreaterThan(2);
    expect(t.glory).toBeGreaterThan(0); // heroic sacrifice
    expect(t.scrap).toBeGreaterThan(5);
  });

  it('breaches a gate and marches on the HQ', () => {
    const sim = newSim();
    for (let i = 0; i < 40; i++) {
      const u = spawnUnit(sim, 'rifle', TEAM_TAN, 0, 40 + (i % 5), 3 + (i % 8));
      u.hp = u.maxHp = 1500;
    }
    const gate = sim.laneEnd(TEAM_GREEN, 0);
    run(sim, 90 * TICK_RATE);
    expect(gate.dead).toBe(true);
    const inside = sim.units.filter((u) => u.team === TEAM_TAN && u.x < 34);
    expect(inside.length).toBeGreaterThan(0);
    expect(sim.hq(TEAM_GREEN).hp).toBeLessThan(sim.hq(TEAM_GREEN).maxHp);
  });

  it('never lets units walk through a standing gate wall', () => {
    const sim = newSim();
    for (let i = 0; i < 10; i++) spawnUnit(sim, 'tank', TEAM_TAN, 2, 40, 32 + i);
    run(sim, 20 * TICK_RATE);
    const gate = sim.laneEnd(TEAM_GREEN, 2);
    if (!gate.dead) {
      for (const u of sim.units) expect(u.x).toBeGreaterThan(35.5);
    }
  });

  it('hold orders keep units near their own gate', () => {
    const sim = newSim();
    sim.step([{ p: 'g', c: { c: 'order', lane: 1, order: 'hold' } }]);
    const u = spawnUnit(sim, 'rifle', TEAM_GREEN, 1, 37, 22);
    run(sim, 20 * TICK_RATE);
    expect(u.x).toBeLessThan(44);
    sim.step([{ p: 'g', c: { c: 'order', lane: 1, order: 'advance' } }]);
    run(sim, 20 * TICK_RATE);
    expect(u.x).toBeGreaterThan(55);
  });

  it('destroying the HQ ends the war', () => {
    const sim = newSim();
    sim.damageBuilding(sim.hq(TEAM_TAN), 99999, 'blast', TEAM_GREEN);
    expect(sim.over).toBe(true);
    expect(sim.winner).toBe(TEAM_GREEN);
  });
});

describe('research', () => {
  it('spends glory and unlocks recipes', () => {
    const sim = newSim();
    sim.teams[TEAM_GREEN].glory = 20;
    sim.step([{ p: 'g', c: { c: 'research', tech: 'glue' } }]);
    expect(sim.teams[TEAM_GREEN].researched.has('glue')).toBe(false); // needs tin first
    sim.step([{ p: 'g', c: { c: 'research', tech: 'tin' } }]);
    expect(sim.teams[TEAM_GREEN].researched.has('tin')).toBe(true);
    expect(sim.teams[TEAM_GREEN].glory).toBe(8);
    expect(placementError(sim, TEAM_GREEN, 'tinworks', 22, 9)).toBeNull();
  });
});

describe('determinism', () => {
  it('two peers fed the same commands stay identical', () => {
    const a = newSim({ seed: 99 });
    const b = newSim({ seed: 99 });
    const script = (t) => {
      if (t === 1) {
        return [
          { p: 'g', c: { c: 'build', type: 'scoop', x: 7, y: 3, dir: 0 } },
          { p: 'g', c: { c: 'line', type: 'belt', tiles: [[9, 3, 0], [10, 3, 0], [11, 3, 0]] } },
          { p: 'g', c: { c: 'build', type: 'press', x: 12, y: 3, dir: 0 } },
        ];
      }
      return [];
    };
    for (const s of [a, b]) {
      for (let i = 0; i < 20; i++) spawnUnit(s, i % 2 ? 'grenadier' : 'rifle', i % 2, 1, 60 + (i % 7), 18 + (i % 9));
    }
    for (let t = 0; t < 600; t++) {
      a.step(script(t));
      b.step(script(t));
      if (t % 100 === 0) expect(a.hash()).toBe(b.hash());
    }
    expect(a.hash()).toBe(b.hash());
  });
});
