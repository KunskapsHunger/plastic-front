// Camera: world tiles ⇄ screen pixels.
import { MAP_H, MAP_W } from '../shared/constants.js';
import { TP } from './palette.js';

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2.2;

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = 18;
    this.y = 22;
    this.zoom = 1;
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.shake = 0;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.clamp();
  }

  get scale() {
    return TP * this.zoom;
  }

  clamp() {
    const halfW = this.w / 2 / this.scale;
    const halfH = this.h / 2 / this.scale;
    const pad = 4;
    this.x = halfW * 2 > MAP_W + pad * 2 ? MAP_W / 2 : Math.min(MAP_W + pad - halfW, Math.max(-pad + halfW, this.x));
    this.y = halfH * 2 > MAP_H + pad * 2 ? MAP_H / 2 : Math.min(MAP_H + pad - halfH, Math.max(-pad + halfH, this.y));
  }

  apply(ctx) {
    const s = this.zoom * this.dpr;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0.01) {
      sx = (Math.random() - 0.5) * this.shake * 10;
      sy = (Math.random() - 0.5) * this.shake * 10;
    }
    ctx.setTransform(s, 0, 0, s, this.dpr * (this.w / 2 - this.x * this.scale + sx), this.dpr * (this.h / 2 - this.y * this.scale + sy));
  }

  toWorld(sx, sy) {
    return [this.x + (sx - this.w / 2) / this.scale, this.y + (sy - this.h / 2) / this.scale];
  }

  toScreen(wx, wy) {
    return [(wx - this.x) * this.scale + this.w / 2, (wy - this.y) * this.scale + this.h / 2];
  }

  bounds(margin = 1) {
    const hw = this.w / 2 / this.scale;
    const hh = this.h / 2 / this.scale;
    return { x0: this.x - hw - margin, y0: this.y - hh - margin, x1: this.x + hw + margin, y1: this.y + hh + margin };
  }

  visible(x, y, margin = 1) {
    const hw = this.w / 2 / this.scale + margin;
    const hh = this.h / 2 / this.scale + margin;
    return Math.abs(x - this.x) < hw && Math.abs(y - this.y) < hh;
  }

  zoomAt(sx, sy, factor) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const [nx, ny] = this.toWorld(sx, sy);
    this.x += wx - nx;
    this.y += wy - ny;
    this.clamp();
  }
}
