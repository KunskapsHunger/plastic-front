// Minimap: the whole playroom at a glance. Click or drag it to move the camera.
import { MAP_H, MAP_W } from '../shared/constants.js';
import { D_PELLETS, D_POWDER, D_TIN, T_FIELD, T_WALL, T_YARD, idx } from '../shared/map.js';
import { TEAM_COLORS } from '../client/palette.js';

const TERRAIN = { [T_FIELD]: '#d9c08a', [T_WALL]: '#8a6a4a', [T_YARD]: '#6f8f3e' };
const DEPOSIT = { [D_PELLETS]: '#f4efe4', [D_TIN]: '#9aa6b0', [D_POWDER]: '#2e2926' };

export class Minimap {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(canvas.clientWidth * dpr) || 680;
    canvas.height = Math.round(canvas.clientHeight * dpr) || 220;
    this.ctx = canvas.getContext('2d');
    this.base = this.renderBase();
    const jump = (e) => {
      const r = canvas.getBoundingClientRect();
      const v = game.view;
      v.x = ((e.clientX - r.left) / r.width) * MAP_W;
      v.y = ((e.clientY - r.top) / r.height) * MAP_H;
      v.clamp();
    };
    let dragging = false;
    this.abort = new AbortController();
    const opt = { signal: this.abort.signal };
    canvas.addEventListener('mousedown', (e) => {
      dragging = true;
      jump(e);
    }, opt);
    addEventListener('mousemove', (e) => dragging && jump(e), opt);
    addEventListener('mouseup', () => {
      dragging = false;
    }, opt);
  }

  destroy() {
    this.abort.abort();
  }

  renderBase() {
    const c = document.createElement('canvas');
    c.width = MAP_W;
    c.height = MAP_H;
    const ctx = c.getContext('2d');
    const { terrain, deposits } = this.game.sim.map;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const d = deposits[idx(x, y)];
        ctx.fillStyle = d ? DEPOSIT[d] : TERRAIN[terrain[idx(x, y)]] || '#c9955a';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  draw() {
    const { ctx, canvas } = this;
    const sim = this.game.sim;
    const sx = canvas.width / MAP_W;
    const sy = canvas.height / MAP_H;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, 0, 0, canvas.width, canvas.height);
    for (const b of sim.buildings) {
      if (b.dead) continue;
      ctx.fillStyle = b.type === 'belt' ? 'rgba(60,55,50,0.8)' : TEAM_COLORS[b.team]?.dark || '#555';
      ctx.fillRect(b.x * sx, b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
    }
    for (const u of sim.units) {
      ctx.fillStyle = u.team === this.game.team ? '#b9ff8a' : u.team === 2 ? '#ff5a3a' : '#ffe08a';
      const r = u.r > 0.6 ? 3 : 2;
      ctx.fillRect(u.x * sx - r / 2, u.y * sy - r / 2, r, r);
    }
    for (const p of sim.pings) {
      ctx.strokeStyle = '#ffd23a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x * sx, p.y * sy, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    const v = this.game.view.bounds(0);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(v.x0 * sx, v.y0 * sy, (v.x1 - v.x0) * sx, (v.y1 - v.y0) * sy);
  }
}
