// Inspector, research poster, pause menu, game-over newsreel and the Field Manual.
import { MODE_BUGHUNT, TEAM_GREEN, TEAM_NAMES, TEAM_SWARM } from '../shared/constants.js';
import { BUILDINGS, RECIPES } from '../shared/buildings.js';
import { ITEMS } from '../shared/items.js';
import { TECHS, TECH_ORDER, techAvailable } from '../shared/tech.js';
import { EVENT_LINES, SLOGAN, fill } from '../shared/propaganda.js';
import { hasTech } from '../sim/commands.js';
import { MACHINES, TURRETS } from '../sim/production.js';
import { $, clear, el, fmt } from './dom.js';

const MANUAL = [
  { text: 'Place a <kbd>1</kbd> Scoop on a pellet pile (the pastel beads).', done: (s, t) => s.buildings.some((b) => b.team === t && b.type === 'scoop' && b.kinds.includes('pellets')) },
  { text: 'Drag a <kbd>2</kbd> Conveyor from it into a <kbd>6</kbd> Molding Press. Figures come out.', done: (s, t) => crafted(s, t, 'press') },
  { text: 'Scoop the black Bang Powder into a <kbd>8</kbd> Powder Mill for Caps.', done: (s, t) => crafted(s, t, 'mill') },
  { text: 'Belt Figures + Caps into a <kbd>9</kbd> Assembly Bench. It makes Rifleman crates.', done: (s, t) => crafted(s, t, 'bench') },
  { text: 'Belt the crates into a Gate. The machine does the rest.', done: (s, t) => s.teams[t].deployed > 0 },
  { text: 'Spend Glory ★ on Citizenship Programs <kbd>T</kbd>.', done: (s, t) => s.teams[t].researched.size > 0 },
  { text: 'Feed Caps into a <kbd>Z</kbd> Pop-Gun Nest near a gate.', done: (s, t) => s.buildings.some((b) => b.team === t && b.type === 'popgun' && b.shots > 0) },
];

function crafted(sim, team, type) {
  return sim.buildings.some((b) => b.team === team && b.type === type && (b.crafted || 0) > 0);
}

/** Tiny markup: only <kbd>…</kbd> is honoured, everything else is text. */
function richText(node, text) {
  for (const part of text.split(/(<kbd>.*?<\/kbd>)/)) {
    const m = /^<kbd>(.*)<\/kbd>$/.exec(part);
    node.append(m ? el('kbd', { text: m[1] }) : document.createTextNode(part));
  }
  return node;
}

export class Panels {
  constructor(game, hud) {
    this.game = game;
    this.hud = hud;
    this.inspector = $('#inspector');
    this.research = $('#research');
    this.pause = $('#pause');
    this.over = $('#gameover');
    this.manual = $('#manual');
    this.selected = null;
    this.manualDone = new Set();
    this.buildManual();
  }

  destroy() {
    for (const n of [this.inspector, this.research, this.pause, this.over]) {
      clear(n);
      n.hidden = true;
    }
    clear(this.manual);
  }

  get sim() {
    return this.game.sim;
  }

  get team() {
    return this.game.team;
  }

  // ------------------------------------------------------------------ inspector

  inspect(b) {
    this.selected = b;
    this.renderInspector();
  }

