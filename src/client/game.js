// One match on this screen: owns the Sim, plays command bundles from the session in lockstep,
// renders with interpolation, and turns simulation events into sound, scars and propaganda.
import { FIELD_X0, FIELD_X1, HASH_INTERVAL, MODE_BUGHUNT, TEAM_GREEN, TICK_RATE } from '../shared/constants.js';
import { TECHS } from '../shared/tech.js';
import { CASUALTY_MILESTONES, KILL_MILESTONES, LANE_NAMES, pickLine } from '../shared/propaganda.js';
import { Sim } from '../sim/world.js';
import { View } from './view.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Hud } from '../ui/hud.js';
import { VOICE_LINES } from '../shared/voicelines.js';

const TICK_MS = 1000 / TICK_RATE;

export class Game {
  /**
   * @param {{config, session, playerId, solo, audio, onQuit}} opts
   */
  constructor({ config, session, playerId, solo, audio, onQuit }) {
    this.sim = new Sim(config);
    this.session = session;
    this.playerId = playerId;
    this.solo = solo;
    this.audio = audio;
    this.onQuit = onQuit;
    this.team = this.sim.teamOf(playerId);
    this.canvas = document.getElementById('world');
    this.view = new View(this.canvas);
    this.renderer = new Renderer(this.canvas, this.view, this.sim);
    this.input = new Input(this, this.canvas);
    this.hud = new Hud(this);
    this.bundles = [];
    this.clock = 0;
    this.last = performance.now();
    this.running = true;
    this.milestones = { casualties: 0, kills: 0, firsts: new Set(), hqWarned: 0 };
    session.onBundle = (b) => this.bundles.push(b);
    session.onDesync = () => {
      document.getElementById('desync').hidden = false;
    };
    this.onResize = () => this.view.resize();
    addEventListener('resize', this.onResize);
    this.lookAtHome();
    this.view.zoom = 0.9;
    this.view.clamp();
    const bug = this.sim.mode === MODE_BUGHUNT;
    this.hud.say(pickLine(bug ? 'startBugs' : 'start', this.hud.vars()), { voice: bug ? 'start_bughunt' : 'start' });
    audio.music('game');
    requestAnimationFrame((t) => this.frame(t));
  }

  send(c) {
    if (this.sim.over && c.c !== 'ping') return;
    this.session.send(c);
  }

  setPaused(p) {
    if (this.solo) this.session.setPaused?.(p);
  }

  quit() {
    this.running = false;
    removeEventListener('resize', this.onResize);
    this.input.destroy();
    this.hud.destroy();
    this.session.destroy();
    this.audio.music('menu');
    this.onQuit?.();
  }

  lookAtHome() {
    const hq = this.sim.hq(this.team);
    this.view.x = hq.x + (this.team === TEAM_GREEN ? 14 : -14);
    this.view.y = hq.y + hq.h / 2;
    this.view.clamp();
  }

