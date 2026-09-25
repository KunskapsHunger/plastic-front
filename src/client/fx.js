// Particles and permanent battlefield scars. Purely cosmetic: nothing here touches the simulation,
// so it may use Math.random freely. Debris that comes to rest is baked into the terrain forever.
import { TEAM_COLORS, TOY, TP, shade } from './palette.js';
import { UNITS } from '../shared/units.js';

const MAX_PARTICLES = 1800;
const GRAVITY = 22; // tiles/s² for debris height

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

const DEATH_LINES = [
  'MOMMY!', 'FOR THE TOYBOX!', 'I can\'t feel my base!', 'Tell my mold I loved her', 'Not like this...',
  'MEDIC!', 'Is this... recycling?', 'I was two days from the shelf!', 'Worth it!', 'Service... guarantees...',
  'Remember me as a hero!', 'My legs! Where are my legs?', 'I regret nothing!', 'Ow.',
];
const MELT_LINES = ['I\'m melting!', 'So... warm...', 'It burns!', 'Not the face!'];
const DEPLOY_LINES = ['Reporting for duty!', 'Let\'s go!', 'For the Federation!', 'Point me at them!', 'I\'m fresh from the mold!', 'Hooah!'];

export class Fx {
  constructor(terrain) {
    this.terrain = terrain; // canvas that decals are baked into
    this.tctx = terrain.getContext('2d');
    this.list = [];
    this.bubbleCooldown = 0;
  }

  add(p) {
    if (this.list.length >= MAX_PARTICLES) {
      // drop the oldest cosmetic smoke first
      const i = this.list.findIndex((q) => q.kind === 'smoke');
      this.list.splice(i >= 0 ? i : 0, 1);
    }
    p.age = 0;
    this.list.push(p);
  }

  // ------------------------------------------------------------------ emitters

  muzzle(x, y, tx, ty, team, src) {
    const heavy = src === 'mg' || src === 'flak' || src === 'popgun';
    this.add({ kind: 'tracer', x, y: y - 0.45, tx, ty: ty - 0.35, life: heavy ? 0.06 : 0.09, color: heavy ? '#fff0a0' : '#fffbe0' });
    this.add({ kind: 'flash', x: x + (tx > x ? 0.25 : -0.25), y: y - 0.48, life: 0.06, size: heavy ? 0.14 : 0.2 });
    if (Math.random() < 0.4) this.add({ kind: 'smoke', x, y: y - 0.45, vx: rand(-0.2, 0.2), vy: -0.3, life: 0.6, size: 0.12, color: '#f4f0e8' });
  }

