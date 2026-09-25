// The deterministic simulation. Every peer owns one Sim, feeds it identical command bundles, and
// therefore holds an identical war. Nothing in here may read the clock or Math.random.
import {
  ALLOWANCE_PER_SEC, DT, MAP_H, MAP_W, MODE_BUGHUNT, START_REQUISITION, TEAM_GREEN, TEAM_SWARM, TEAM_TAN,
} from '../shared/constants.js';
import { BELT_SPEED, BUILDINGS } from '../shared/buildings.js';
import { UNITS } from '../shared/units.js';
import { Rng, mix } from '../shared/rng.js';
import { buildMap, idx, inMap } from '../shared/map.js';
import { computeTransportOrder, initTransport, TRANSPORT, transportItems, updateTransport } from './transport.js';
import { initProduction, updateProduction } from './production.js';
import { buildSpatial, updateArmy } from './army.js';
import { mitigate, updateProjectiles } from './combat.js';
import { applyCommand } from './commands.js';
import { createAI } from './ai.js';
import { createSwarm } from './swarm.js';

function makeTeam(id, active) {
  return {
    id, active, req: active ? START_REQUISITION : 0, glory: 0, scrap: 0, researched: new Set(),
    laneOrders: ['advance', 'advance', 'advance'], unitCount: 0, deployed: 0, casualties: 0, kills: 0, bonds: 0,
    hpMult: 1, dmgMult: 1, drillMult: 1, benchMult: 1, beltStep: BELT_SPEED * DT, defeated: false,
    structuresLost: 0, researchLog: [],
  };
}

export class Sim {
  /**
   * @param {{seed:number, mode:string, players:Array<{id:string, name:string, team:number, ai?:string}>}} cfg
   */
  constructor({ seed = 1, mode = 'skirmish', players = [], difficulty = 'normal' } = {}) {
    this.seed = seed;
    this.difficulty = difficulty;
    this.mode = mode;
    this.tick = 0;
    this.rng = new Rng(seed);
    this.nextId = 1;
    this.map = buildMap(mode);
    this.grid = new Int32Array(MAP_W * MAP_H);
    this.buildings = [];
    this.byId = new Map();
    this.units = [];
    this.projectiles = [];
    this.events = [];
    this.transportOrder = [];
    this.transportDirty = false;
    this.pings = [];
    this.over = false;
    this.winner = -1;
    const bughunt = mode === MODE_BUGHUNT;
    this.teams = [makeTeam(TEAM_GREEN, true), makeTeam(TEAM_TAN, !bughunt), makeTeam(TEAM_SWARM, bughunt)];
    this.players = new Map();
    for (const p of players) this.players.set(p.id, { ...p });
    this.laneEnds = [[], [], []];
    this.hqs = [null, null, null];
    for (const s of this.map.structures) {
      const b = this.addBuilding(s.team, null, s.type, s.x, s.y, 0, { lane: s.lane, instant: true });
      if (s.type === 'gate' || s.type === 'burrow') this.laneEnds[s.team][s.lane] = b;
      else this.hqs[s.team] = b;
    }
    // AI commanders are part of the simulation, so they cost no bandwidth and never desync.
    this.ais = players.filter((p) => p.ai).map((p) => createAI(this, p));
    this.swarm = bughunt ? createSwarm(this) : null;
    computeTransportOrder(this);
  }

  // ------------------------------------------------------------------ queries

  buildingAt(x, y) {
    if (!inMap(x, y)) return null;
    const id = this.grid[idx(x, y)];
    return id ? this.byId.get(id) : null;
  }

  hostile(a, b) {
    return a !== b && a >= 0 && b >= 0;
  }

  enemiesOf(team) {
    if (this.mode === MODE_BUGHUNT) return team === TEAM_SWARM ? [TEAM_GREEN] : [TEAM_SWARM];
    return team === TEAM_GREEN ? [TEAM_TAN] : [TEAM_GREEN];
  }

