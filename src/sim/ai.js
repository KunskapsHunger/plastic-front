// AI commanders. They play by the same rules as people: they issue the same commands, pay the same
// prices and wait for the same research. They live inside the simulation, so every peer runs the
// identical general and nothing needs to be sent over the network.
import { FIELD_X0, FIELD_X1, LANES, TEAM_GREEN, TICK_RATE } from '../shared/constants.js';
import { BUILDINGS, RECIPES } from '../shared/buildings.js';
import { TECHS, techAvailable } from '../shared/tech.js';
import { D_PELLETS, D_POWDER, D_TIN } from '../shared/map.js';
import { applyCommand } from './commands.js';
import { blockSet, routeBelt, siteCandidates, siteScoop } from './router.js';

const LEVELS = {
  easy: { every: 4 * TICK_RATE, start: 45 * TICK_RATE, income: 0.85, lines: 4, orders: false },
  normal: { every: 2 * TICK_RATE, start: 20 * TICK_RATE, income: 1, lines: 7, orders: true },
  hard: { every: 0.75 * TICK_RATE, start: 5 * TICK_RATE, income: 1.25, lines: 10, orders: true },
};

/** What feeds each ingredient: [machine, recipe, deposit]. */
const PRODUCER = {
  figure: ['press', 'figure', D_PELLETS],
  caps: ['mill', 'caps', D_POWDER],
  firecracker: ['mill', 'firecracker', D_POWDER],
  plate: ['tinworks', 'plate', D_TIN],
  spring: ['tinworks', 'spring', D_TIN],
};

/** The order a general researches in, and the unit lines each program opens up. */
const RESEARCH = ['tin', 'fireworks', 'hp1', 'windup', 'artillery', 'glue', 'kitchen', 'dmg1', 'drills2', 'bench2', 'belts2', 'air', 'colossus', 'sorting', 'reclaim'];
const LINES = [
  { recipe: 'rifle', lane: 1 },
  { recipe: 'rifle', lane: 0 },
  { recipe: 'rifle', lane: 2 },
  { recipe: 'mg', lane: 1 },
  { recipe: 'grenadier', lane: 0 },
  { recipe: 'tank', lane: 2 },
  { recipe: 'mortar', lane: 1 },
  { recipe: 'medic', lane: 0 },
  { recipe: 'flamer', lane: 2 },
  { recipe: 'plane', lane: 1 },
  { recipe: 'colossus', lane: 1 },
];

const STALL_LIMIT = 40; // failed attempts before a step is abandoned

export function createAI(sim, player) {
  return new Commander(sim, player);
}

class Commander {
  constructor(sim, player) {
    this.id = player.id;
    this.team = player.team;
    this.level = LEVELS[player.ai] || LEVELS.normal;
    // a general only boosts the income of a team with no humans on it
    const humans = [...sim.players.values()].some((p) => p.team === this.team && !p.ai && p.id !== this.id);
    if (!humans) sim.teams[this.team].allowanceMult = this.level.income;
    this.next = this.level.start;
    this.queue = LINES.map((l) => ({ ...l }));
    this.made = [];
    this.current = null;
    this.steps = [];
    this.stall = 0;
    this.built = 0;
    this.researchIndex = 0;
  }

  cmd(sim, c) {
    applyCommand(sim, this.id, c);
  }

  update(sim) {
    if (sim.tick < this.next || sim.teams[this.team].defeated) return;
    this.next = sim.tick + this.level.every;
    this.research(sim);
    if (this.level.orders) this.orders(sim);
    this.rebuild(sim);
    this.build(sim);
  }

  // ------------------------------------------------------------------ research + orders

  research(sim) {
    const t = sim.teams[this.team];
    for (let i = this.researchIndex; i < RESEARCH.length; i++) {
      const id = RESEARCH[i];
      if (t.researched.has(id)) {
        if (i === this.researchIndex) this.researchIndex++;
        continue;
      }
      if (!techAvailable(t.researched, id)) continue;
      if (t.glory >= TECHS[id].cost) this.cmd(sim, { c: 'research', tech: id });
      return; // save up for the next program in line
    }
  }

  orders(sim) {
    const counts = LANES.map(() => ({ ours: 0, theirs: 0 }));
    for (const u of sim.units) {
      if (u.x < FIELD_X0 || u.x >= FIELD_X1 || u.lane < 0) continue;
      if (u.team === this.team) counts[u.lane].ours++;
      else counts[u.lane].theirs++;
    }
    const t = sim.teams[this.team];
    counts.forEach(({ ours, theirs }, lane) => {
      const cur = t.laneOrders[lane];
      let want = cur;
      if (ours < 8 && theirs > ours + 4) want = 'hold';
      else if (ours >= 14 || ours > theirs * 1.4 + 2) want = 'advance';
      if (want !== cur) this.cmd(sim, { c: 'order', lane, order: want });
    });
  }

  rebuild(sim) {
    for (let lane = 0; lane < LANES.length; lane++) {
      const g = sim.laneEnd(this.team, lane);
      if (g.dead && sim.teams[this.team].req >= BUILDINGS.gate.cost) this.cmd(sim, { c: 'rebuild', lane });
    }
  }