  explosion(x, y, r, dtype) {
    const acid = dtype === 'acid';
    this.add({ kind: 'ring', x, y, life: 0.35, size: r });
    this.add({ kind: 'flash', x, y: y - 0.2, life: 0.12, size: r * 0.9, color: acid ? '#c8ff5a' : '#fff2a8' });
    const n = Math.min(14, 6 + r * 5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.3, 1.4) * r;
      this.add({
        kind: 'smoke', x: x + Math.cos(a) * 0.2, y: y + Math.sin(a) * 0.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 0.4,
        life: rand(0.6, 1.3), size: rand(0.25, 0.5) * r, color: acid ? '#9ab84a' : pick(['#6b625a', '#8a8078', '#4a433d']),
      });
    }
    for (let i = 0; i < 8; i++) {
      this.add({ kind: 'spark', x, y, vx: rand(-4, 4), vy: rand(-4, 4), z: 0, vz: rand(2, 7), life: rand(0.3, 0.6), color: acid ? '#d8ff6a' : pick([TOY.yellow, TOY.orange, '#fff']) });
    }
    if (Math.random() < 0.55 && !acid) this.comic(x, y - r * 0.6, pick(['POP!', 'BANG!', 'KA-BLAM!', 'BOOM!', 'PFFT!']), r);
    this.decal('crater', x, y, r, acid);
  }

  comic(x, y, text, r = 1) {
    this.add({ kind: 'text', x, y, text, life: 0.7, size: 0.5 + r * 0.25, rot: rand(-0.3, 0.3), color: pick([TOY.yellow, '#ffffff', TOY.orange]) });
  }

  bubble(x, y, text) {
    if (this.bubbleCooldown > 0) return;
    this.bubbleCooldown = 0.35;
    this.add({ kind: 'bubble', x, y: y - 1.1, text, life: 2.2, vy: -0.15 });
  }

  flame(x, y, tx, ty) {
    const dx = tx - x;
    const dy = ty - y;
    for (let i = 0; i < 5; i++) {
      const f = rand(0.2, 1);
      this.add({
        kind: 'fire', x: x + dx * 0.15, y: y - 0.4 + dy * 0.15, vx: dx * f * 2.2 + rand(-0.4, 0.4), vy: dy * f * 2.2 + rand(-0.4, 0.4) - 0.3,
        life: rand(0.25, 0.45), size: rand(0.18, 0.34),
      });
    }
  }

  heal(x, y, tx, ty) {
    this.add({ kind: 'glue', x, y: y - 0.4, tx, ty: ty - 0.4, life: 0.3 });
  }

  launch(x, y) {
    this.add({ kind: 'smoke', x, y: y - 0.5, vx: rand(-0.3, 0.3), vy: -0.6, life: 0.9, size: 0.3, color: '#dcd6cc' });
  }

  /** A soldier breaks. How depends on what broke him. */
  death(ev) {
    const { x, y, team, type, dtype } = ev;
    const def = UNITS[type];
    const col = TEAM_COLORS[team] || TEAM_COLORS[0];
    if (def?.bug) {
      const goo = type === 'bombardier' ? '#f08a2c' : type === 'wasp' ? '#e0d040' : '#a8c83a';
      for (let i = 0; i < 10; i++) {
        this.add({ kind: 'goo', x, y, z: 0.2, vx: rand(-3, 3), vy: rand(-3, 3), vz: rand(1, 5), life: 2, size: rand(0.06, 0.14), color: goo });
      }
      for (let i = 0; i < 4; i++) {
        this.add({ kind: 'leg', x, y, z: 0.2, vx: rand(-3, 3), vy: rand(-2, 2), vz: rand(2, 6), life: 3, size: def.radius * 0.8, rot: rand(0, 6), vr: rand(-12, 12), color: '#1a120d' });
      }
      this.decal('goo', x, y, def.radius * 2.2, goo);
      return;
    }
    if (def?.vehicle) {
      this.explosion(x, y, 1.2 + def.radius, 'blast');
      for (let i = 0; i < 12; i++) {
        this.add({ kind: 'tin', x, y: y - 0.3, z: 0.3, vx: rand(-4, 4), vy: rand(-3, 3), vz: rand(3, 9), life: 4, size: rand(0.08, 0.2), rot: rand(0, 6), vr: rand(-15, 15), color: pick([col.base, TOY.steel, TOY.yellow, col.dark]) });
      }
      this.add({ kind: 'spring', x, y, z: 0.4, vx: rand(-2, 2), vy: rand(-2, 2), vz: 10, life: 4, size: 0.2, rot: 0, vr: 20 });
      this.decal('wreck', x, y, def.radius, col);
      return;
    }
    if (dtype === 'fire') {
      // melted: a sagging puddle and a lot of black smoke
      for (let i = 0; i < 6; i++) this.add({ kind: 'smoke', x: x + rand(-0.2, 0.2), y: y - 0.3, vx: rand(-0.2, 0.2), vy: -0.8, life: rand(1, 2), size: rand(0.2, 0.35), color: '#2e2a28' });
      this.decal('puddle', x, y, 0.45, col);
      if (Math.random() < 0.35) this.bubble(x, y, pick(MELT_LINES));
      return;
    }
    // snapped: head, torso, legs and base go their separate ways
    const force = dtype === 'blast' ? 2.2 : 1;
    const parts = ['head', 'torso', 'leg', 'leg', 'base', 'gun'];
    for (const p of parts) {
      this.add({
        kind: 'piece', part: p, x, y, z: p === 'base' ? 0.02 : 0.4, vx: rand(-2.5, 2.5) * force, vy: rand(-1.5, 1.5) * force,
        vz: p === 'base' ? 1 : rand(2, 6) * force, life: 5, size: 1, rot: rand(0, 6), vr: rand(-14, 14), col,
      });
    }
    for (let i = 0; i < 6; i++) {
      this.add({ kind: 'shard', x, y, z: 0.3, vx: rand(-3, 3) * force, vy: rand(-2, 2) * force, vz: rand(1, 5), life: 3, size: rand(0.04, 0.09), rot: rand(0, 6), vr: rand(-20, 20), color: pick([col.base, col.light, col.dark]) });
    }
    if (Math.random() < 0.18) this.bubble(x, y, pick(DEATH_LINES));
  }

  deployed(x, y) {
    if (Math.random() < 0.06) this.bubble(x, y, pick(DEPLOY_LINES));
  }

  buildingDeath(ev) {
    this.explosion(ev.x, ev.y, 1.2 + Math.max(ev.w, ev.h) * 0.4, 'blast');
    for (let i = 0; i < 16; i++) {
      this.add({ kind: 'tin', x: ev.x, y: ev.y, z: 0.4, vx: rand(-5, 5), vy: rand(-4, 4), vz: rand(3, 10), life: 4, size: rand(0.1, 0.25), rot: rand(0, 6), vr: rand(-15, 15), color: pick([TOY.red, TOY.yellow, TOY.blue, TOY.steel, '#b8793f']) });
    }
  }

  // ------------------------------------------------------------------ decals

  decal(kind, x, y, r, arg) {
    const c = this.tctx;
    const px = x * TP;
    const py = y * TP;
    const pr = r * TP;
    c.save();
    if (kind === 'crater') {
      const g = c.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, arg ? 'rgba(90,120,20,0.45)' : 'rgba(30,22,16,0.55)');
      g.addColorStop(0.6, arg ? 'rgba(90,120,20,0.2)' : 'rgba(50,38,28,0.28)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(px, py, pr, 0, Math.PI * 2);
      c.fill();
      if (!arg) {
        c.strokeStyle = 'rgba(255,240,210,0.18)';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(px, py, pr * 0.45, 0, Math.PI * 2);
        c.stroke();
      }
    } else if (kind === 'puddle') {
      c.fillStyle = arg.dark;
      c.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const rr = pr * rand(0.6, 1.1);
        c.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr * 0.6);
      }
      c.closePath();
      c.fill();
      c.fillStyle = arg.base;
      c.beginPath();
      c.ellipse(px - 2, py - 2, pr * 0.6, pr * 0.35, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.beginPath();
      c.ellipse(px - pr * 0.25, py - pr * 0.15, pr * 0.18, pr * 0.07, -0.3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(20,15,10,0.35)';
      c.beginPath();
      c.arc(px + pr * 0.4, py + pr * 0.1, pr * 0.3, 0, Math.PI * 2);
      c.fill();
    } else if (kind === 'goo') {
      c.fillStyle = arg;
      c.globalAlpha = 0.75;
      for (let i = 0; i < 7; i++) {
        c.beginPath();
        c.arc(px + rand(-pr, pr) * 0.7, py + rand(-pr, pr) * 0.5, rand(pr * 0.15, pr * 0.45), 0, Math.PI * 2);
        c.fill();
      }
    } else if (kind === 'wreck') {
      c.fillStyle = 'rgba(20,16,12,0.5)';
      c.beginPath();
      c.ellipse(px, py, pr * 1.6, pr, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = shade(arg.dark, -0.4);
      c.save();
      c.translate(px, py - 4);
      c.rotate(rand(-0.4, 0.4));
      c.fillRect(-pr, -pr * 0.35, pr * 2, pr * 0.7);
      c.fillStyle = '#2a2622';
      c.fillRect(-pr * 0.9, pr * 0.2, pr * 1.8, pr * 0.3);
      c.restore();
    } else if (kind === 'scorch') {
      const g = c.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, 'rgba(20,15,10,0.4)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    c.restore();
  }

  /** Paint a resting particle into the terrain so the battlefield keeps it. */
  bake(p) {
    const c = this.tctx;
    c.save();
    c.translate(p.x * TP, p.y * TP);
    c.rotate(p.rot || 0);
    this.drawShape(c, p, TP);
    c.restore();
  }

  drawShape(c, p, s) {
    switch (p.kind) {
      case 'piece': {
        const col = p.col;
        c.fillStyle = col.base;
        c.strokeStyle = col.deep;
        c.lineWidth = 1.5;
        if (p.part === 'head') {
          c.beginPath();
          c.arc(0, 0, s * 0.07, 0, Math.PI * 2);
          c.fill();
          c.stroke();
          c.fillStyle = col.light;
          c.beginPath();
          c.arc(0, -s * 0.02, s * 0.085, Math.PI, 0);
          c.fill();
        } else if (p.part === 'torso') {
          c.fillRect(-s * 0.09, -s * 0.13, s * 0.18, s * 0.26);
          c.strokeRect(-s * 0.09, -s * 0.13, s * 0.18, s * 0.26);
        } else if (p.part === 'leg') {
          c.fillRect(-s * 0.035, -s * 0.15, s * 0.07, s * 0.3);
        } else if (p.part === 'base') {
          c.fillStyle = col.dark;
          c.beginPath();
          c.ellipse(0, 0, s * 0.22, s * 0.08, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = col.base;
          c.fillRect(-s * 0.06, -s * 0.06, s * 0.05, s * 0.06);
          c.fillRect(s * 0.02, -s * 0.06, s * 0.05, s * 0.06);
        } else {
          c.fillStyle = col.dark;
          c.fillRect(-s * 0.18, -s * 0.02, s * 0.36, s * 0.04);
        }
        break;
      }
      case 'shard':
      case 'tin':
        c.fillStyle = p.color;
        c.beginPath();
        c.moveTo(-p.size * s, 0);
        c.lineTo(0, -p.size * s * 0.6);
        c.lineTo(p.size * s * 0.8, p.size * s * 0.3);
        c.closePath();
        c.fill();
        break;
      case 'goo':
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(0, 0, p.size * s, 0, Math.PI * 2);
        c.fill();
        break;
      case 'leg':
        c.strokeStyle = p.color;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(-p.size * s * 0.4, 0);
        c.lineTo(0, -p.size * s * 0.25);
        c.lineTo(p.size * s * 0.4, p.size * s * 0.1);
        c.stroke();
        break;
      case 'spring':
        c.strokeStyle = '#d9a82a';
        c.lineWidth = 2.5;
        c.beginPath();
        for (let i = 0; i <= 16; i++) c.lineTo(-8 + i, Math.sin(i * 1.4) * 5);
        c.stroke();
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ update + draw

  update(dt) {
    this.bubbleCooldown -= dt;
    const keep = [];
    for (const p of this.list) {
      p.age += dt;
      if (p.vz !== undefined) {
        p.vz -= GRAVITY * dt;
        p.z += p.vz * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.vr) p.rot += p.vr * dt;
        if (p.z <= 0) {
          p.z = 0;
          if (Math.abs(p.vz) > 2.5) {
            p.vz = -p.vz * 0.35;
            p.vx *= 0.5;
            p.vy *= 0.5;
            p.vr *= 0.5;
          } else if (p.kind !== 'spark') {
            this.bake(p);
            continue;
          } else continue;
        }
      } else if (p.vx !== undefined) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 'smoke' || p.kind === 'fire') {
          p.vx *= 0.96;
          p.vy *= 0.96;
        }
      } else if (p.kind === 'bubble' || p.kind === 'text') {
        p.y += (p.vy ?? -0.4) * dt;
      }
      if (p.age < p.life) keep.push(p);
    }
    this.list = keep;
  }

  draw(ctx, view) {
    for (const p of this.list) {
      if (!view.visible(p.x, p.y, 3)) continue;
      const f = p.age / p.life;
      const px = p.x * TP;
      const py = (p.y - (p.z || 0)) * TP;
      switch (p.kind) {
        case 'tracer':
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = 1 - f;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(p.tx * TP, p.ty * TP);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case 'glue':
          ctx.strokeStyle = 'rgba(255,255,245,0.85)';
          ctx.lineWidth = 3;
          ctx.setLineDash([4, 5]);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(p.tx * TP, p.ty * TP);
          ctx.stroke();
          ctx.setLineDash([]);
          break;
        case 'flash': {
          const r = p.size * TP * (1 - f * 0.5);
          ctx.fillStyle = p.color || '#fff6c0';
          ctx.globalAlpha = 1 - f;
          ctx.beginPath();
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const rr = i % 2 ? r * 0.45 : r;
            ctx.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
          }
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case 'ring':
          ctx.strokeStyle = `rgba(255,240,200,${0.8 * (1 - f)})`;
          ctx.lineWidth = 4 * (1 - f) + 1;
          ctx.beginPath();
          ctx.ellipse(px, py, p.size * TP * (0.3 + f), p.size * TP * (0.2 + f * 0.6), 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'smoke':
          ctx.fillStyle = p.color;
          ctx.globalAlpha = 0.55 * (1 - f);
          ctx.beginPath();
          ctx.arc(px, py, p.size * TP * (0.6 + f), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        case 'fire': {
          ctx.fillStyle = f < 0.3 ? '#fff3b0' : f < 0.6 ? '#ffb347' : '#e0463a';
          ctx.globalAlpha = 0.9 * (1 - f);
          ctx.beginPath();
          ctx.arc(px, py, p.size * TP * (1 - f * 0.4), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case 'spark':
          ctx.fillStyle = p.color;
          ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
          break;
        case 'text':
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(p.rot);
          ctx.scale(1 + f * 0.3, 1 + f * 0.3);
          ctx.globalAlpha = f > 0.7 ? (1 - f) / 0.3 : 1;
          ctx.font = `900 ${Math.round(p.size * TP)}px "Bangers", "Baloo 2", Impact, sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 5;
          ctx.strokeStyle = TOY.ink;
          ctx.strokeText(p.text, 0, 0);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, 0, 0);
          ctx.restore();
          break;
        case 'bubble': {
          ctx.save();
          ctx.globalAlpha = f > 0.8 ? (1 - f) / 0.2 : 1;
          ctx.font = '700 13px "Baloo 2", sans-serif';
          const w = ctx.measureText(p.text).width + 14;
          ctx.fillStyle = '#fffdf5';
          ctx.strokeStyle = TOY.ink;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(px - w / 2, py - 22, w, 22, 9);
          ctx.moveTo(px - 4, py);
          ctx.lineTo(px, py + 8);
          ctx.lineTo(px + 4, py);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = TOY.ink;
          ctx.textAlign = 'center';
          ctx.fillText(p.text, px, py - 6);
          ctx.restore();
          break;
        }
        default:
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(p.rot || 0);
          this.drawShape(ctx, p, TP);
          ctx.restore();
          break;
      }
    }
  }
}
