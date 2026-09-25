// Draws every building as a chunky plastic playset piece, in world pixels (TP per tile).
import { DX, DY } from '../shared/constants.js';
import { BUILDINGS, RECIPES } from '../shared/buildings.js';
import { ITEMS } from '../shared/items.js';
import { TEAM_COLORS, TOY, TP, shade } from './palette.js';
import { roundRect } from './terrain.js';
import { itemSprite, unitSprite } from './sprites.js';

const ELEV = 0.22; // front-face height as a fraction of a tile

function shadow(ctx, x, y, w, h, r = 8) {
  ctx.fillStyle = 'rgba(50,25,5,0.28)';
  roundRect(ctx, x + 5, y + 7, w, h, r);
  ctx.fill();
}

/** A pseudo-3D block: top face + darker front face. Returns the top-face rect. */
function body(ctx, x, y, w, h, color, r = 8) {
  const e = TP * ELEV;
  shadow(ctx, x, y, w, h, r);
  ctx.fillStyle = shade(color, -0.32);
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
  g.addColorStop(0, shade(color, 0.18));
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h - e, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  roundRect(ctx, x + 3, y + 3, w - 6, h - e - 6, Math.max(2, r - 3));
  ctx.stroke();
  return { x: x + 4, y: y + 4, w: w - 8, h: h - e - 8 };
}

function chute(ctx, b, color) {
  // output spout on the front edge
  const cx = (b.x + b.w / 2) * TP;
  const cy = (b.y + b.h / 2) * TP;
  const d = b.dir;
  const reach = (d === 0 || d === 2 ? b.w : b.h) * TP * 0.5;
  const ex = cx + DX[d] * (reach - 4);
  const ey = cy + DY[d] * (reach - 4);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate((d * Math.PI) / 2);
  ctx.fillStyle = shade(color, -0.45);
  ctx.beginPath();
  ctx.roundRect(-6, -TP * 0.34, 14, TP * 0.68, 4);
  ctx.fill();
  ctx.fillStyle = TOY.yellow;
  ctx.beginPath();
  ctx.moveTo(-2, -7);
  ctx.lineTo(7, 0);
  ctx.lineTo(-2, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function gear(ctx, cx, cy, r, teeth, angle, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r * 0.78;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.4);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = shade(color, -0.3);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function sandbags(ctx, cx, cy, r, n) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.85;
    ctx.fillStyle = 'rgba(40,25,10,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 3, r * 0.42, r * 0.26, a + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = i % 2 ? '#d8c08a' : '#cbb07a';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.42, r * 0.26, a + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8f7646';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function hpBar(ctx, b) {
  if (b.hp >= b.maxHp || b.dead) return;
  const w = b.w * TP * 0.8;
  const x = b.x * TP + (b.w * TP - w) / 2;
  const y = b.y * TP - 8;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 1, y - 1, w + 2, 6);
  const f = Math.max(0, b.hp / b.maxHp);
  ctx.fillStyle = f > 0.5 ? '#6fd04a' : f > 0.25 ? '#f5c542' : '#e0463a';
  ctx.fillRect(x, y, w * f, 4);
}

function ammoPips(ctx, b, max) {
  const n = Math.min(10, Math.ceil((b.shots / max) * 10));
  const x = b.x * TP + 4;
  const y = (b.y + b.h) * TP - 7;
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i < n ? TOY.yellow : 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + i * ((b.w * TP - 8) / 10), y, (b.w * TP - 8) / 10 - 1, 3);
  }
}

function scaffold(ctx, b, def) {
  const x = b.x * TP;
  const y = b.y * TP;
  const w = b.w * TP;
  const h = b.h * TP;
  const total = def.w * def.h <= 4 ? 20 : 40;
  const f = 1 - b.building / total;
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#e8d6b0';
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 6);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#c98f4a';
  ctx.lineWidth = 4;
  for (let i = -h; i < w; i += 16) {
    ctx.beginPath();
    ctx.moveTo(x + Math.max(0, i), y + Math.max(0, -i));
    ctx.lineTo(x + Math.min(w, i + h), y + Math.min(h, h - (i + h - w > 0 ? i + h - w : 0)));
    ctx.stroke();
  }
  ctx.fillStyle = TOY.yellow;
  ctx.fillRect(x + 4, y + h - 8, (w - 8) * f, 4);
}

// ------------------------------------------------------------------ transport