  // ------------------------------------------------------------------ building

  build(sim) {
    const t = sim.teams[this.team];
    if (!this.steps.length) {
      if (this.built >= this.level.lines || !this.queue.length) return;
      const line = this.queue[0];
      const recipe = RECIPES[line.recipe];
      if (recipe.tech && !t.researched.has(recipe.tech)) return; // wait for the program
      this.queue.shift();
      this.current = line;
      this.made = [];
      this.steps = this.planLine(sim, line);
      this.stall = 0;
    }
    const step = this.steps[0];
    const done = step.run(sim);
    if (done === true) {
      this.steps.shift();
      this.stall = 0;
      if (!this.steps.length) this.built++;
    } else if (done === 'abort' || ++this.stall > STALL_LIMIT) {
      this.abandon(sim);
    }
  }

  /** Tear down a half-built line (for the refund) and try it again later, a limited number of times. */
  abandon(sim) {
    const tiles = [];
    for (const m of this.made) {
      if (Array.isArray(m)) tiles.push(...m.map(([x, y]) => [x, y]));
      else if (!m.removed) tiles.push([m.x, m.y]);
    }
    if (tiles.length) this.cmd(sim, { c: 'remove', tiles });
    this.steps = [];
    const line = this.current;
    line.tries = (line.tries || 0) + 1;
    if (line.tries < 3) this.queue.push(line);
  }

  /** A production line: bench by the gate; per ingredient a scoop on ore and a machine, all belted up. */
  planLine(sim, line) {
    const fwd = this.team === TEAM_GREEN ? 1 : -1;
    const gate = sim.laneEnd(this.team, line.lane);
    const recipe = RECIPES[line.recipe];
    const ctx = { bench: null };
    const steps = [];
    steps.push(this.siteStep('bench', line.recipe, () => ({
      near: [gate.x + 1 - fwd * 6, gate.y + 1], face: [gate.x + 1, gate.y + 1], from: null, to: gate,
    }), (b) => {
      ctx.bench = b;
    }));
    for (const item of Object.keys(recipe.in)) {
      const [type, rec, deposit] = PRODUCER[item];
      let scoop = null;
      steps.push({
        run: (s) => {
          if (s.teams[this.team].req < BUILDINGS.scoop.cost) return false;
          const bx = ctx.bench.x + 1.5;
          const by = ctx.bench.y + 1.5;
          const spot = siteScoop(s, this.team, deposit, bx, by, bx, by);
          if (!spot) return 'abort';
          this.cmd(s, { c: 'build', type: 'scoop', x: spot.x, y: spot.y, dir: spot.dir });
          const b = s.buildingAt(spot.x, spot.y);
          if (!b || b.type !== 'scoop') return false;
          scoop = b;
          this.made.push(b);
          return true;
        },
      });
      steps.push(this.siteStep(type, rec, () => {
        const bx = ctx.bench.x + 1.5;
        const by = ctx.bench.y + 1.5;
        const sx = scoop.x + 1;
        const sy = scoop.y + 1;
        return { near: [sx + (bx - sx) * 0.45, sy + (by - sy) * 0.45], face: [bx, by], from: scoop, to: ctx.bench };
      }, () => {}));
    }
    return steps;
  }

  /**
   * Place a machine together with the belts into and out of it, trying candidate spots until one
   * where both routes exist. Everything is paid for up front, so nothing is left half-connected.
   */
  siteStep(type, recipe, where, onBuilt) {
    return {
      run: (sim) => {
        const t = sim.teams[this.team];
        if (t.req < BUILDINGS[type].cost + 40) return false;
        const w = where();
        const def = BUILDINGS[type];
        const cands = siteCandidates(sim, this.team, type, w.near[0], w.near[1], w.face[0], w.face[1], { count: 30, maxR: 18 });
        for (const c of cands) {
          const v = { x: c.x, y: c.y, w: def.w, h: def.h, dir: c.dir };
          let inRoute = null;
          if (w.from) {
            const blocked = blockSet([v]);
            blocked.planned = [v];
            inRoute = routeBelt(sim, this.team, w.from, v, blocked);
            if (!inRoute) continue;
          }
          const blocked = blockSet([v, ...(inRoute || [])]);
          blocked.planned = [v];
          const outRoute = routeBelt(sim, this.team, v, w.to, blocked);
          if (!outRoute) continue;
          const cost = def.cost + ((inRoute?.length || 0) + outRoute.length) * BUILDINGS.junction.cost;
          if (t.req < cost) return false;
          this.cmd(sim, { c: 'build', type, x: c.x, y: c.y, dir: c.dir, recipe });
          const b = sim.buildingAt(c.x, c.y);
          if (!b || b.type !== type) return false;
          this.made.push(b);
          if (inRoute) {
            this.cmd(sim, { c: 'line', type: 'belt', tiles: inRoute });
            this.made.push(inRoute);
          }
          this.cmd(sim, { c: 'line', type: 'belt', tiles: outRoute });
          this.made.push(outRoute);
          onBuilt(b);
          return true;
        }
        return 'abort';
      },
    };
  }
}
