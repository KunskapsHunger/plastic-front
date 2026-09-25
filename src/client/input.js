// Mouse + keyboard → camera moves, build tools and commands. Commands go through `game.send`, never
// straight into the simulation, so every peer applies them on the same tick.
import { BUILDINGS, BUILD_ORDER } from '../shared/buildings.js';
import { TRANSPORT } from '../sim/transport.js';
import { placementError, hasTech } from '../sim/commands.js';

const PAN_SPEED = 26; // tiles per second at zoom 1
const DIR_OF = { '1,0': 0, '0,1': 1, '-1,0': 2, '0,-1': 3 };

export class Input {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { sx: 0, sy: 0, wx: 0, wy: 0, inside: false };
    this.tool = null; // { type, dir, recipe }
    this.drag = null; // belt drag: { x0, y0 }
    this.rdrag = null; // removal rectangle
    this.pan = null; // middle-drag pan
    this.hover = null;
    this.selected = null;
    this.bind();
  }

  get view() {
    return this.game.view;
  }

  get sim() {
    return this.game.sim;
  }

  bind() {
    const c = this.canvas;
    this.abort = new AbortController();
    const opt = { signal: this.abort.signal };
    c.addEventListener('contextmenu', (e) => e.preventDefault(), opt);
    c.addEventListener('mousemove', (e) => this.onMove(e), opt);
    c.addEventListener('mousedown', (e) => this.onDown(e), opt);
    addEventListener('mouseup', (e) => this.onUp(e), opt);
    c.addEventListener('mouseleave', () => {
      this.mouse.inside = false;
    }, opt);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.view.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false, signal: this.abort.signal });
    addEventListener('keydown', (e) => this.keyDown(e), opt);
    addEventListener('keyup', (e) => this.keys.delete(e.code), opt);
    addEventListener('blur', () => this.keys.clear(), opt);
  }

  destroy() {
    this.abort.abort();
  }

  tileAt() {
    return [Math.floor(this.mouse.wx), Math.floor(this.mouse.wy)];
  }

  /** Top-left tile for placing a building of `type` centred on the cursor. */
  anchor(type) {
    const def = BUILDINGS[type];
    return [Math.floor(this.mouse.wx - def.w / 2 + 0.5), Math.floor(this.mouse.wy - def.h / 2 + 0.5)];
  }

  // ------------------------------------------------------------------ tools

  setTool(type) {
    this.drag = null;
    if (!type) {
      this.tool = null;
      this.game.hud.refreshBuildbar();
      return;
    }
    const def = BUILDINGS[type];
    if (!hasTech(this.sim, this.game.team, def.tech)) {
      this.game.hud.toast(`${def.name} needs research first (T).`, 'bad');
      this.game.audio.play('error');
      return;
    }
    const keepDir = this.tool?.dir ?? 0;
    this.tool = { type, dir: keepDir, recipe: def.recipes?.[0] ?? null };
    this.selected = null;
    this.game.hud.refreshBuildbar();
    this.game.hud.inspect(null);
    this.game.audio.play('click');
  }

  rotate(delta = 1) {
    if (this.tool) {
      this.tool.dir = (this.tool.dir + delta + 4) & 3;
      this.game.audio.play('rotate');
    } else if (this.selected && !BUILDINGS[this.selected.type].fixed) {
      this.game.send({ c: 'rotate', id: this.selected.id, dir: (this.selected.dir + delta + 4) & 3 });
      this.game.audio.play('rotate');
    }
  }

  pipette() {
    const b = this.hover;
    if (b && b.team === this.game.team && !BUILDINGS[b.type].fixed) {
      this.setTool(b.type);
      if (this.tool) {
        this.tool.dir = b.dir;
        this.tool.recipe = b.recipe;
      }
    } else this.setTool(null);
  }

  /** The tiles a belt drag would cover: an L from the drag start to the cursor. */
  linePath() {
    const [x1, y1] = this.tileAt();
    if (!this.drag) return [[x1, y1, this.tool.dir]];
    const { x0, y0 } = this.drag;
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (dx === 0 && dy === 0) return [[x0, y0, this.tool.dir]];
    const tiles = [];
    const horizFirst = Math.abs(dx) >= Math.abs(dy);
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    if (horizFirst) {
      const d1 = DIR_OF[`${sx},0`];
      for (let x = x0; x !== x1; x += sx) tiles.push([x, y0, d1]);
      const d2 = sy ? DIR_OF[`0,${sy}`] : d1;
      for (let y = y0; y !== y1; y += sy) tiles.push([x1, y, d2]);
      tiles.push([x1, y1, d2]);
    } else {
      const d1 = DIR_OF[`0,${sy}`];
      for (let y = y0; y !== y1; y += sy) tiles.push([x0, y, d1]);
      const d2 = sx ? DIR_OF[`${sx},0`] : d1;
      for (let x = x0; x !== x1; x += sx) tiles.push([x, y1, d2]);
      tiles.push([x1, y1, d2]);
    }
    return tiles;
  }

  ghosts() {
    if (!this.tool || !this.mouse.inside) return [];
    const { type } = this.tool;
    const team = this.game.team;
    if (TRANSPORT.has(type)) {
      const tiles = type === 'belt' ? this.linePath() : [[...this.tileAt(), this.tool.dir]];
      let budget = this.sim.teams[team].req;
      return tiles.map(([x, y, dir]) => {
        const existing = this.sim.buildingAt(x, y);
        const reorient = existing && existing.team === team && existing.type === type;
        const ok = reorient || (!placementError(this.sim, team, type, x, y) && (budget -= BUILDINGS[type].cost) >= 0);
        return { type, x, y, dir, ok };
      });
    }
    const [x, y] = this.anchor(type);
    const ok = !placementError(this.sim, team, type, x, y) && this.sim.teams[team].req >= BUILDINGS[type].cost;
    return [{ type, x, y, dir: this.tool.dir, ok }];
  }

  place() {
    const { type } = this.tool;
    const team = this.game.team;
    if (TRANSPORT.has(type)) {
      const tiles = type === 'belt' ? this.linePath() : [[...this.tileAt(), this.tool.dir]];
      const valid = tiles.filter(([x, y]) => {
        const e = this.sim.buildingAt(x, y);
        return (e && e.team === team && e.type === type) || !placementError(this.sim, team, type, x, y);
      });
      if (valid.length) {
        this.game.send({ c: 'line', type, tiles: valid });
        this.game.audio.play('build');
      } else this.explainPlacement(type, ...tiles[0]);
      return;
    }
    const [x, y] = this.anchor(type);
    const err = placementError(this.sim, team, type, x, y);
    if (err) {
      this.explainPlacement(type, x, y, err);
      return;
    }
    if (this.sim.teams[team].req < BUILDINGS[type].cost) {
      this.game.hud.toast('Not enough Requisition.', 'bad');
      this.game.audio.play('error');
      return;
    }
    this.game.send({ c: 'build', type, x, y, dir: this.tool.dir, recipe: this.tool.recipe });
    this.game.audio.play(BUILDINGS[type].w > 1 ? 'build_big' : 'build');
  }

  explainPlacement(type, x, y, err) {
    const reason = err || placementError(this.sim, this.game.team, type, x, y) || 'Not enough Requisition.';
    this.game.hud.toast(reason, 'bad');
    this.game.audio.play('error');
  }

  removeArea(r) {
    const tiles = [];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) tiles.push([x, y]);
    const own = tiles.filter(([x, y]) => {
      const b = this.sim.buildingAt(x, y);
      return b && b.team === this.game.team && !BUILDINGS[b.type].fixed;
    });
    if (!own.length) return;
    this.game.send({ c: 'remove', tiles: own });
    this.game.audio.play('remove');
    if (this.selected && own.some(([x, y]) => this.sim.buildingAt(x, y) === this.selected)) this.select(null);
  }

  select(b) {
    this.selected = b;
    this.game.hud.inspect(b);
    if (b) this.game.audio.play('click');
  }

  // ------------------------------------------------------------------ mouse

  onMove(e) {
    const m = this.mouse;
    m.sx = e.clientX;
    m.sy = e.clientY;
    m.inside = true;
    if (this.pan) {
      const s = this.view.scale;
      this.view.x = this.pan.vx - (e.clientX - this.pan.sx) / s;
      this.view.y = this.pan.vy - (e.clientY - this.pan.sy) / s;
      this.view.clamp();
    }
    [m.wx, m.wy] = this.view.toWorld(e.clientX, e.clientY);
    if (this.rdrag) {
      const [x, y] = this.tileAt();
      this.rdrag.x1 = x;
      this.rdrag.y1 = y;
      if (x !== this.rdrag.x0 || y !== this.rdrag.y0) this.rdrag.moved = true;
    }
  }

  onDown(e) {
    this.game.audio.unlock();
    this.onMove(e);
    if (e.button === 1 || (e.button === 0 && this.keys.has('Space'))) {
      e.preventDefault();
      this.pan = { sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
      return;
    }
    if (e.button === 0) {
      if (this.tool) {
        if (this.tool.type === 'belt') {
          const [x0, y0] = this.tileAt();
          this.drag = { x0, y0 };
        } else this.place();
      } else {
        this.select(this.hover);
      }
    } else if (e.button === 2) {
      const [x, y] = this.tileAt();
      this.rdrag = { x0: x, y0: y, x1: x, y1: y, moved: false };
    }
  }

  onUp(e) {
    if (e.button === 1 || (e.button === 0 && this.pan)) {
      this.pan = null;
      return;
    }
    if (e.button === 0 && this.drag) {
      if (this.tool) this.place();
      this.drag = null;
    }
    if (e.button === 2 && this.rdrag) {
      const r = this.rdrag;
      this.rdrag = null;
      if (!r.moved && this.tool) {
        this.setTool(null);
        return;
      }
      if (!r.moved && !this.hover) {
        this.select(null);
        return;
      }
      this.removeArea({
        x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1),
      });
    }
  }

  // ------------------------------------------------------------------ keyboard

  keyDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    this.game.audio.unlock();
    this.keys.add(e.code);
    const hud = this.game.hud;
    if (e.code === 'Escape') {
      if (hud.modalOpen()) hud.closeModals();
      else if (this.tool) this.setTool(null);
      else if (this.selected) this.select(null);
      else hud.togglePause();
      return;
    }
    if (hud.modalOpen() && e.code !== 'KeyT') return;
    const key = e.key.toLowerCase();
    const type = BUILD_ORDER.find((t) => BUILDINGS[t].hotkey === key);
    if (type && !e.ctrlKey && !e.metaKey) {
      this.setTool(this.tool?.type === type ? null : type);
      return;
    }
    switch (e.code) {
      case 'KeyR':
        this.rotate(e.shiftKey ? -1 : 1);
        break;
      case 'KeyQ':
        this.pipette();
        break;
      case 'KeyT':
        hud.toggleResearch();
        break;
      case 'KeyM':
        this.game.audio.toggleMute();
        hud.refreshMute();
        break;
      case 'KeyH':
        this.game.lookAtHome();
        break;
      case 'KeyG':
        this.game.lookAtFront();
        break;
      case 'KeyP':
        this.game.ping(this.mouse.wx, this.mouse.wy);
        break;
      case 'Delete':
      case 'Backspace':
        if (this.selected && !BUILDINGS[this.selected.type].fixed) {
          const b = this.selected;
          this.removeArea({ x0: b.x, y0: b.y, x1: b.x, y1: b.y });
        }
        break;
      case 'F1':
      case 'F2':
      case 'F3': {
        e.preventDefault();
        const lane = Number(e.code[1]) - 1;
        const cur = this.sim.teams[this.game.team].laneOrders[lane];
        this.game.send({ c: 'order', lane, order: cur === 'hold' ? 'advance' : 'hold' });
        break;
      }
      default:
        break;
    }
  }

  update(dt) {
    let vx = 0;
    let vy = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) vy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) vy += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) vx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) vx += 1;
    if (vx || vy) {
      const sp = (PAN_SPEED * dt) / Math.sqrt(this.view.zoom) * (this.keys.has('ShiftLeft') ? 2 : 1);
      this.view.x += vx * sp;
      this.view.y += vy * sp;
      this.view.clamp();
      [this.mouse.wx, this.mouse.wy] = this.view.toWorld(this.mouse.sx, this.mouse.sy);
    }
    const [tx, ty] = this.tileAt();
    this.hover = this.mouse.inside ? this.sim.buildingAt(tx, ty) : null;
    if (this.selected && (this.selected.removed || this.selected.dead && !BUILDINGS[this.selected.type].fixed)) this.select(null);
  }

  /** Overlay state for the renderer. */
  overlay() {
    return {
      tool: this.tool,
      team: this.game.team,
      ghosts: this.ghosts(),
      hover: this.hover,
      selected: this.selected,
      removeRect: this.rdrag?.moved ? {
        x0: Math.min(this.rdrag.x0, this.rdrag.x1), y0: Math.min(this.rdrag.y0, this.rdrag.y1),
        x1: Math.max(this.rdrag.x0, this.rdrag.x1), y1: Math.max(this.rdrag.y0, this.rdrag.y1),
      } : null,
    };
  }
}