export function drawBeltBase(ctx, b, t, speed) {
  const x = b.x * TP;
  const y = b.y * TP;
  ctx.save();
  ctx.translate(x + TP / 2, y + TP / 2);
  ctx.rotate((b.dir * Math.PI) / 2);
  ctx.fillStyle = '#34302d';
  ctx.fillRect(-TP / 2, -TP * 0.4, TP, TP * 0.8);
  ctx.fillStyle = '#4a4541';
  ctx.fillRect(-TP / 2, -TP * 0.3, TP, TP * 0.6);
  // rolling chevrons
  const off = ((t * speed * TP) % (TP / 2)) - TP / 2;
  ctx.strokeStyle = 'rgba(245,197,66,0.75)';
  ctx.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    const cx = off + k * (TP / 2) - TP / 4;
    if (cx < -TP / 2 - 2 || cx > TP / 2 - 6) continue;
    ctx.beginPath();
    ctx.moveTo(cx - 4, -7);
    ctx.lineTo(cx + 3, 0);
    ctx.lineTo(cx - 4, 7);
    ctx.stroke();
  }
  // rails
  ctx.fillStyle = '#9aa3aa';
  ctx.fillRect(-TP / 2, -TP * 0.44, TP, TP * 0.1);
  ctx.fillRect(-TP / 2, TP * 0.34, TP, TP * 0.1);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(-TP / 2, -TP * 0.44, TP, 2);
  ctx.fillRect(-TP / 2, TP * 0.34, TP, 2);
  ctx.restore();
}

function drawJunction(ctx, b) {
  const x = b.x * TP;
  const y = b.y * TP;
  const top = body(ctx, x + 2, y + 2, TP - 4, TP - 4, '#8a949c', 6);
  ctx.strokeStyle = TOY.yellow;
  ctx.lineWidth = 3;
  const cx = top.x + top.w / 2;
  const cy = top.y + top.h / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy);
  ctx.lineTo(cx + 10, cy);
  ctx.moveTo(cx, cy - 9);
  ctx.lineTo(cx, cy + 9);
  ctx.stroke();
}

function drawRouter(ctx, b) {
  const x = b.x * TP;
  const y = b.y * TP;
  const color = b.type === 'sorter' ? TOY.purple : TOY.orange;
  const top = body(ctx, x + 2, y + 2, TP - 4, TP - 4, color, 6);
  const cx = top.x + top.w / 2;
  const cy = top.y + top.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((b.dir * Math.PI) / 2);
  ctx.strokeStyle = TOY.white;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(9, 0);
  if (b.type === 'splitter') {
    ctx.moveTo(-2, 0);
    ctx.lineTo(4, -9);
    ctx.moveTo(-2, 0);
    ctx.lineTo(4, 9);
  }
  ctx.stroke();
  ctx.restore();
  if (b.type === 'sorter' && b.filter) {
    ctx.drawImage(itemSprite(b.filter, b.team), cx - 10, cy - 11, 20, 20);
  }
}

// ------------------------------------------------------------------ production

function drawScoop(ctx, b, t) {
  const x = b.x * TP;
  const y = b.y * TP;
  const w = b.w * TP;
  const h = b.h * TP;
  const top = body(ctx, x + 3, y + 3, w - 6, h - 6, TOY.yellow);
  // hazard stripes along the front
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 3, y + h - 3 - TP * ELEV, w - 6, TP * ELEV);
  ctx.clip();
  ctx.fillStyle = '#222';
  for (let i = -20; i < w; i += 12) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + 6, y + h - TP * ELEV - 4);
    ctx.lineTo(x + i + 12, y + h - TP * ELEV - 4);
    ctx.lineTo(x + i + 6, y + h);
    ctx.fill();
  }
  ctx.restore();
  // bucket wheel
  const cx = top.x + top.w / 2;
  const cy = top.y + top.h / 2;
  const spin = b.active ? t * 2.5 : 0;
  ctx.fillStyle = '#3a2f28';
  ctx.beginPath();
  ctx.arc(cx, cy, top.w * 0.34, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const a = spin + (i / 6) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * top.w * 0.26, cy + Math.sin(a) * top.w * 0.26);
    ctx.rotate(a);
    ctx.fillStyle = TOY.red;
    ctx.fillRect(-5, -6, 10, 12);
    ctx.restore();
  }
  ctx.fillStyle = TOY.steel;
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  chute(ctx, b, TOY.yellow);
}

