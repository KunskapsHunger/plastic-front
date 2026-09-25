// The poster-style HUD: purse, FPN ticker, lane command cards, build bar, toasts, tooltip.
// Heavier panels (inspector, research, pause, game over, field manual) live in panels.js.
import { FIELD_X0, FIELD_X1, LANES, MODE_BUGHUNT, TEAM_GREEN } from '../shared/constants.js';
import { BUILDINGS, BUILD_ORDER, RECIPES } from '../shared/buildings.js';
import { ITEMS } from '../shared/items.js';
import { TECHS, techAvailable } from '../shared/tech.js';
import { IDLE_LINES, LANE_NAMES, fill } from '../shared/propaganda.js';
import { IDLE_VOICE, VOICE_LINES } from '../shared/voicelines.js';
import { hasTech } from '../sim/commands.js';
import { drawBeltBase, drawBuilding } from '../client/draw-buildings.js';
import { TP } from '../client/palette.js';
import { $, clear, el, fmt } from './dom.js';
import { Panels } from './panels.js';
import { Minimap } from './minimap.js';

const TICKER_SPEED = 90; // px per second

export class Hud {
  constructor(game) {
    this.game = game;
    this.root = $('#hud');
    this.root.hidden = false;
    this.els = {
      req: $('#r-req'), reqRate: $('#r-req-rate'), glory: $('#r-glory'), scrap: $('#r-scrap'), army: $('#r-army'),
      heroes: $('#r-heroes'), ticker: $('#ticker-text'), lanes: $('#lanes'), buildbar: $('#buildbar'),
      toasts: $('#toasts'), tooltip: $('#tooltip'), research: $('#btn-research'), mute: $('#btn-mute'),
      wave: $('#wave-banner'),
    };
    this.tickerX = 0;
    this.tickerQueue = [];
    this.tickerIdle = 0;
    this.lastReq = 0;
    this.reqHistory = [];
    this.refreshT = 0;
    this.panels = new Panels(game, this);
    this.minimap = new Minimap(game, $('#minimap'));
    this.buildLanes();
    this.buildBuildbar();
    $('#btn-research').onclick = () => this.toggleResearch();
    $('#btn-menu').onclick = () => this.togglePause();
    if (game.solo) {
      // solo wars can be fast-forwarded (multiplayer runs on the host's clock)
      const speeds = [1, 2, 3];
      let i = 0;
      const btn = el('button', { class: 'chip icon', title: 'Game speed', text: '1×' });
      btn.onclick = () => {
        i = (i + 1) % speeds.length;
        game.session.setSpeed?.(speeds[i]);
        btn.textContent = `${speeds[i]}×`;
      };
      this.els.research.before(btn);
      this.speedBtn = btn;
    }
    this.els.mute.onclick = () => {
      game.audio.toggleMute();
      this.refreshMute();
    };
    this.refreshMute();
  }

  destroy() {
    this.root.hidden = true;
    clear(this.els.lanes);
    clear(this.els.buildbar);
    clear(this.els.toasts);
    this.speedBtn?.remove();
    this.panels.destroy();
    this.minimap.destroy();
    this.hideTip();
  }

  get team() {
    return this.game.team;
  }

  get sim() {
    return this.game.sim;
  }

  vars() {
    const enemyTeam = this.sim.enemiesOf(this.team)[0];
    return {
      us: this.team === TEAM_GREEN ? 'Green' : 'Tan',
      enemy: this.sim.mode === MODE_BUGHUNT ? 'Bug' : enemyTeam === TEAM_GREEN ? 'Green' : 'Tan',
    };
  }

  // ------------------------------------------------------------------ ticker + toasts

  /** Put a line on the FPN ticker; `voice` names a pre-rendered announcer clip to play with it. */
  say(text, { alert = false, voice = null } = {}) {
    const line = fill(text, this.vars());
    this.tickerQueue.push({ text: line, alert });
    if (this.tickerQueue.length > 4) this.tickerQueue.shift();
    if (voice) this.game.audio.voice(voice, line, { priority: alert });
  }