  /** Team whose base sits on side 0 (left) or 1 (right). */
  teamOnSide(side) {
    if (side === 0) return TEAM_GREEN;
    return this.mode === MODE_BUGHUNT ? TEAM_SWARM : TEAM_TAN;
  }

  laneEnd(team, lane) {
    return this.laneEnds[team]?.[lane] || null;
  }

  hq(team) {
    return this.hqs[team];
  }

  teamOf(playerId) {
    return this.players.get(playerId)?.team ?? -1;
  }

  // ------------------------------------------------------------------ buildings

  addBuilding(team, owner, type, x, y, dir, opts = {}) {
    const def = BUILDINGS[type];
    const b = {
      id: this.nextId++, type, team, owner, x, y, w: def.w, h: def.h, dir: dir & 3, hp: def.hp, maxHp: def.hp,
      dead: false, lane: opts.lane ?? -1, building: 0, recipe: opts.recipe || null, filter: opts.filter || null,
    };
    if (!opts.instant) b.building = def.w * def.h <= 1 ? 0 : def.w * def.h <= 4 ? 20 : 40;
    if (TRANSPORT.has(type)) initTransport(b);
    else initProduction(this, b);
    this.buildings.push(b);
    this.byId.set(b.id, b);
    for (let yy = y; yy < y + b.h; yy++) for (let xx = x; xx < x + b.w; xx++) this.grid[idx(xx, yy)] = b.id;
    this.transportDirty = true;
    return b;
  }

  removeBuilding(b) {
    for (let yy = b.y; yy < b.y + b.h; yy++) {
      for (let xx = b.x; xx < b.x + b.w; xx++) if (this.grid[idx(xx, yy)] === b.id) this.grid[idx(xx, yy)] = 0;
    }
    this.byId.delete(b.id);
    const i = this.buildings.indexOf(b);
    if (i >= 0) this.buildings.splice(i, 1);
    b.removed = true;
    this.transportDirty = true;
  }

  /** Items inside a building (for the renderer and hashing). */
  heldItems(b) {
    return TRANSPORT.has(b.type) ? transportItems(b) : [];
  }

  // ------------------------------------------------------------------ damage & rewards

  damageUnit(u, amount, dtype, srcTeam, src) {
    if (u.dead) return;
    const def = UNITS[u.type];
    u.hp -= mitigate(def, amount, dtype);
    u.lastHit = dtype;
    if (u.hp > 0) return;
    u.dead = true;
    const victim = this.teams[u.team];
    victim.casualties++;
    victim.unitCount--;
    if (u.team !== TEAM_SWARM) {
      victim.glory += def.glory * 0.5; // the Federation honours every sacrifice
      victim.scrap += def.vehicle ? 4 : 2;
    }
    const killer = this.teams[srcTeam];
    if (killer && srcTeam !== u.team) {
      killer.req += def.bounty;
      killer.glory += def.glory;
      killer.kills++;
      if (!def.bug) killer.scrap += 1;
    }
    this.events.push({
      e: 'death', type: u.type, team: u.team, x: u.x, y: u.y, dtype, src, facing: u.facing, air: u.air, id: u.id,
    });
  }

  damageBuilding(b, amount, dtype, srcTeam) {
    if (b.dead || b.removed) return;
    b.hp -= amount;
    b.hitTick = this.tick;
    if (b.hp > 0) return;
    const def = BUILDINGS[b.type];
    const killer = this.teams[srcTeam];
    if (killer && srcTeam !== b.team) {
      killer.glory += def.fixed ? 10 : 1;
      killer.req += Math.round((def.cost || 100) * 0.25);
    }
    this.teams[b.team].structuresLost++;
    this.events.push({ e: 'bdeath', type: b.type, team: b.team, x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h });
    if (def.fixed) {
      b.dead = true;
      b.hp = 0;
      if (b.type === 'gate' || b.type === 'burrow') {
        b.queue = [];
        this.events.push({ e: 'breach', team: b.team, lane: b.lane });
      }
      if (b.type === 'hq' || b.type === 'hive') {
        this.teams[b.team].defeated = true;
        this.checkVictory();
      }
      if (b.type === 'burrow') this.checkVictory();
    } else {
      this.removeBuilding(b);
    }
  }