function drawPress(ctx, b, t) {
  const x = b.x * TP;
  const y = b.y * TP;
  const w = b.w * TP;
  const h = b.h * TP;
  const top = body(ctx, x + 3, y + 3, w - 6, h - 6, TOY.red);
  // glowing window
  ctx.fillStyle = b.active ? '#ffb347' : '#7a3a2a';
  ctx.fillRect(x + w * 0.3, y + h - 3 - TP * ELEV + 3, w * 0.4, TP * ELEV - 6);
  // press head stamping
  const stroke = b.active ? Math.max(0, Math.sin(t * 7)) * 8 : 0;
  ctx.fillStyle = TOY.steelDark;
  ctx.fillRect(top.x + top.w * 0.2, top.y + top.h * 0.2, top.w * 0.6, top.h * 0.6);
  const g = ctx.createLinearGradient(0, top.y, 0, top.y + top.h);
  g.addColorStop(0, '#eef3f6');
  g.addColorStop(1, TOY.steel);
  ctx.fillStyle = g;
  ctx.fillRect(top.x + top.w * 0.24, top.y + top.h * 0.14 - 8 + stroke, top.w * 0.52, top.h * 0.5);
  ctx.strokeStyle = TOY.steelDark;
  ctx.lineWidth = 2;
  ctx.strokeRect(top.x + top.w * 0.24, top.y + top.h * 0.14 - 8 + stroke, top.w * 0.52, top.h * 0.5);
  // chimney
  ctx.fillStyle = '#5a5552';
  ctx.fillRect(top.x + top.w - 12, top.y - 6, 9, 16);
  chute(ctx, b, TOY.red);
}

function drawTinworks(ctx, b, t) {
  const x = b.x * TP;
  const y = b.y * TP;
  const w = b.w * TP;
  const h = b.h * TP;
  const top = body(ctx, x + 3, y + 3, w - 6, h - 6, TOY.blue);
  const a = b.active ? t * 3 : 0;
  gear(ctx, top.x + top.w * 0.38, top.y + top.h * 0.5, top.w * 0.3, 10, a, TOY.steel);
  gear(ctx, top.x + top.w * 0.8, top.y + top.h * 0.3, top.w * 0.17, 7, -a * 1.7 + 0.3, TOY.yellow);
  chute(ctx, b, TOY.blue);
}

