// Draws one frame: terrain (with its scars), belts, items, buildings, soldiers, shells, particles,
// and the build/selection overlays. World drawing happens in world pixels (TP per tile).
import { DX, DY, FIELD_X0, FIELD_X1, MAP_H, TEAM_GREEN } from '../shared/constants.js';
import { BUILDINGS } from '../shared/buildings.js';
import { UNITS } from '../shared/units.js';
import { zoneTeam } from '../shared/map.js';
import { renderTerrain } from './terrain.js';
import { drawBeltBase, drawBuilding } from './draw-buildings.js';
import { SPR, drawBug, itemSprite, unitSprite } from './sprites.js';
import { Fx } from './fx.js';
import { TEAM_COLORS, TOY, TP } from './palette.js';
import { beltWorldPos } from '../sim/transport.js';

const FIRE_POSE = 0.12; // seconds a unit shows its firing sprite

export class Renderer {
  constructor(canvas, view, sim) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = view;
    this.terrain = renderTerrain(sim);
    this.fx = new Fx(this.terrain);
    this.lastFire = new Map();
    this.time = 0;
  }

  /** Turn simulation events into particles, decals and remembered muzzle flashes. */
  onEvents(events, now) {
    const fx = this.fx;
    for (const ev of events) {
      switch (ev.e) {
        case 'shot':
          if (ev.uid) this.lastFire.set(ev.uid, now);
          if (this.view.visible(ev.x, ev.y, 4)) fx.muzzle(ev.x, ev.y, ev.tx, ev.ty, ev.team, ev.src);
          break;
        case 'flame':
          if (ev.uid) this.lastFire.set(ev.uid, now);
          if (this.view.visible(ev.x, ev.y, 4)) fx.flame(ev.x, ev.y, ev.tx, ev.ty);
          break;
        case 'launch':
          if (ev.uid) this.lastFire.set(ev.uid, now);
          if (this.view.visible(ev.x, ev.y, 4)) fx.launch(ev.x, ev.y);
          break;
        case 'heal':
          if (this.view.visible(ev.x, ev.y, 4)) fx.heal(ev.x, ev.y, ev.tx, ev.ty);
          break;
        case 'boom':
          fx.explosion(ev.x, ev.y, ev.r || 1, ev.dtype);
          if (this.view.visible(ev.x, ev.y, 2)) this.view.shake = Math.min(1, this.view.shake + (ev.r || 1) * 0.08);
          break;
        case 'bite':
          if (this.view.visible(ev.x, ev.y, 4) && Math.random() < 0.3) fx.add({ kind: 'spark', x: ev.x, y: ev.y, z: 0.3, vx: 0, vy: 0, vz: 3, life: 0.2, color: '#fff' });
          break;
        case 'death':
          fx.death(ev);
          this.lastFire.delete(ev.id);
          break;
        case 'bdeath':
          fx.buildingDeath(ev);
          this.view.shake = Math.min(1.2, this.view.shake + 0.4);
          break;
        default:
          break;
      }
    }
  }

  draw(sim, alpha, dt, ui) {
    this.time += dt;
    const t = this.time;
    const { ctx, view } = this;
    view.shake *= 0.86;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    view.apply(ctx);
    const vb = view.bounds(2);

    // terrain + scars
    const sx = Math.max(0, Math.floor(vb.x0 * TP));
    const sy = Math.max(0, Math.floor(vb.y0 * TP));
    const sw = Math.min(this.terrain.width - sx, Math.ceil((vb.x1 - vb.x0) * TP));
    const sh = Math.min(this.terrain.height - sy, Math.ceil((vb.y1 - vb.y0) * TP));
    if (sw > 0 && sh > 0) ctx.drawImage(this.terrain, sx, sy, sw, sh, sx, sy, sw, sh);

    if (ui.tool) this.drawGrid(ctx, vb, ui.team);

    // belts first, then everything they carry, then the machines
    const beltSpeed = (team) => sim.teams[team].beltStep * 20;
    const inView = (b) => b.x + b.w >= vb.x0 && b.x <= vb.x1 && b.y + b.h >= vb.y0 && b.y <= vb.y1;
    const visible = sim.buildings.filter(inView);
    for (const b of visible) if (b.type === 'belt') drawBeltBase(ctx, b, t, beltSpeed(b.team));
    this.drawItems(ctx, visible, alpha);
    const solid = visible.filter((b) => b.type !== 'belt').sort((a, b) => a.y + a.h - (b.y + b.h));
    for (const b of solid) drawBuilding(ctx, b, t, sim);

    this.drawPings(ctx, sim, t);
    this.drawUnits(ctx, sim, alpha, t, vb);
    this.drawProjectiles(ctx, sim, alpha);
    this.fx.update(dt);
    this.fx.draw(ctx, view);
    this.drawOverlays(ctx, sim, ui, t);

    // screen-space light: warm window glow from the top left + vignette
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const W = this.canvas.width;
    const H = this.canvas.height;
    const g = ctx.createRadialGradient(W * 0.2, -H * 0.2, 0, W * 0.2, -H * 0.2, Math.max(W, H) * 1.1);
    g.addColorStop(0, 'rgba(255,230,170,0.16)');
    g.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(30,15,5,0)');
    v.addColorStop(1, 'rgba(30,15,5,0.4)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  drawGrid(ctx, vb, team) {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = Math.max(0, Math.floor(vb.x0));
    const x1 = Math.ceil(vb.x1);
    for (let x = x0; x <= x1; x++) {
      if (zoneTeam(Math.min(x, 135)) !== team && zoneTeam(Math.max(0, x - 1)) !== team) continue;
      ctx.moveTo(x * TP, 0);
      ctx.lineTo(x * TP, MAP_H * TP);
    }
    const gx0 = team === TEAM_GREEN ? 0 : FIELD_X1;
    const gx1 = team === TEAM_GREEN ? FIELD_X0 : 136;
    for (let y = 0; y <= MAP_H; y++) {
      ctx.moveTo(gx0 * TP, y * TP);
      ctx.lineTo(gx1 * TP, y * TP);
    }
    ctx.stroke();
  }

  drawItems(ctx, visible, alpha) {
    const s = TP * 0.46;
    for (const b of visible) {
      if (b.type === 'belt') {
        for (const it of b.items) {
          const [wx, wy] = beltWorldPos(b, Math.min(1, it.pos));
          const x = it.ox === undefined ? wx : it.ox + (wx - it.ox) * alpha;
          const y = it.oy === undefined ? wy : it.oy + (wy - it.oy) * alpha;
          ctx.drawImage(itemSprite(it.t, b.team), x * TP - s / 2, y * TP - s / 2 - 3, s, s);
        }
      } else if (b.type === 'junction') {
        for (const q of b.jq) for (const e of q) ctx.drawImage(itemSprite(e.it.t, b.team), (b.x + 0.5) * TP - s / 2, (b.y + 0.5) * TP - s / 2 - 3, s, s);
      }
    }
  }

  drawUnits(ctx, sim, alpha, t, vb) {
    const list = [];
    for (const u of sim.units) {
      const x = u.px + (u.x - u.px) * alpha;
      const y = u.py + (u.y - u.py) * alpha;
      if (x < vb.x0 || x > vb.x1 || y < vb.y0 || y > vb.y1 + 1) continue;
      list.push([u, x, y]);
    }
    list.sort((a, b) => (a[0].air - b[0].air) || a[2] - b[2]);
    const k = TP / SPR;
    for (const [u, x, y] of list) {
      const def = UNITS[u.type];
      const px = x * TP;
      const py = y * TP;
      if (def.bug) {
        ctx.save();
        ctx.translate(px, py);
        if (u.facing < 0) ctx.scale(-1, 1);
        drawBug(ctx, u.type, TP, t + u.id * 0.37, u.moving);
        ctx.restore();
      } else {
        const firing = t - (this.lastFire.get(u.id) ?? -9) < FIRE_POSE;
        const spr = unitSprite(u.type, u.team, firing && !def.vehicle);
        let lift = 0;
        let tilt = 0;
        if (u.air) {
          lift = TP * (1.3 + Math.sin(t * 2 + u.id) * 0.1);
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.beginPath();
          ctx.ellipse(px, py, TP * 0.5, TP * 0.14, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (u.moving && !def.vehicle) {
          // army men don't have knees: they hop
          const ph = t * 9 + u.id;
          lift = Math.abs(Math.sin(ph)) * TP * 0.12;
          tilt = Math.sin(ph) * 0.08;
        } else if (def.vehicle && u.moving) {
          lift = Math.sin(t * 30 + u.id) * 0.6;
        }
        if (!u.air) {
          ctx.fillStyle = 'rgba(40,25,10,0.28)';
          ctx.beginPath();
          ctx.ellipse(px + 3, py + 2, TP * u.r * 0.95, TP * u.r * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.save();
        ctx.translate(px, py - lift);
        if (tilt) ctx.rotate(tilt);
        if (u.facing < 0) ctx.scale(-1, 1);
        ctx.drawImage(spr.canvas, -spr.ox * k, -spr.oy * k, spr.canvas.width * k, spr.canvas.height * k);
        if (u.type === 'plane') this.drawPropeller(ctx, t, k);
        if (u.type === 'tank') this.drawWindKey(ctx, t, u.moving);
        ctx.restore();
      }
      if (u.burn > 0 && Math.random() < 0.5) this.fx.add({ kind: 'fire', x: x + (Math.random() - 0.5) * 0.3, y: y - 0.4, vx: 0, vy: -1, life: 0.35, size: 0.14 });
      if (u.hp < u.maxHp * 0.9 && (def.vehicle || def.bug || this.view.zoom > 1.2 || u.maxHp > 200)) {
        const w = TP * Math.max(0.5, u.r * 1.6);
        const top = py - TP * (def.bug ? def.radius * 1.9 + 0.2 : u.air ? 2 : 1.05);
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(px - w / 2, top, w, 3);
        ctx.fillStyle = def.bug ? '#ff6a3a' : TEAM_COLORS[u.team].light;
        ctx.fillRect(px - w / 2, top, w * Math.max(0, u.hp / u.maxHp), 3);
        ctx.globalAlpha = 1;
      }
    }
  }

  drawPropeller(ctx, t, k) {
    ctx.fillStyle = 'rgba(40,40,40,0.35)';
    const r = SPR * 0.28 * k * Math.abs(Math.sin(t * 40));
    ctx.beginPath();
    ctx.ellipse(SPR * 0.56 * k, -SPR * 0.28 * k, 3, Math.max(2, r), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawWindKey(ctx, t, moving) {
    const a = moving ? t * 6 : 0;
    ctx.save();
    ctx.translate(-TP * 0.62, -TP * 0.4);
    ctx.scale(Math.cos(a), 1);
    ctx.fillStyle = TOY.yellow;
    ctx.strokeStyle = '#8a6a1a';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-1.5, -4, 3, 8);
    for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(0, sy * 8, 6, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawProjectiles(ctx, sim, alpha) {
    for (const p of sim.projectiles) {
      const f = Math.min(1, (p.t + alpha * 0.05) / p.flight);
      const x = p.x0 + (p.x1 - p.x0) * f;
      const y = p.y0 + (p.y1 - p.y0) * f;
      const h = 4 * f * (1 - f) * (p.flight * 3.2 + 0.4);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(x * TP, y * TP, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const color = p.dtype === 'acid' ? '#b8e04a' : p.src === 'grenadier' ? '#3d4a2a' : '#2a2a2a';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x * TP, (y - h - 0.4) * TP, p.src === 'grenadier' ? 3.5 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      if (p.src !== 'grenadier' && p.dtype !== 'acid') {
        ctx.fillStyle = 'rgba(255,200,120,0.8)';
        ctx.fillRect(x * TP - 1, (y - h - 0.4) * TP - 1, 2, 2);
      }
    }
  }

  drawPings(ctx, sim, t) {
    for (const p of sim.pings) {
      const f = (t * 1.5) % 1;
      ctx.strokeStyle = `rgba(255,220,60,${1 - f})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x * TP, p.y * TP, TP * (0.3 + f * 1.2), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = TOY.yellow;
      ctx.beginPath();
      ctx.arc(p.x * TP, p.y * TP, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawOverlays(ctx, sim, ui, t) {
    // hovered / selected building outline and turret ranges
    const outline = (b, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 5]);
      ctx.lineDashOffset = -t * 20;
      ctx.strokeRect(b.x * TP + 1, b.y * TP + 1, b.w * TP - 2, b.h * TP - 2);
      ctx.setLineDash([]);
    };
    const range = (cx, cy, r, color) => {
      ctx.strokeStyle = color;
      ctx.fillStyle = color.replace(/[\d.]+\)$/, '0.07)');
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx * TP, cy * TP, r * TP, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    if (ui.hover && !ui.tool) outline(ui.hover, 'rgba(255,255,255,0.7)');
    if (ui.selected && !ui.selected.removed) {
      outline(ui.selected, TOY.yellow);
      const def = BUILDINGS[ui.selected.type];
      if (def.attack) range(ui.selected.x + ui.selected.w / 2, ui.selected.y + ui.selected.h / 2, def.attack.range + Math.max(ui.selected.w, ui.selected.h) / 2, 'rgba(245,197,66,0.8)');
    }
    // build ghosts
    for (const g of ui.ghosts || []) {
      const def = BUILDINGS[g.type];
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = g.ok ? 'rgba(120,230,120,0.35)' : 'rgba(240,80,60,0.4)';
      ctx.fillRect(g.x * TP, g.y * TP, def.w * TP, def.h * TP);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = g.ok ? '#b9ffb0' : '#ff8a70';
      ctx.lineWidth = 2;
      ctx.strokeRect(g.x * TP + 1, g.y * TP + 1, def.w * TP - 2, def.h * TP - 2);
      // direction arrow
      const cx = (g.x + def.w / 2) * TP;
      const cy = (g.y + def.h / 2) * TP;
      if (def.w * def.h <= 1 && g.type !== 'belt' && g.type !== 'popgun') continue;
      if (['popgun', 'mortarpit', 'flak'].includes(g.type)) {
        range(g.x + def.w / 2, g.y + def.h / 2, def.attack.range + def.w / 2, 'rgba(255,255,255,0.6)');
        continue;
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((g.dir * Math.PI) / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      const L = def.w * TP * 0.35;
      ctx.beginPath();
      ctx.moveTo(L, 0);
      ctx.lineTo(L - 10, -8);
      ctx.lineTo(L - 10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-L * 0.5, -3, L * 1.2, 6);
      ctx.restore();
    }
    if (ui.removeRect) {
      const r = ui.removeRect;
      ctx.fillStyle = 'rgba(230,60,40,0.18)';
      ctx.strokeStyle = 'rgba(255,100,80,0.9)';
      ctx.lineWidth = 2;
      ctx.fillRect(r.x0 * TP, r.y0 * TP, (r.x1 - r.x0 + 1) * TP, (r.y1 - r.y0 + 1) * TP);
      ctx.strokeRect(r.x0 * TP, r.y0 * TP, (r.x1 - r.x0 + 1) * TP, (r.y1 - r.y0 + 1) * TP);
    }
    // hint arrows from machines to what they feed
    if (ui.selected && ui.selected.out !== undefined && !BUILDINGS[ui.selected.type].fixed) {
      const b = ui.selected;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      const cx = (b.x + b.w / 2) * TP;
      const cy = (b.y + b.h / 2) * TP;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + DX[b.dir] * b.w * TP, cy + DY[b.dir] * b.h * TP);
      ctx.stroke();
    }
  }
}