  lookAtFront() {
    // centre on the busiest stretch of the sandbox
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const u of this.sim.units) {
      if (u.x < FIELD_X0 || u.x > FIELD_X1) continue;
      sx += u.x;
      sy += u.y;
      n++;
    }
    this.view.x = n ? sx / n : (FIELD_X0 + FIELD_X1) / 2;
    this.view.y = n ? sy / n : 22;
    this.view.clamp();
  }

  ping(x, y) {
    this.send({ c: 'ping', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  }

  // ------------------------------------------------------------------ the loop

  step(bundle) {
    const sim = this.sim;
    sim.step(bundle.c);
    this.renderer.onEvents(sim.events, this.renderer.time);
    this.audio.onEvents(sim.events, { x: this.view.x, y: this.view.y, zoom: this.view.zoom, team: this.team });
    this.narrate(sim.events);
    if (!this.solo && sim.tick % HASH_INTERVAL === 0) this.session.reportHash?.(sim.tick, sim.hash());
    if (sim.over && !this.overShown) {
      this.overShown = true;
      const won = sim.winner === this.team;
      setTimeout(() => {
        this.audio.music(won ? 'victory' : 'defeat');
        this.audio.play(won ? 'victory' : 'defeat');
        const bug = sim.mode === MODE_BUGHUNT;
        const id = won ? (bug ? 'victory_bugs' : 'victory') : 'defeat';
        setTimeout(() => this.audio.voice(id, VOICE_LINES[id], { priority: true }), 2500);
        this.hud.gameOver();
      }, 1500);
    }
  }

  frame(now) {
    if (!this.running) return;
    const dtMs = Math.min(250, now - this.last);
    this.last = now;
    this.clock += dtMs;
    const backlog = this.bundles.length;
    if (backlog > 3) this.clock += (backlog - 2) * TICK_MS * 0.5; // catch up after a hiccup
    let steps = 0;
    while (this.bundles.length && this.clock >= TICK_MS && steps < 40) {
      this.step(this.bundles.shift());
      this.clock -= TICK_MS;
      steps++;
    }
    if (!this.bundles.length && this.clock > TICK_MS) this.clock = TICK_MS; // starved: hold the pose
    const alpha = Math.min(1, Math.max(0, this.clock / TICK_MS));
    const dt = dtMs / 1000;
    this.input.update(dt);
    this.hud.update(dt);
    this.audio.update(dt);
    this.audio.setIntensity(this.intensity());
    this.renderer.draw(this.sim, alpha, dt, this.input.overlay());
    requestAnimationFrame((t) => this.frame(t));
  }

  intensity() {
    const n = this.sim.units.length;
    return Math.min(1, n / 120);
  }

  // ------------------------------------------------------------------ the Federal Playroom Network

  narrate(events) {
    const hud = this.hud;
    const vars = hud.vars();
    const me = this.sim.teams[this.team];
    const m = this.milestones;
    for (const ev of events) {
      switch (ev.e) {
        case 'deploy':
          if (ev.team !== this.team) break;
          this.renderer.fx.deployed(ev.x, ev.y);
          if (!m.firsts.has('deploy')) {
            m.firsts.add('deploy');
            hud.say(pickLine('firstDeploy', vars), { voice: 'first_deploy' });
          }
          if (ev.unit === 'tank' && !m.firsts.has('tank')) {
            m.firsts.add('tank');
            hud.say(pickLine('firstTank', vars), { voice: 'first_tank' });
          }
          if (ev.unit === 'plane' && !m.firsts.has('plane')) {
            m.firsts.add('plane');
            hud.say(pickLine('firstPlane', vars), { voice: 'first_plane' });
          }
          if (ev.unit === 'colossus') hud.say(pickLine('colossus', vars), { voice: 'colossus', alert: true });
          break;
        case 'breach':
          if (ev.team === this.team) {
            hud.say(pickLine('ourBreach', { ...vars, lane: LANE_NAMES[ev.lane] }), { alert: true, voice: `our_breach_${ev.lane}` });
            hud.toast(`The ${LANE_NAMES[ev.lane]} gate has fallen!`, 'bad');
          } else {
            hud.say(pickLine('theirBreach', { ...vars, lane: LANE_NAMES[ev.lane] }), { voice: `their_breach_${ev.lane}` });
            hud.toast(this.sim.mode === MODE_BUGHUNT ? `The ${LANE_NAMES[ev.lane]} burrow has collapsed!` : `Enemy ${LANE_NAMES[ev.lane]} gate destroyed!`, 'good');
          }
          break;
        case 'rebuilt':
          if (ev.team === this.team) hud.say(pickLine('gateRebuilt', { ...vars, lane: LANE_NAMES[ev.lane] }));
          break;
        case 'research':
          if (ev.team === this.team) {
            const t = TECHS[ev.tech];
            hud.say(pickLine('research', { ...vars, tech: t.name, blurb: t.blurb }), { voice: `research_${ev.tech}` });
            hud.toast(`Program approved: ${t.name}`, 'good');
          }
          break;
        case 'broke':
          if (ev.player === this.playerId && !m.brokeCooldown) {
            m.brokeCooldown = true;
            hud.say(pickLine('broke', vars), { voice: 'broke' });
            setTimeout(() => {
              m.brokeCooldown = false;
            }, 30000);
          }
          break;
        case 'wave':
          hud.say(pickLine('wave', { ...vars, n: ev.n }), { alert: true, voice: 'wave' });
          break;
        case 'queen':
          hud.say(pickLine('queen', vars), { alert: true, voice: 'queen' });
          break;
        case 'ping':
          if (ev.team === this.team && ev.player !== this.playerId) this.audio.play('click');
          break;
        case 'takeover':
          hud.toast(`${ev.name} deserted. An AI general runs their factory now.`, 'bad');
          break;
        default:
          break;
      }
    }
    while (m.casualties < CASUALTY_MILESTONES.length && me.casualties >= CASUALTY_MILESTONES[m.casualties]) {
      hud.say(pickLine('casualties', { ...vars, n: CASUALTY_MILESTONES[m.casualties] }), { voice: `casualties_${CASUALTY_MILESTONES[m.casualties]}` });
      m.casualties++;
    }
    while (m.kills < KILL_MILESTONES.length && me.kills >= KILL_MILESTONES[m.kills]) {
      hud.say(pickLine('kills', { ...vars, n: KILL_MILESTONES[m.kills] }));
      m.kills++;
    }
    const hq = this.sim.hq(this.team);
    if (hq.hitTick === this.sim.tick - 1 && this.sim.tick - m.hqWarned > 600) {
      m.hqWarned = this.sim.tick;
      hud.say(pickLine('hqHit', vars), { alert: true, voice: 'hq_hit' });
      this.audio.play('alarm');
    }
  }
}