function drawMill(ctx, b, t) {
  const x = b.x * TP;
  const y = b.y * TP;
  const w = b.w * TP;
  const h = b.h * TP;
  const top = body(ctx, x + 3, y + 3, w - 6, h - 6, '#f0a33a');
  // rotating drum
  const dx = top.x + top.w * 0.12;
  const dy = top.y + top.h * 0.22;
  const dw = top.w * 0.76;
  const dh = top.h * 0.56;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(dx, dy, dw, dh, dh / 2);
  ctx.clip();
  ctx.fillStyle = '#e9e2d0';
  ctx.fillRect(dx, dy, dw, dh);
  const off = b.active ? (t * 40) % 16 : 0;
  ctx.fillStyle = TOY.red;
  for (let i = -16; i < dw; i += 16) ctx.fillRect(dx + i + off, dy, 7, dh);
  const g = ctx.createLinearGradient(0, dy, 0, dy + dh);
  g.addColorStop(0, 'rgba(255,255,255,0.4)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(dx, dy, dw, dh);
  ctx.restore();
  ctx.fillStyle = '#2a2420';
  ctx.font = '900 11px "Baloo 2", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(b.recipe === 'firecracker' ? 'BOOM' : 'POP', x + w / 2, y + h - 6);
  chute(ctx, b, '#f0a33a');
}

function drawBench(ctx, b, t, sim) {
  const x = b.x * TP;
  const y = b.y * TP;
  const w = b.w * TP;
  const h = b.h * TP;
  const top = body(ctx, x + 3, y + 3, w - 6, h - 6, '#b8793f', 10);
  // cutting mat
  ctx.fillStyle = '#3f8a5a';
  ctx.fillRect(top.x + 8, top.y + 8, top.w - 16, top.h - 16);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  for (let i = top.x + 16; i < top.x + top.w - 8; i += 10) {
    ctx.beginPath();
    ctx.moveTo(i, top.y + 8);
    ctx.lineTo(i, top.y + top.h - 8);
    ctx.stroke();
  }
  // the product on the mat
  const recipe = RECIPES[b.recipe];
  const crate = recipe && Object.keys(recipe.out)[0];
  const unit = crate && ITEMS[crate]?.unit;
  if (unit) {
    const spr = unitSprite(unit, b.team);
    const scale = unit === 'colossus' ? 0.2 : unit === 'tank' || unit === 'plane' ? 0.42 : 0.55;
    ctx.globalAlpha = b.progress > 0 ? 1 : 0.45;
    ctx.drawImage(spr.canvas, x + w / 2 - spr.ox * scale, top.y + top.h * 0.7 - spr.oy * scale, spr.canvas.width * scale, spr.canvas.height * scale);
    ctx.globalAlpha = 1;
  }
  // robot arms
  const wob = b.active ? Math.sin(t * 6) : 0;
  for (const side of [-1, 1]) {
    const bx = x + w / 2 + side * top.w * 0.42;
    const by = top.y + top.h * 0.25;
    ctx.strokeStyle = TOY.steelDark;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - side * 14, by + 16 + wob * 5 * side);
    ctx.lineTo(bx - side * 26 + wob * 4, by + 24 + wob * 3);
    ctx.stroke();
    ctx.fillStyle = TOY.red;
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // progress bar
  if (recipe && b.progress > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(top.x + 8, top.y + top.h - 6, top.w - 16, 4);
    ctx.fillStyle = TOY.yellow;
    ctx.fillRect(top.x + 8, top.y + top.h - 6, (top.w - 16) * Math.min(1, b.progress / recipe.time * (sim.teams[b.team].benchMult || 1)), 4);
  }
  chute(ctx, b, '#b8793f');
}

function drawReclaimer(ctx, b, t) {
  const x = b.x * TP;
  const y = b.y * TP;
  const w = b.w * TP;
  const h = b.h * TP;
  const top = body(ctx, x + 3, y + 3, w - 6, h - 6, '#3d9a5a', 14);
  const cx = top.x + top.w / 2;
  const cy = top.y + top.h / 2;
  ctx.fillStyle = '#23462f';
  ctx.beginPath();
  ctx.ellipse(cx, cy, top.w * 0.34, top.h * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  // a leg that did not quite make it in
  ctx.save();
  ctx.translate(cx + 6, cy - 2);
  ctx.rotate(0.6 + (b.active ? Math.sin(t * 5) * 0.15 : 0));
  ctx.fillStyle = TEAM_COLORS[b.team]?.base || '#5e9c3c';
  ctx.fillRect(-3, -18, 7, 18);
  ctx.fillRect(-3, -20, 11, 5);
  ctx.restore();
  ctx.strokeStyle = TOY.white;
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + t * 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, top.w * 0.42, a, a + 1.4);
    ctx.stroke();
  }
  chute(ctx, b, '#3d9a5a');
}

// ------------------------------------------------------------------ defence

function barrel(ctx, cx, cy, ax, ay, len, width, color) {
  const a = Math.atan2(ay || 0, ax || 1);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.fillStyle = color;
  ctx.fillRect(0, -width / 2, len, width);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, -width / 2, len, width);
  ctx.restore();
}

function drawPopgun(ctx, b, sim) {
  const cx = (b.x + 0.5) * TP;
  const cy = (b.y + 0.5) * TP;
  sandbags(ctx, cx, cy, TP * 0.36, 7);
  ctx.fillStyle = '#6b5a3a';
  ctx.beginPath();
  ctx.arc(cx, cy, TP * 0.2, 0, Math.PI * 2);
  ctx.fill();
  const fwd = b.team === 0 ? 1 : -1;
  barrel(ctx, cx, cy - 3, b.aimX ?? fwd, b.aimY ?? 0, TP * 0.42, 7, '#c69552');
  ctx.fillStyle = TOY.red;
  ctx.beginPath();
  ctx.arc(cx, cy - 3, 5, 0, Math.PI * 2);
  ctx.fill();
  ammoPips(ctx, b, BUILDINGS.popgun.maxShots);
}

function drawMortarPit(ctx, b) {
  const cx = (b.x + 1) * TP;
  const cy = (b.y + 1) * TP;
  sandbags(ctx, cx, cy, TP * 0.75, 11);
  ctx.fillStyle = '#6b5a3a';
  ctx.beginPath();
  ctx.arc(cx, cy, TP * 0.5, 0, Math.PI * 2);
  ctx.fill();
  const fwd = b.team === 0 ? 1 : -1;
  const ax = b.aimX ?? fwd;
  barrel(ctx, cx, cy, ax, -Math.abs(ax) * 0.8, TP * 0.6, 14, '#4a4f55');
  ctx.fillStyle = '#2a2d31';
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fill();
  ammoPips(ctx, b, BUILDINGS.mortarpit.maxShots);
}