  reapUnits() {
    if (!this.units.some((u) => u.dead)) return;
    this.units = this.units.filter((u) => !u.dead);
  }

  checkVictory() {
    if (this.over) return;
    if (this.mode === MODE_BUGHUNT) {
      if (this.teams[TEAM_GREEN].defeated) this.finish(TEAM_SWARM);
      else if (this.hqs[TEAM_SWARM].dead) this.finish(TEAM_GREEN);
      return;
    }
    if (this.teams[TEAM_GREEN].defeated) this.finish(TEAM_TAN);
    else if (this.teams[TEAM_TAN].defeated) this.finish(TEAM_GREEN);
  }

  finish(winner) {
    this.over = true;
    this.winner = winner;
    this.events.push({ e: 'gameover', winner });
  }

  // ------------------------------------------------------------------ the tick

  /** Advance one tick with the given commands ([{p: playerId, c: command}]). */
  step(cmds = []) {
    this.events = [];
    for (const cmd of cmds) {
      try {
        applyCommand(this, cmd.p, cmd.c);
      } catch (err) {
        // A malformed command from a peer must not break determinism: every peer skips it alike.
        this.events.push({ e: 'error', msg: String(err?.message || err) });
      }
    }
    if (this.over) {
      this.tick++;
      return;
    }
    for (const t of this.teams) {
      if (t.active && !t.defeated && t.id !== TEAM_SWARM) t.req += ALLOWANCE_PER_SEC * DT * (t.allowanceMult || 1);
    }
    for (const ai of this.ais) ai.update(this);
    this.swarm?.update(this);
    if (this.transportDirty) {
      computeTransportOrder(this);
      this.transportDirty = false;
    }
    buildSpatial(this);
    updateProduction(this);
    // transport runs after production so emitted items start moving the same tick
    updateTransport(this);
    updateArmy(this);
    updateProjectiles(this);
    this.pings = this.pings.filter((p) => p.until > this.tick);
    this.tick++;
  }

  /** Cheap checksum of the whole war, compared across peers to detect desyncs. */
  hash() {
    let h = mix(0x811c9dc5, this.tick);
    h = mix(h, this.nextId);
    h = mix(h, this.rng.state);
    h = mix(h, (this.over ? 1 : 0) + (this.winner + 1) * 2);
    for (const t of this.teams) {
      h = mix(h, Math.round(t.req * 100));
      h = mix(h, Math.round(t.glory * 100));
      h = mix(h, Math.round(t.scrap * 100));
      h = mix(h, t.researched.size + (t.defeated ? 1000 : 0));
      for (const o of t.laneOrders) h = mix(h, o === 'hold' ? 1 : 0);
    }
    for (const u of this.units) {
      h = mix(h, u.id);
      h = mix(h, Math.round(u.x * 256));
      h = mix(h, Math.round(u.y * 256));
      h = mix(h, Math.round(u.hp * 16));
    }
    for (const b of this.buildings) {
      h = mix(h, b.id);
      h = mix(h, Math.round(b.hp * 16));
      h = mix(h, b.dir + (b.dead ? 8 : 0) + (b.building > 0 ? 16 : 0));
      if (b.recipe) h = mix(h, b.recipe.length * 31 + b.recipe.charCodeAt(0));
      if (b.filter) h = mix(h, b.filter.charCodeAt(0));
      if (b.queue) h = mix(h, b.queue.length);
      if (b.inv) for (const k of Object.keys(b.inv).sort()) h = mix(h, b.inv[k]);
      if (b.items) for (const it of b.items) h = mix(h, Math.round(it.pos * 1024));
      if (b.out) h = mix(h, b.out.length);
    }
    for (const p of this.projectiles) h = mix(h, Math.round(p.t * 1000));
    return h >>> 0;
  }
}
