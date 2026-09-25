import { describe, expect, it } from './_expect.js';
import { Sim } from '../src/sim/world.js';
import { MODE_BUGHUNT, TEAM_GREEN, TEAM_SWARM, TEAM_TAN, TICK_RATE } from '../src/shared/constants.js';

describe('Bug Hunt', () => {
  it('sends escalating waves out of the burrows', () => {
    const sim = new Sim({ seed: 3, mode: MODE_BUGHUNT, players: [{ id: 'g', team: TEAM_GREEN, ai: 'normal' }] });
    const seen = new Set();
    for (let i = 0; i < 6 * 60 * TICK_RATE && !sim.over; i++) {
      sim.step();
      for (const u of sim.units) if (u.team === TEAM_SWARM) seen.add(u.type);
    }
    expect(sim.swarm.wave).toBeGreaterThan(4);
    expect(seen.has('ant')).toBe(true);
    expect(seen.size).toBeGreaterThan(2);
    expect(sim.teams[TEAM_GREEN].kills).toBeGreaterThan(20);
  }, 60000);

  it('is won by burning the Hive', () => {
    const sim = new Sim({ seed: 3, mode: MODE_BUGHUNT, players: [{ id: 'g', team: TEAM_GREEN }] });
    sim.damageBuilding(sim.hq(TEAM_SWARM), 1e6, 'fire', TEAM_GREEN);
    expect(sim.over).toBe(true);
    expect(sim.winner).toBe(TEAM_GREEN);
  });
});

describe('routing gadgets', () => {
  const players = [{ id: 'g', team: TEAM_GREEN }];

  it('splitters deal items out and sorters filter them', () => {
    const sim = new Sim({ seed: 1, players });
    sim.teams[TEAM_GREEN].req = 5000;
    sim.teams[TEAM_GREEN].researched.add('sorting');
    sim.step([
      { p: 'g', c: { c: 'line', type: 'belt', tiles: [[14, 20, 0]] } },
      { p: 'g', c: { c: 'build', type: 'splitter', x: 15, y: 20, dir: 0 } },
      { p: 'g', c: { c: 'line', type: 'belt', tiles: [[16, 20, 0], [17, 20, 0]] } },
      { p: 'g', c: { c: 'line', type: 'belt', tiles: [[15, 19, 3], [15, 18, 3]] } },
      { p: 'g', c: { c: 'line', type: 'belt', tiles: [[15, 21, 1], [15, 22, 1]] } },
    ]);
    const feed = sim.buildingAt(14, 20);
    for (let i = 0; i < 120; i++) {
      if (!feed.items.length) feed.items.push({ t: 'caps', pos: 0 });
      sim.step();
    }
    const count = (x, y) => sim.buildingAt(x, y).items.length;
    expect(count(17, 20) + count(16, 20)).toBeGreaterThan(0);
    expect(count(15, 18) + count(15, 19)).toBeGreaterThan(0);
    expect(count(15, 22) + count(15, 21)).toBeGreaterThan(0);

    // swap the splitter for a sorter that only lets tin straight through
    sim.step([{ p: 'g', c: { c: 'remove', tiles: [[15, 20]] } }]);
    sim.step([{ p: 'g', c: { c: 'build', type: 'sorter', x: 15, y: 20, dir: 0 } }]);
    const sorter = sim.buildingAt(15, 20);
    sim.step([{ p: 'g', c: { c: 'filter', id: sorter.id, item: 'tin' } }]);
    sorter.buf = { t: 'caps', pos: 0 };
    const straightBefore = count(16, 20) + count(17, 20);
    sim.step();
    expect(sorter.buf).toBeNull();
    expect(count(16, 20) + count(17, 20)).toBe(straightBefore);
  });

  it('a deserter\'s seat is taken over by an AI general on every peer', () => {
    const sim = new Sim({ seed: 1, players: [{ id: 'g', team: TEAM_GREEN }, { id: 't', team: TEAM_TAN }] });
    sim.step([{ p: '__host', c: { c: 'aiTakeover', id: 't' } }]);
    expect(sim.ais.length).toBe(1);
    expect(sim.players.get('t').ai).toBe('normal');
    // ordinary players can't forge host commands
    sim.step([{ p: 'g', c: { c: 'aiTakeover', id: 'g' } }]);
    expect(sim.ais.length).toBe(1);
  });

  it('ignores malformed commands from peers', () => {
    const sim = new Sim({ seed: 1, players });
    const before = sim.hash();
    const count = sim.buildings.length;
    sim.step([
      { p: 'g', c: null },
      { p: 'g', c: { c: 'build', type: '__proto__', x: 'a', y: {} } },
      { p: 'g', c: { c: 'line', type: 'belt', tiles: 'nope' } },
      { p: 'g', c: { c: 'remove', tiles: [[1e9, -5], null] } },
      { p: 'nobody', c: { c: 'surrender' } },
      { p: 'g', c: { c: 'order', lane: 99, order: 'hold' } },
    ]);
    expect(sim.over).toBe(false);
    expect(sim.hash() === before).toBe(false); // time still passed
    expect(sim.buildings.length).toBe(count);
  });
});