function drawFlak(ctx, b, t) {
  const cx = (b.x + 1) * TP;
  const cy = (b.y + 1) * TP;
  body(ctx, b.x * TP + 4, b.y * TP + 4, b.w * TP - 8, b.h * TP - 8, '#6d7f5a', 30);
  const fwd = b.team === 0 ? 1 : -1;
  const ax = b.aimX ?? fwd;
  const ay = b.aimY ?? -1;
  barrel(ctx, cx - 5, cy - 6, ax, ay, TP * 0.62, 6, '#3d4247');
  barrel(ctx, cx + 5, cy - 6, ax, ay, TP * 0.62, 6, '#3d4247');
  ctx.fillStyle = TOY.steel;
  ctx.beginPath();
  ctx.arc(cx, cy - 6, 11, 0, Math.PI * 2);
  ctx.fill();
  ammoPips(ctx, b, BUILDINGS.flak.maxShots);
}

// ------------------------------------------------------------------ fixed structures

function flag(ctx, x, y, h, color, t, team) {
  ctx.fillStyle = '#6b4a2a';
  ctx.fillRect(x - 2, y - h, 4, h);
  ctx.fillStyle = TOY.yellow;
  ctx.beginPath();
  ctx.arc(x, y - h, 4, 0, Math.PI * 2);
  ctx.fill();
  const dir = team === 0 ? 1 : -1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - h + 3);
  for (let i = 0; i <= 8; i++) {
    const fx = x + dir * i * 4;
    ctx.lineTo(fx, y - h + 3 + Math.sin(t * 5 + i * 0.7) * 2.5);
  }
  for (let i = 8; i >= 0; i--) {
    const fx = x + dir * i * 4;
    ctx.lineTo(fx, y - h + 19 + Math.sin(t * 5 + i * 0.7) * 2.5);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = TOY.white;
  ctx.font = '900 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('★', x + dir * 16, y - h + 15 + Math.sin(t * 5 + 4) * 2.5);
}

function drawGate(ctx, b, t) {
  const col = TEAM_COLORS[b.team];
  const x = b.x * TP;
  const y = b.y * TP;
  const w = b.w * TP;
  const h = b.h * TP;
  if (b.dead) {
    drawRubble(ctx, x, y, w, h, col.base);
    return;
  }
  const top = body(ctx, x + 2, y + 2, w - 4, h - 4, col.base, 4);
  // crenellations
  ctx.fillStyle = col.light;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(top.x + i * (top.w / 4) + 2, top.y - 6, top.w / 4 - 6, 8);
    ctx.fillRect(top.x + i * (top.w / 4) + 2, top.y + top.h - 4, top.w / 4 - 6, 6);
  }
  // the door faces the sandbox
  const fwd = b.team === 0 ? 1 : -1;
  const dx = fwd > 0 ? x + w - 16 : x + 4;
  ctx.fillStyle = '#2b1d12';
  ctx.beginPath();
  ctx.roundRect(dx, y + h * 0.28, 12, h * 0.44, [6, 6, 0, 0]);
  ctx.fill();
  ctx.fillStyle = shade(col.base, -0.2);
  ctx.fillRect(top.x + 8, top.y + 8, top.w - 36, top.h - 16);
  // queued crates
  const q = b.queue?.length || 0;
  for (let i = 0; i < q; i++) ctx.drawImage(itemSprite(b.queue[i], b.team), top.x + 6 + (i % 2) * 18, top.y + 6 + Math.floor(i / 2) * 16, 18, 18);
  flag(ctx, x + w / 2, y + 6, 30, col.base, t, b.team);
  hpBar(ctx, b);
}

