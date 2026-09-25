// Bug Hunt: the Swarm spends a growing budget on waves that pour out of three burrows.
// Destroy the burrows to choke the waves, then burn out the Hive.
import { TEAM_GREEN, TEAM_SWARM, TICK_RATE } from '../shared/constants.js';
import { spawnUnit } from './army.js';

const GRACE = 100 * TICK_RATE; // first wave arrives after the factory has had time to start
const WAVE_EVERY = 42 * TICK_RATE;
const TRICKLE_EVERY = 11 * TICK_RATE;
const SPAWN_GAP = 5; // ticks between bugs leaving one burrow
const QUEEN_WAVE = 12;

const COSTS = [
  { type: 'ant', cost: 1, from: 1 },
  { type: 'spider', cost: 3, from: 3 },
  { type: 'bombardier', cost: 4, from: 4 },
  { type: 'beetle', cost: 6, from: 5 },
  { type: 'wasp', cost: 3, from: 7 },
];

const DIFFICULTY = { easy: 0.7, normal: 1, hard: 1.4 };

export function createSwarm(sim) {
  const humans = [...sim.players.values()].filter((p) => p.team === TEAM_GREEN).length || 1;
  const scale = (1 + 0.55 * (humans - 1)) * (DIFFICULTY[sim.difficulty] || 1);
  return {
    wave: 0,
    nextWave: GRACE,
    nextTrickle: GRACE + TRICKLE_EVERY,
    queues: [[], [], []],
    cooldown: [0, 0, 0],
    queenOut: false,
    scale,

    /** Ticks until the next wave (for the HUD). */
    eta(s) {
      return Math.max(0, this.nextWave - s.tick);
    },

    liveLanes(s) {
      return [0, 1, 2].filter((l) => !s.laneEnd(TEAM_SWARM, l).dead);
    },

    enqueue(s, types) {
      const lanes = this.liveLanes(s);
      const pool = lanes.length ? lanes : [0, 1, 2];
      types.forEach((t, i) => this.queues[pool[(i + s.tick) % pool.length]].push(t));
    },

    composeWave(s, n) {
      let budget = Math.round((8 + n * 5 + n * n * 0.35) * this.scale);
      const menu = COSTS.filter((c) => n >= c.from);
      const out = [];
      while (budget > 0) {
        const affordable = menu.filter((c) => c.cost <= budget);
        if (!affordable.length) break;
        // heavier bugs get likelier as waves climb
        const pick = s.rng.next() < 0.45 ? affordable[affordable.length - 1] : s.rng.pick(affordable);
        out.push(pick.type);
        budget -= pick.cost;
      }
      return out;
    },

    update(s) {
      if (s.tick >= this.nextWave) {
        this.wave++;
        this.nextWave = s.tick + WAVE_EVERY;
        this.enqueue(s, this.composeWave(s, this.wave));
        s.events.push({ e: 'wave', n: this.wave });
      }
      if (s.tick >= this.nextTrickle) {
        this.nextTrickle = s.tick + TRICKLE_EVERY;
        const n = 2 + Math.floor(this.wave / 2);
        this.enqueue(s, Array.from({ length: n }, () => 'ant'));
      }
      const hive = s.hq(TEAM_SWARM);
      if (!this.queenOut && (this.wave >= QUEEN_WAVE || hive.hp < hive.maxHp * 0.5)) {
        this.queenOut = true;
        const u = spawnUnit(s, 'queen', TEAM_SWARM, 1, hive.x - 0.5, hive.y + hive.h / 2);
        u.lane = 1;
        s.events.push({ e: 'queen' });
      }
      for (let lane = 0; lane < 3; lane++) {
        const q = this.queues[lane];
        if (!q.length) continue;
        if (this.cooldown[lane] > 0) {
          this.cooldown[lane]--;
          continue;
        }
        let burrow = s.laneEnd(TEAM_SWARM, lane);
        if (burrow.dead) {
          const live = this.liveLanes(s);
          if (live.length) {
            this.queues[live[lane % live.length]].push(...q.splice(0));
            continue;
          }
          burrow = hive;
        }
        const type = q.shift();
        const x = burrow === hive ? hive.x - 0.5 : burrow.x - 0.4;
        const y = burrow.y + burrow.h / 2 + s.rng.range(-0.9, 0.9);
        spawnUnit(s, type, TEAM_SWARM, lane, x, y);
        this.cooldown[lane] = SPAWN_GAP;
      }
    },
  };
}