  renderInspector() {
    const b = this.selected;
    const box = this.inspector;
    if (!b || b.removed) {
      box.hidden = true;
      return;
    }
    const def = BUILDINGS[b.type];
    const mine = b.team === this.team;
    this.needsEl = null;
    this.ammoEl = null;
    this.gateEl = null;
    this.hqEl = null;
    clear(box);
    box.hidden = false;
    box.append(el('h3', { text: `${def.name}${mine ? '' : ` (${TEAM_NAMES[b.team]})`}` }), el('p', { text: def.blurb }));
    box.append(el('div', { class: 'stat', text: `Integrity ${Math.max(0, Math.ceil(b.hp))} / ${b.maxHp}` }));
    if (b.building > 0) box.append(el('div', { class: 'stat', text: 'Under construction…' }));

    if (MACHINES.has(b.type)) {
      const row = el('div', { class: 'row' });
      for (const r of def.recipes) {
        const out = Object.keys(RECIPES[r].out)[0];
        const unlocked = hasTech(this.sim, b.team, RECIPES[r].tech);
        row.append(el('button', {
          class: `recipe${b.recipe === r ? ' on' : ''}`,
          disabled: !mine || !unlocked,
          title: unlocked ? '' : `Requires ${TECHS[RECIPES[r].tech].name}`,
          text: ITEMS[out].name,
          onclick: () => {
            this.game.send({ c: 'recipe', id: b.id, recipe: r });
            this.game.audio.play('click');
          },
        }));
      }
      box.append(row);
      this.needsEl = el('div', { class: 'needs' });
      box.append(this.needsEl);
    }
    if (b.type === 'scoop') {
      const counts = {};
      for (const k of b.kinds) counts[k] = (counts[k] || 0) + 1;
      const txt = Object.entries(counts).map(([k, n]) => `${ITEMS[k].name} ×${n}`).join(', ') || 'Nothing to dig.';
      box.append(el('div', { class: 'stat', text: `Digging: ${txt}` }));
    }
    if (b.type === 'sorter' && mine) {
      const row = el('div', { class: 'row' });
      for (const item of [null, 'pellets', 'tin', 'powder', 'figure', 'plate', 'spring', 'caps', 'firecracker']) {
        row.append(el('button', {
          class: `recipe${b.filter === item ? ' on' : ''}`,
          text: item ? ITEMS[item].name : 'Pass all',
          onclick: () => this.game.send({ c: 'filter', id: b.id, item }),
        }));
      }
      box.append(el('p', { text: 'Chosen item goes straight on; everything else turns left/right.' }), row);
    }
    if (TURRETS.has(b.type)) {
      this.ammoEl = el('div', { class: 'stat' });
      box.append(this.ammoEl);
    }
    if (b.type === 'gate') {
      this.gateEl = el('div', { class: 'stat' });
      box.append(this.gateEl);
    }
    if (b.type === 'hq') {
      box.append(el('p', { text: 'Belt any spare item into the Toybox to sell it as War Bonds.' }));
      this.hqEl = el('div', { class: 'stat' });
      box.append(this.hqEl);
    }
    if (mine && !def.fixed) {
      box.append(el('div', { class: 'actions' }, [
        el('button', { class: 'chip navy', text: '⟳ Rotate (R)', onclick: () => this.game.input.rotate(1) }),
        el('button', {
          class: 'chip',
          text: `✕ Scrap (+${Math.floor(def.cost * 0.75)})`,
          onclick: () => this.game.input.removeArea({ x0: b.x, y0: b.y, x1: b.x, y1: b.y }),
        }),
      ]));
    }
    this.lastSig = this.signature(b);
    this.updateInspector();
  }

  signature(b) {
    return `${b.id}|${b.recipe}|${b.filter}|${b.building > 0}|${this.sim.teams[b.team]?.researched.size}`;
  }

  updateInspector() {
    const b = this.selected;
    if (!b) return;
    if (b.removed) {
      this.inspect(null);
      return;
    }
    if (this.signature(b) !== this.lastSig) {
      this.renderInspector();
      return;
    }
    if (this.needsEl && MACHINES.has(b.type)) {
      clear(this.needsEl);
      const r = RECIPES[b.recipe];
      this.needsEl.append('Needs: ');
      for (const [item, n] of Object.entries(r.in)) {
        const have = b.inv[item] || 0;
        this.needsEl.append(el('span', { class: have < n ? 'low' : '', text: `${ITEMS[item].name} ${have}/${n}` }));
      }
      const outName = ITEMS[Object.keys(r.out)[0]].name;
      this.needsEl.append(el('div', { text: `Makes ${outName} every ${(r.time / (b.type === 'bench' ? this.sim.teams[b.team].benchMult : 1)).toFixed(1)}s · made ${b.crafted || 0}` }));
      if (b.out.length >= 4) this.needsEl.append(el('div', { class: 'low', text: 'Output blocked! Belt it away.' }));
    }
    if (this.ammoEl) {
      const def = BUILDINGS[b.type];
      this.ammoEl.textContent = `Ammo: ${b.shots}/${def.maxShots} shots (${ITEMS[def.ammo].name})`;
    }
    if (this.gateEl) {
      this.gateEl.textContent = b.dead ? 'DESTROYED. Rebuild it from the lane card.' : `Crates queued: ${b.queue.length} · Lane ${['north', 'centre', 'south'][b.lane]}`;
    }
    if (this.hqEl) this.hqEl.textContent = `War Bonds sold: ${fmt(this.sim.teams[b.team].bonds)} R`;
  }