function drawHQ(ctx, b, t) {
  const col = TEAM_COLORS[b.team];
  const x = b.x * TP;
  const y = b.y * TP;
  const w = b.w * TP;
  const h = b.h * TP;
  if (b.dead) {
    drawRubble(ctx, x, y, w, h, col.base);
    return;
  }
  const top = body(ctx, x + 2, y + 2, w - 4, h - 4, col.base, 12);
  // gold trim bands
  ctx.fillStyle = '#e8b93a';
  ctx.fillRect(top.x, top.y + top.h * 0.18, top.w, 7);
  ctx.fillRect(top.x, top.y + top.h * 0.78, top.w, 7);
  ctx.fillRect(top.x + top.w * 0.12, top.y, 7, top.h);
  ctx.fillRect(top.x + top.w * 0.82, top.y, 7, top.h);
  // the emblem
  const cx = top.x + top.w / 2;
  const cy = top.y + top.h / 2;
  ctx.fillStyle = TOY.white;
  ctx.beginPath();
  ctx.arc(cx, cy, top.w * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = TOY.red;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 ? top.w * 0.11 : top.w * 0.24;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  // antenna and flag
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(top.x + 10, top.y + 10);
  ctx.lineTo(top.x + 10, top.y - 26);
  ctx.stroke();
  ctx.fillStyle = Math.sin(t * 4) > 0 ? '#ff4a3a' : '#7a2a20';
  ctx.beginPath();
  ctx.arc(top.x + 10, top.y - 27, 3.5, 0, Math.PI * 2);
  ctx.fill();
  flag(ctx, top.x + top.w - 12, top.y + 10, 44, TOY.red, t, b.team);
  ctx.fillStyle = TOY.ink;
  ctx.font = '900 12px "Baloo 2", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('COMMAND', cx, y + h - 8);
  hpBar(ctx, b);
}

function drawRubble(ctx, x, y, w, h, color) {
  ctx.fillStyle = 'rgba(30,20,10,0.35)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w * 0.55, h * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 9; i++) {
    const px = x + ((i * 37) % w);
    const py = y + ((i * 53) % h);
    ctx.fillStyle = i % 3 ? shade(color, -0.3) : '#3a332d';
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(i);
    ctx.fillRect(-6, -4, 12 + (i % 4) * 3, 8);
    ctx.restore();
  }
}

function drawBurrow(ctx, b, t) {
  const x = b.x * TP;
  const y = b.y * TP;
  const w = b.w * TP;
  const h = b.h * TP;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const big = b.type === 'hive';
  const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, w * (big ? 0.75 : 0.9));
  g.addColorStop(0, '#6b4a2e');
  g.addColorStop(0.7, '#8a6440');
  g.addColorStop(1, 'rgba(138,100,64,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * (big ? 0.8 : 0.9), h * (big ? 0.6 : 0.75), 0, 0, Math.PI * 2);
  ctx.fill();
  if (b.dead) {
    ctx.fillStyle = 'rgba(40,30,20,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.3, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const holes = big ? [[0, -0.25], [-0.25, 0.1], [0.2, 0.2], [0, 0.35]] : [[0, 0]];
  for (const [hx, hy] of holes) {
    ctx.fillStyle = '#1a0f08';
    ctx.beginPath();
    ctx.ellipse(cx + hx * w, cy + hy * h, big ? 14 : 16, big ? 9 : 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(170,220,60,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx + hx * w, cy + hy * h + 2, 7 + Math.sin(t * 3 + hx * 9) * 2, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  hpBar(ctx, b);
}

// ------------------------------------------------------------------ dispatch

export function drawBuilding(ctx, b, t, sim) {
  const def = BUILDINGS[b.type];
  if (b.building > 0) {
    scaffold(ctx, b, def);
    return;
  }
  switch (b.type) {
    case 'junction': drawJunction(ctx, b); break;
    case 'splitter':
    case 'sorter': drawRouter(ctx, b); break;
    case 'scoop': drawScoop(ctx, b, t); break;
    case 'press': drawPress(ctx, b, t); break;
    case 'tinworks': drawTinworks(ctx, b, t); break;
    case 'mill': drawMill(ctx, b, t); break;
    case 'bench': drawBench(ctx, b, t, sim); break;
    case 'reclaimer': drawReclaimer(ctx, b, t); break;
    case 'popgun': drawPopgun(ctx, b, sim); break;
    case 'mortarpit': drawMortarPit(ctx, b); break;
    case 'flak': drawFlak(ctx, b, t); break;
    case 'gate': drawGate(ctx, b, t); break;
    case 'hq': drawHQ(ctx, b, t); break;
    case 'burrow':
    case 'hive': drawBurrow(ctx, b, t); break;
    default: break;
  }
  if (!def.fixed && b.type !== 'belt') {
    if (sim.tick - (b.hitTick ?? -99) < 3) {
      ctx.fillStyle = 'rgba(255,60,40,0.35)';
      ctx.fillRect(b.x * TP, b.y * TP, b.w * TP, b.h * TP);
    }
    hpBar(ctx, b);
  }
}
