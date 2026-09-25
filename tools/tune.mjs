#!/usr/bin/env node
// Balance harness: pits AI commanders against each other headlessly and prints a war diary.
//   node tools/tune.mjs [games=4] [minutes=40] [green=normal] [tan=normal] [mode=skirmish]
import { Sim } from '../src/sim/world.js';
import { TEAM_GREEN, TEAM_TAN, TICK_RATE } from '../src/shared/constants.js';

const [games = 4, minutes = 40, lg = 'normal', lt = 'normal', mode = 'skirmish'] = process.argv.slice(2);
const results = [];
for (let g = 0; g < Number(games); g++) {
  const players = mode === 'bughunt'
    ? [{ id: 'a', name: 'A', team: TEAM_GREEN, ai: lg }]
    : [{ id: 'a', name: 'A', team: TEAM_GREEN, ai: lg }, { id: 'b', name: 'B', team: TEAM_TAN, ai: lt }];
  const sim = new Sim({ seed: 1000 + g * 77, mode, players, difficulty: lt });
  const diary = [];
  const t0 = performance.now();
  let peakUnits = 0;
  for (let i = 0; i < Number(minutes) * 60 * TICK_RATE && !sim.over; i++) {
    sim.step();
    peakUnits = Math.max(peakUnits, sim.units.length);
    for (const ev of sim.events) {
      const min = (sim.tick / TICK_RATE / 60).toFixed(1);
      if (ev.e === 'breach') diary.push(`${min}m breach ${['G', 'T', 'S'][ev.team]}${ev.lane}`);
      if (ev.e === 'research') diary.push(`${min}m ${['G', 'T'][ev.team]}:${ev.tech}`);
      if (ev.e === 'wave' && ev.n % 3 === 0) diary.push(`${min}m wave ${ev.n}`);
    }
    const first = sim.teams.map((t) => t.deployed > 0);
    if (i % (TICK_RATE * 60) === 0 && i) diary.push(`${(i / 1200).toFixed(0)}m units G${sim.teams[0].unitCount}/T${sim.teams[1].unitCount}/S${sim.teams[2].unitCount} req G${sim.teams[0].req | 0}/T${sim.teams[1].req | 0}`);
    void first;
  }
  const ms = performance.now() - t0;
  const G = sim.teams[0];
  const T = sim.teams[mode === 'bughunt' ? 2 : 1];
  results.push({ over: sim.over, winner: sim.winner, min: sim.tick / TICK_RATE / 60 });
  console.log(`\n=== game ${g}: winner=${sim.winner} after ${(sim.tick / TICK_RATE / 60).toFixed(1)} min (${(ms / 1000).toFixed(1)}s cpu, ${(ms / sim.tick).toFixed(2)} ms/tick, peak ${peakUnits} units)`);
  console.log(`G dep=${G.deployed} cas=${G.casualties} kills=${G.kills} benches=${sim.buildings.filter((b) => b.team === 0 && b.type === 'bench').length}`);
  console.log(`E dep=${T.deployed} cas=${T.casualties} kills=${T.kills} benches=${sim.buildings.filter((b) => b.team === 1 && b.type === 'bench').length}`);
  console.log(diary.join(' | '));
}
const done = results.filter((r) => r.over);
console.log(`\n${done.length}/${results.length} finished; avg ${(done.reduce((a, r) => a + r.min, 0) / (done.length || 1)).toFixed(1)} min; green wins ${results.filter((r) => r.winner === 0).length}`);