  updateTicker(dt) {
    const t = this.els.ticker;
    const track = t.parentElement;
    if (!this.tickerActive) {
      const next = this.tickerQueue.shift();
      if (!next) {
        this.tickerIdle -= dt;
        if (this.tickerIdle > 0) return;
        this.tickerIdle = 6;
        this.idleCount = (this.idleCount || 0) + 1;
        if (this.idleCount % 5 === 0) {
          // every so often the announcer reads a public-service message aloud
          const id = IDLE_VOICE[Math.floor(Math.random() * IDLE_VOICE.length)];
          this.say(VOICE_LINES[id], { voice: id });
          return;
        }
        const line = IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)];
        this.tickerQueue.push({ text: fill(line, this.vars()), alert: false });
        return;
      }
      t.textContent = next.text;
      t.classList.toggle('alert', next.alert);
      this.tickerX = track.clientWidth;
      this.tickerActive = true;
      this.game.audio.play('ticker');
    }
    const speed = TICKER_SPEED * (this.tickerQueue.length > 1 ? 1.8 : 1);
    this.tickerX -= speed * dt;
    t.style.left = `${this.tickerX}px`;
    if (this.tickerX < -t.clientWidth - 20) this.tickerActive = false;
  }

  toast(text, kind = '') {
    const n = el('div', { class: `toast ${kind}`, text });
    this.els.toasts.append(n);
    while (this.els.toasts.children.length > 4) this.els.toasts.firstChild.remove();
    setTimeout(() => n.remove(), 2600);
  }

  refreshMute() {
    this.els.mute.textContent = this.game.audio.muted ? '✕' : '♪';
  }

  // ------------------------------------------------------------------ lanes

  buildLanes() {
    clear(this.els.lanes);
    this.laneEls = LANES.map((_, lane) => {
      const adv = el('button', { class: 'adv', text: 'ADVANCE', onclick: () => this.order(lane, 'advance') });
      const hold = el('button', { class: 'hold', text: 'HOLD', onclick: () => this.order(lane, 'hold') });
      const rebuild = el('button', { class: 'chip rebuild', text: `REBUILD GATE (250 R)`, onclick: () => this.game.send({ c: 'rebuild', lane }) });
      const gateBar = el('div');
      const enemyBar = el('div');
      const marker = el('i');
      const ours = el('span');
      const theirs = el('span');
      const card = el('div', { class: 'lane' }, [
        el('h4', {}, [`${LANE_NAMES[lane].toUpperCase()} LANE`, el('small', { text: `F${lane + 1}` })]),
        el('div', { class: 'bar', title: 'Your gate' }, gateBar),
        el('div', { class: 'front', title: 'Where the front line is' }, marker),
        el('div', { class: 'bar enemy', title: 'Their gate' }, enemyBar),
        el('div', { class: 'counts' }, [ours, theirs]),
        el('div', { class: 'orders' }, [adv, hold]),
        rebuild,
      ]);
      this.els.lanes.append(card);
      return { card, adv, hold, rebuild, gateBar, enemyBar, marker, ours, theirs };
    });
  }

  order(lane, order) {
    this.game.send({ c: 'order', lane, order });
    this.game.audio.play('order');
  }

  updateLanes() {
    const sim = this.sim;
    const team = this.team;
    const enemy = sim.enemiesOf(team)[0];
    const fwd = team === TEAM_GREEN ? 1 : -1;
    const stats = LANES.map(() => ({ ours: 0, theirs: 0, frontUs: null, frontThem: null }));
    for (const u of sim.units) {
      if (u.lane < 0 || u.x < FIELD_X0 || u.x >= FIELD_X1) continue;
      const s = stats[u.lane];
      const prog = fwd > 0 ? u.x : FIELD_X1 - (u.x - FIELD_X0);
      if (u.team === team) {
        s.ours++;
        s.frontUs = s.frontUs === null ? prog : Math.max(s.frontUs, prog);
      } else {
        s.theirs++;
        s.frontThem = s.frontThem === null ? prog : Math.min(s.frontThem, prog);
      }
    }
    const width = FIELD_X1 - FIELD_X0;
    this.laneEls.forEach((L, lane) => {
      const g = sim.laneEnd(team, lane);
      const eg = sim.laneEnd(enemy, lane);
      L.gateBar.style.width = `${(g.hp / g.maxHp) * 100}%`;
      L.enemyBar.style.width = `${(eg.hp / eg.maxHp) * 100}%`;
      const s = stats[lane];
      let front = 0.5;
      if (s.frontUs !== null && s.frontThem !== null) front = ((s.frontUs + s.frontThem) / 2 - FIELD_X0) / width;
      else if (s.frontUs !== null) front = (s.frontUs - FIELD_X0) / width;
      else if (s.frontThem !== null) front = (s.frontThem - FIELD_X0) / width;
      L.marker.style.left = `calc(${Math.min(1, Math.max(0, front)) * 100}% - 2px)`;
      L.ours.textContent = `⚑ ${s.ours} ours`;
      L.theirs.textContent = `${s.theirs} theirs ☠`;
      const order = sim.teams[team].laneOrders[lane];
      L.adv.classList.toggle('on', order === 'advance');
      L.hold.classList.toggle('on', order === 'hold');
      L.card.classList.toggle('breached', g.dead);
      L.rebuild.hidden = !g.dead;
    });
  }

  // ------------------------------------------------------------------ build bar

  buildBuildbar() {
    const bar = this.els.buildbar;
    clear(bar);
    this.slots = new Map();
    const groups = [['scoop', 'belt', 'junction', 'splitter', 'sorter'], ['press', 'tinworks', 'mill', 'bench'], ['popgun', 'mortarpit', 'flak', 'reclaimer']];
    groups.forEach((group, gi) => {
      if (gi) bar.append(el('div', { class: 'sep' }));
      for (const type of group) {
        const def = BUILDINGS[type];
        const icon = this.icon(type);
        const slot = el('button', {
          class: 'slot',
          onclick: () => this.game.input.setTool(this.game.input.tool?.type === type ? null : type),
          onmouseenter: (e) => this.showTip(e, this.buildTip(type)),
          onmouseleave: () => this.hideTip(),
        }, [icon, el('span', { class: 'key', text: def.hotkey.toUpperCase() }), el('span', { class: 'cost', text: `${def.cost}` })]);
        bar.append(slot);
        this.slots.set(type, slot);
      }
    });
    this.refreshBuildbar();
  }

  icon(type) {
    const def = BUILDINGS[type];
    const size = 92;
    const c = el('canvas', { width: size, height: size });
    const ctx = c.getContext('2d');
    const span = Math.max(def.w, def.h);
    const scale = size / ((span + 0.5) * TP);
    ctx.setTransform(scale, 0, 0, scale, (size - def.w * TP * scale) / 2, (size - def.h * TP * scale) / 2 + 2);
    const fake = {
      type, x: 0, y: 0, w: def.w, h: def.h, dir: 0, team: this.team, hp: 1, maxHp: 1, building: 0, active: true,
      recipe: def.recipes?.[0], out: [], inv: {}, shots: def.maxShots || 0, queue: [], items: [], progress: 0,
    };
    const fakeSim = { tick: 0, teams: [{ benchMult: 1 }, { benchMult: 1 }, { benchMult: 1 }] };
    if (type === 'belt') drawBeltBase(ctx, fake, 0.3, 0);
    else drawBuilding(ctx, fake, 0.4, fakeSim);
    return c;
  }

  refreshBuildbar() {
    if (!this.slots) return;
    const t = this.sim.teams[this.team];
    for (const [type, slot] of this.slots) {
      const def = BUILDINGS[type];
      slot.classList.toggle('on', this.game.input?.tool?.type === type);
      slot.classList.toggle('locked', !hasTech(this.sim, this.team, def.tech));
      slot.classList.toggle('poor', t.req < def.cost);
    }
  }

  buildTip(type) {
    const def = BUILDINGS[type];
    const parts = [el('b', { text: `${def.name}  [${def.hotkey.toUpperCase()}]` }), el('div', { text: def.blurb })];
    parts.push(el('div', { class: 'cost', text: `Cost: ${def.cost} R  ·  ${def.w}×${def.h}` }));
    if (def.recipes) {
      const names = def.recipes.filter((r) => !RECIPES[r].tech || hasTech(this.sim, this.team, RECIPES[r].tech))
        .map((r) => ITEMS[Object.keys(RECIPES[r].out)[0]].name);
      parts.push(el('div', { text: `Makes: ${names.join(', ')}` }));
    }
    if (def.ammo) parts.push(el('div', { text: `Ammo: ${ITEMS[def.ammo].name} (belt it in)` }));
    if (!hasTech(this.sim, this.team, def.tech)) parts.push(el('div', { class: 'lock', text: `Requires: ${TECHS[def.tech].name}` }));
    if (type === 'belt') parts.push(el('div', { text: 'Drag to lay a line. R rotates.' }));
    return parts;
  }

  showTip(e, content) {
    const tip = this.els.tooltip;
    clear(tip).append(...content);
    tip.hidden = false;
    const r = e.currentTarget.getBoundingClientRect();
    tip.style.left = `${Math.min(innerWidth - 290, r.left)}px`;
    tip.style.top = `${r.top - tip.offsetHeight - 10}px`;
  }

  hideTip() {
    this.els.tooltip.hidden = true;
  }

  // ------------------------------------------------------------------ frame update

  update(dt) {
    this.updateTicker(dt);
    this.refreshT -= dt;
    if (this.refreshT > 0) return;
    this.refreshT = 0.2;
    const t = this.sim.teams[this.team];
    this.els.req.textContent = fmt(t.req);
    this.reqHistory.push(t.req);
    if (this.reqHistory.length > 25) this.reqHistory.shift();
    const rate = (this.reqHistory[this.reqHistory.length - 1] - this.reqHistory[0]) / ((this.reqHistory.length - 1) * 0.2 || 1);
    this.els.reqRate.textContent = `${rate >= 0 ? '+' : ''}${rate.toFixed(0)}/s`;
    this.els.req.parentElement.classList.toggle('warn', t.req < 40);
    this.els.glory.textContent = fmt(t.glory);
    this.els.scrap.textContent = fmt(t.scrap);
    this.els.army.textContent = fmt(t.unitCount);
    this.els.heroes.textContent = fmt(t.casualties);
    const canResearch = Object.keys(TECHS).some((id) => techAvailable(t.researched, id) && t.glory >= TECHS[id].cost);
    this.els.research.classList.toggle('ready', canResearch);
    this.updateLanes();
    this.refreshBuildbar();
    this.panels.update();
    this.minimap.draw();
    const swarm = this.sim.swarm;
    this.els.wave.hidden = !swarm;
    if (swarm) {
      const eta = Math.ceil(swarm.eta(this.sim) / 20);
      this.els.wave.textContent = swarm.wave ? `WAVE ${swarm.wave}  ·  NEXT IN ${eta}s` : `FIRST WAVE IN ${eta}s`;
    }
  }

  // ------------------------------------------------------------------ panel passthroughs

  inspect(b) {
    this.panels.inspect(b);
  }

  toggleResearch() {
    this.panels.toggleResearch();
  }

  togglePause() {
    this.panels.togglePause();
  }

  modalOpen() {
    return this.panels.modalOpen();
  }

  closeModals() {
    this.panels.closeModals();
  }

  gameOver() {
    this.panels.gameOver();
  }
}