  // ------------------------------------------------------------------ research poster

  toggleResearch() {
    if (!this.research.hidden) {
      this.research.hidden = true;
      return;
    }
    this.closeModals();
    this.research.hidden = false;
    this.renderResearch();
    this.game.audio.play('click');
  }

  renderResearch() {
    const t = this.sim.teams[this.team];
    clear(this.research);
    const grid = el('div', { class: 'techs' });
    for (const id of TECH_ORDER) {
      const tech = TECHS[id];
      const done = t.researched.has(id);
      const avail = techAvailable(t.researched, id);
      const afford = avail && t.glory >= tech.cost;
      const card = el('div', {
        class: `tech${done ? ' done' : ''}${!avail && !done ? ' locked' : ''}${afford ? ' afford' : ''}`,
        onclick: () => {
          if (!afford) {
            this.game.audio.play('error');
            return;
          }
          this.game.send({ c: 'research', tech: id });
          this.game.audio.play('research');
          setTimeout(() => !this.research.hidden && this.renderResearch(), 150);
        },
      }, [
        el('span', { class: 'price', text: done ? '✓ APPROVED' : `★ ${tech.cost}` }),
        el('h5', { text: tech.name }),
        el('div', { class: 'unl', text: tech.unlocks }),
        el('div', { class: 'blurb', text: `"${tech.blurb}"` }),
        !done && tech.req.length ? el('div', { class: 'blurb', text: `Requires: ${tech.req.map((r) => TECHS[r].name).join(', ')}` }) : null,
      ]);
      grid.append(card);
    }
    this.research.append(el('div', { class: 'poster' }, [
      el('button', { class: 'chip icon close', text: '✕', onclick: () => this.toggleResearch() }),
      el('h2', { text: 'CITIZENSHIP PROGRAMS' }),
      el('div', { class: 'sub', text: `You have ★ ${fmt(t.glory)} Glory. Glory comes from kills and from heroic losses. The Federation wastes nothing.` }),
      grid,
    ]));
  }

  // ------------------------------------------------------------------ pause

  togglePause() {
    if (!this.pause.hidden) {
      this.pause.hidden = true;
      this.game.setPaused(false);
      return;
    }
    this.closeModals();
    this.pause.hidden = false;
    this.game.setPaused(true);
    clear(this.pause).append(el('div', { class: 'poster' }, [
      el('h2', { text: 'INTERMISSION' }),
      el('div', { class: 'sub', text: this.game.solo ? 'The war politely waits for you.' : 'The war does not wait. It is still going.' }),
      el('div', { class: 'stats' }, [
        el('span', { class: 'h', text: 'Controls' }), el('span'), el('span'),
        ...[
          ['WASD / arrows / middle-drag', 'move camera'], ['wheel', 'zoom'], ['1–9, Z X C V', 'pick a building'],
          ['left click / drag', 'place (drag belts)'], ['R / Shift+R', 'rotate'], ['right click / drag', 'cancel · scrap'],
          ['Q', 'copy building under cursor'], ['T', 'Citizenship Programs'], ['F1–F3', 'toggle lane HOLD / ADVANCE'],
          ['H / G', 'look at home / the front'], ['P', 'ping the map for your team'], ['M', 'mute'],
        ].flatMap(([k, v]) => [el('span', { text: k }), el('span', { text: v }), el('span')]),
      ]),
      el('div', { class: 'menu-buttons' }, [
        el('button', { class: 'chip navy', text: 'Resume', onclick: () => this.togglePause() }),
        el('button', {
          class: 'chip',
          text: 'Surrender',
          onclick: () => {
            this.game.send({ c: 'surrender' });
            this.togglePause();
          },
        }),
        el('button', { class: 'chip ghost', text: 'Quit to title', onclick: () => this.game.quit() }),
      ]),
    ]));
  }

  modalOpen() {
    return !this.research.hidden || !this.pause.hidden;
  }

  closeModals() {
    this.research.hidden = true;
    if (!this.pause.hidden) {
      this.pause.hidden = true;
      this.game.setPaused(false);
    }
  }

  // ------------------------------------------------------------------ game over

  gameOver() {
    const sim = this.sim;
    const won = sim.winner === this.team;
    const bug = sim.mode === MODE_BUGHUNT;
    this.closeModals();
    this.over.hidden = false;
    const me = sim.teams[this.team];
    const lineKey = won ? (bug ? 'victoryBugs' : 'victory') : 'defeat';
    const line = fill(EVENT_LINES[lineKey][0], { n: fmt(me.casualties) });
    const teams = bug ? [TEAM_GREEN, TEAM_SWARM] : [0, 1];
    const row = (label, f) => [el('span', { text: label }), ...teams.map((t) => el('span', { text: fmt(f(sim.teams[t])) }))];
    const minutes = Math.floor(sim.tick / 20 / 60);
    clear(this.over).append(el('div', { class: 'poster' }, [
      el('div', { class: 'sub', text: `FEDERAL PLAYROOM NETWORK · SPECIAL BULLETIN · ${minutes} MINUTES OF GLORY` }),
      el('div', { class: `big ${won ? 'win' : 'lose'}`, text: won ? 'VICTORY!' : 'DEFEAT' }),
      el('p', { text: line }),
      el('div', { class: 'stats' }, [
        el('span', { class: 'h', text: '' }), ...teams.map((t) => el('span', { class: 'h', text: TEAM_NAMES[t].toUpperCase() })),
        ...row('Soldiers deployed', (t) => t.deployed),
        ...row('Heroes recycled', (t) => t.casualties),
        ...row('Enemies melted', (t) => t.kills),
        ...row('Structures lost', (t) => t.structuresLost),
        ...row('War Bonds sold', (t) => t.bonds),
        ...row('Programs approved', (t) => t.researched.size),
      ]),
      el('div', { class: 'sub', text: SLOGAN }),
      el('div', { class: 'menu-buttons' }, [
        el('button', { class: 'chip navy', text: 'Survey the sandbox', onclick: () => { this.over.hidden = true; } }),
        el('button', { class: 'chip', text: 'Return to title', onclick: () => this.game.quit() }),
      ]),
    ]));
  }

  // ------------------------------------------------------------------ field manual

  buildManual() {
    clear(this.manual);
    this.manualList = el('ol');
    const toggle = el('button', {
      text: '–',
      title: 'Collapse',
      onclick: () => {
        this.manual.classList.toggle('collapsed');
        toggle.textContent = this.manual.classList.contains('collapsed') ? '+' : '–';
      },
    });
    this.manual.append(el('h4', {}, ['FIELD MANUAL', toggle]), this.manualList);
    this.manualItems = MANUAL.map((m) => {
      const li = richText(el('li'), m.text);
      this.manualList.append(li);
      return li;
    });
  }

  updateManual() {
    let first = true;
    MANUAL.forEach((m, i) => {
      if (!this.manualDone.has(i) && m.done(this.sim, this.team)) this.manualDone.add(i);
      const done = this.manualDone.has(i);
      this.manualItems[i].classList.toggle('done', done);
      this.manualItems[i].classList.toggle('now', !done && first);
      if (!done) first = false;
    });
    if (this.manualDone.size === MANUAL.length && !this.manualFinished) {
      this.manualFinished = true;
      this.hud.toast('Field Manual complete. Keep the belts full. Keep the Front fed.', 'good');
      setTimeout(() => this.manual.classList.add('collapsed'), 4000);
    }
  }

  update() {
    this.updateInspector();
    this.updateManual();
    if (!this.research.hidden && (this.researchT = (this.researchT || 0) + 1) % 5 === 0) this.renderResearch();
  }
}

