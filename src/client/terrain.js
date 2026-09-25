// Pre-renders the static playroom: floorboards, the sandbox, alphabet-block walls, deposits.
// Also owns the persistent "scar" layer where the battlefield remembers every death.
import { FIELD_X0, FIELD_X1, LANES, MAP_H, MAP_W, MODE_BUGHUNT } from '../shared/constants.js';
import { D_PELLETS, D_POWDER, D_TIN, T_WALL, T_YARD, idx } from '../shared/map.js';
import { Rng } from '../shared/rng.js';
import { BLOCK_COLORS, TOY, TP, shade } from './palette.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ------------------------------------------------------------------ floorboards

function drawFloor(ctx, rng, x0, x1, tint) {
  const px0 = x0 * TP;
  const px1 = x1 * TP;
  const plankH = TP * 0.92;
  const rows = Math.ceil((MAP_H * TP) / plankH);
  const bases = tint === 'cool' ? ['#cf9d62', '#c89458', '#d6a86e', '#c28d52'] : ['#d9a466', '#d19a5b', '#e0ae72', '#cc9455'];
  for (let r = 0; r < rows; r++) {
    const y = r * plankH;
    let x = px0 - rng.range(0, 200);
    while (x < px1) {
      const len = rng.range(140, 340);
      const base = rng.pick(bases);
      const g = ctx.createLinearGradient(0, y, 0, y + plankH);
      g.addColorStop(0, shade(base, 0.08));
      g.addColorStop(0.5, base);
      g.addColorStop(1, shade(base, -0.08));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, len, plankH);
      // grain
      ctx.strokeStyle = 'rgba(120,70,30,0.13)';
      ctx.lineWidth = 1;
      const lines = 3 + rng.int(3);
      for (let i = 0; i < lines; i++) {
        const gy = y + rng.range(4, plankH - 4);
        ctx.beginPath();
        ctx.moveTo(x, gy);
        const amp = rng.range(1, 4);
        for (let gx = x; gx <= x + len; gx += 20) ctx.lineTo(gx, gy + Math.sin(gx * 0.02 + i) * amp);
        ctx.stroke();
      }
      if (rng.chance(0.18)) {
        // knot
        const kx = x + rng.range(20, len - 20);
        const ky = y + rng.range(8, plankH - 8);
        ctx.fillStyle = 'rgba(110,60,25,0.25)';
        ctx.beginPath();
        ctx.ellipse(kx, ky, rng.range(4, 9), rng.range(2, 4), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // seams and nails
      ctx.fillStyle = 'rgba(80,45,20,0.55)';
      ctx.fillRect(x + len - 1.5, y, 1.5, plankH);
      ctx.fillStyle = 'rgba(70,50,40,0.5)';
      for (const ny of [y + plankH * 0.25, y + plankH * 0.75]) {
        ctx.beginPath();
        ctx.arc(x + len - 6, ny, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      x += len;
    }
    ctx.fillStyle = 'rgba(80,45,20,0.6)';
    ctx.fillRect(px0, y + plankH - 1.5, px1 - px0, 1.5);
  }
}

function drawRug(ctx, x, y, w, h, color) {
  const px = x * TP;
  const py = y * TP;
  const pw = w * TP;
  const ph = h * TP;
  ctx.save();
  ctx.shadowColor = 'rgba(60,30,10,0.35)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  roundRect(ctx, px, py, pw, ph, 18);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = shade(color, 0.35);
  ctx.lineWidth = 6;
  roundRect(ctx, px + 14, py + 14, pw - 28, ph - 28, 12);
  ctx.stroke();
  ctx.strokeStyle = shade(color, -0.25);
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 3;
  roundRect(ctx, px + 26, py + 26, pw - 52, ph - 52, 8);
  ctx.stroke();
  ctx.setLineDash([]);
  // tassels
  ctx.fillStyle = shade(color, 0.5);
  for (let tx = px + 8; tx < px + pw - 8; tx += 10) {
    ctx.fillRect(tx, py - 6, 3, 7);
    ctx.fillRect(tx, py + ph - 1, 3, 7);
  }
}

// ------------------------------------------------------------------ the sandbox

function drawSand(ctx, rng, x0, x1) {
  const px0 = x0 * TP;
  const pw = (x1 - x0) * TP;
  const ph = MAP_H * TP;
  ctx.fillStyle = '#e6cf9c';
  ctx.fillRect(px0, 0, pw, ph);
  // damp and dry patches
  for (let i = 0; i < 70; i++) {
    const cx = px0 + rng.range(0, pw);
    const cy = rng.range(0, ph);
    const r = rng.range(40, 160);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const dark = rng.chance(0.5);
    g.addColorStop(0, dark ? 'rgba(170,130,80,0.18)' : 'rgba(255,240,205,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  // ripples
  ctx.lineWidth = 2;
  for (let i = 0; i < 160; i++) {
    const cx = px0 + rng.range(0, pw);
    const cy = rng.range(0, ph);
    const len = rng.range(30, 90);
    ctx.strokeStyle = rng.chance(0.5) ? 'rgba(255,245,215,0.35)' : 'rgba(170,130,85,0.18)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + len / 2, cy + rng.range(-8, 8), cx + len, cy + rng.range(-3, 3));
    ctx.stroke();
  }
  // grains
  const grains = Math.floor((pw * ph) / 90);
  const tones = ['#f4e2b8', '#d4b67c', '#c9a870', '#fff3d6', '#b89560'];
  for (let i = 0; i < grains; i++) {
    ctx.fillStyle = tones[i % tones.length];
    ctx.globalAlpha = rng.range(0.25, 0.7);
    ctx.fillRect(px0 + rng.range(0, pw), rng.range(0, ph), rng.range(1, 2.4), rng.range(1, 2.4));
  }
  ctx.globalAlpha = 1;
  // pebbles
  for (let i = 0; i < 90; i++) {
    const cx = px0 + rng.range(0, pw);
    const cy = rng.range(0, ph);
    const r = rng.range(2, 5);
    ctx.fillStyle = 'rgba(90,70,45,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx + 1.5, cy + 1.5, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rng.pick(['#b7a48a', '#a39079', '#cdbfa8', '#8f8170']);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.8, rng.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGrass(ctx, rng, x0, x1) {
  const px0 = x0 * TP;
  const pw = (x1 - x0) * TP;
  const ph = MAP_H * TP;
  ctx.fillStyle = '#6f8f3e';
  ctx.fillRect(px0, 0, pw, ph);
  for (let i = 0; i < 60; i++) {
    const cx = px0 + rng.range(0, pw);
    const cy = rng.range(0, ph);
    const r = rng.range(40, 140);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rng.chance(0.4) ? 'rgba(120,85,45,0.45)' : 'rgba(150,190,80,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.lineWidth = 1.5;
  for (let i = 0; i < (pw * ph) / 60; i++) {
    const gx = px0 + rng.range(0, pw);
    const gy = rng.range(0, ph);
    ctx.strokeStyle = rng.pick(['#8db552', '#5b7a2f', '#a6c865', '#4e6b28']);
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + rng.range(-3, 3), gy - rng.range(4, 10));
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ walls: blocks, books, crayons

function drawBlock(ctx, rng, cx, cy, size, color, letter) {
  const s = size;
  const h = s * 0.28; // visible front face (3/4 view)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rng.range(-0.12, 0.12));
  ctx.fillStyle = 'rgba(40,25,10,0.3)';
  roundRect(ctx, -s / 2 + 6, -s / 2 + 8, s, s + h, 6);
  ctx.fill();
  ctx.fillStyle = shade(color, -0.3);
  roundRect(ctx, -s / 2, -s / 2, s, s + h, 6);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, -s / 2, -s / 2, s, s, 6);
  ctx.fill();
  ctx.fillStyle = shade(color, 0.25);
  roundRect(ctx, -s / 2 + 4, -s / 2 + 4, s - 8, s - 8, 4);
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.15);
  ctx.lineWidth = 2;
  roundRect(ctx, -s / 2 + 6, -s / 2 + 6, s - 12, s - 12, 3);
  ctx.stroke();
  ctx.fillStyle = TOY.white;
  ctx.font = `900 ${Math.round(s * 0.55)}px "Baloo 2", "Arial Rounded MT Bold", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 0, s * 0.03);
  ctx.restore();
}

function drawBook(ctx, rng, x, y, w, h) {
  const color = rng.pick(['#3d5a99', '#a8362e', '#2f7a5a', '#6b4a8a', '#c07a2a']);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rng.range(-0.08, 0.08));
  ctx.fillStyle = 'rgba(40,25,10,0.3)';
  ctx.fillRect(-w / 2 + 6, -h / 2 + 8, w, h);
  ctx.fillStyle = '#f3ecd9';
  ctx.fillRect(-w / 2 + 3, -h / 2 + 3, w - 3, h);
  ctx.strokeStyle = 'rgba(150,140,120,0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 3, h / 2 - 2 - i * 2);
    ctx.lineTo(w / 2, h / 2 - 2 - i * 2);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -h / 2, w - 4, h - 6);
  ctx.fillStyle = shade(color, -0.25);
  ctx.fillRect(-w / 2, -h / 2, 10, h - 6);
  ctx.fillStyle = 'rgba(255,230,160,0.8)';
  ctx.fillRect(-w / 2 + 22, -h / 2 + (h - 6) / 2 - 3, w * 0.45, 6);
  ctx.restore();
}

function drawCrayon(ctx, rng, x, y) {
  const color = rng.pick(BLOCK_COLORS);
  const len = rng.range(70, 110);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rng.range(-0.6, 0.6));
  ctx.fillStyle = 'rgba(40,25,10,0.25)';
  ctx.fillRect(-len / 2 + 3, -5, len, 12);
  ctx.fillStyle = color;
  ctx.fillRect(-len / 2, -7, len - 16, 14);
  ctx.beginPath();
  ctx.moveTo(len / 2 - 16, -7);
  ctx.lineTo(len / 2, 0);
  ctx.lineTo(len / 2 - 16, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-len / 2, -5, len - 16, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-len / 2 + 12, -7, 4, 14);
  ctx.fillRect(len / 2 - 32, -7, 4, 14);
  ctx.restore();
}

function drawWall(ctx, rng, y0, y1) {
  const py0 = y0 * TP;
  const ph = (y1 - y0) * TP;
  // a strip of darker, trampled sand under the blocks
  ctx.fillStyle = 'rgba(150,115,70,0.28)';
  ctx.fillRect(FIELD_X0 * TP, py0 + 4, (FIELD_X1 - FIELD_X0) * TP, ph - 8);
  let x = FIELD_X0 * TP + 20;
  const end = FIELD_X1 * TP - 20;
  while (x < end) {
    const r = rng.next();
    if (r < 0.14 && x + 140 < end) {
      drawBook(ctx, rng, x, py0 + rng.range(8, 20), rng.range(110, 150), ph - rng.range(30, 44));
      x += 150;
    } else if (r < 0.2) {
      drawCrayon(ctx, rng, x + 40, py0 + ph / 2 + rng.range(-20, 20));
      x += 60;
    } else {
      const size = rng.range(TP * 1.1, TP * 1.45);
      const stacked = rng.chance(0.3);
      drawBlock(ctx, rng, x + size / 2, py0 + ph * 0.3 + rng.range(-6, 6), size, rng.pick(BLOCK_COLORS), rng.pick(LETTERS));
      drawBlock(ctx, rng, x + size / 2 + rng.range(-8, 8), py0 + ph * 0.66 + rng.range(-6, 6), size, rng.pick(BLOCK_COLORS), rng.pick(LETTERS));
      if (stacked) drawBlock(ctx, rng, x + size / 2, py0 + ph * 0.45, size * 0.9, rng.pick(BLOCK_COLORS), rng.pick(LETTERS));
      x += size + rng.range(2, 14);
    }
  }
}

function drawFrame(ctx, bughunt) {
  const wood = (x, y, w, h, vertical) => {
    const g = vertical ? ctx.createLinearGradient(x, 0, x + w, 0) : ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#b77a45');
    g.addColorStop(0.35, '#d69a5f');
    g.addColorStop(1, '#8a5530');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(80,40,15,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  };
  const x0 = FIELD_X0 * TP;
  const x1 = FIELD_X1 * TP;
  ctx.save();
  ctx.shadowColor = 'rgba(40,20,5,0.4)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  wood(x0 - 10, 0, x1 - x0 + 20, TP * 0.75, false);
  wood(x0 - 10, MAP_H * TP - TP * 0.75, x1 - x0 + 20, TP * 0.75, false);
  // vertical rims, broken at each gate
  for (const [side, rx] of [[0, x0 - 4], [1, x1 - 10]]) {
    if (side === 1 && bughunt) continue;
    let y = TP * 0.75;
    for (const l of LANES) {
      const gy = Math.round((l.y0 + l.y1) / 2) - 1;
      wood(rx, y, 14, gy * TP - y, true);
      y = (gy + 2) * TP;
    }
    wood(rx, y, 14, MAP_H * TP - TP * 0.75 - y, true);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ deposits

function blobPoints(rng, x, y, w, h, n) {
  const pts = [];
  const cx = x + w / 2;
  const cy = y + h / 2;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next());
    pts.push([cx + Math.cos(a) * r * w * 0.55, cy + Math.sin(a) * r * h * 0.55, r]);
  }
  return pts;
}

function drawPellets(ctx, rng, x, y, w, h) {
  const colors = ['#fbf7ee', '#f7d6e0', '#cfe6f7', '#fff0b8', '#d9f2d0', '#ffffff'];
  ctx.fillStyle = 'rgba(120,80,40,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2 + 6, y + h / 2 + 8, w * 0.56, h * 0.56, 0, 0, Math.PI * 2);
  ctx.fill();
  const pts = blobPoints(rng, x, y, w, h, Math.floor((w * h) / 22)).sort((a, b) => a[1] - b[1]);
  for (const [px, py] of pts) {
    ctx.fillStyle = 'rgba(80,60,40,0.3)';
    ctx.beginPath();
    ctx.arc(px + 1, py + 1.5, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rng.pick(colors);
    ctx.beginPath();
    ctx.arc(px, py, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(px - 1.6, py - 1.8, 1.4, 1.4);
  }
  drawSack(ctx, x + w * 0.1, y + h * 0.05, '#efe6d0', 'PELLETS');
}

function drawSack(ctx, x, y, color, label) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.25);
  ctx.fillStyle = 'rgba(40,25,10,0.3)';
  roundRect(ctx, 4, 6, 58, 44, 12);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, 0, 0, 58, 44, 12);
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.3);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = TOY.red;
  ctx.font = '900 10px "Baloo 2", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 29, 27);
  ctx.restore();
}

function drawTin(ctx, rng, x, y, w, h) {
  ctx.fillStyle = 'rgba(60,60,70,0.2)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2 + 6, y + h / 2 + 8, w * 0.56, h * 0.56, 0, 0, Math.PI * 2);
  ctx.fill();
  const pts = blobPoints(rng, x, y, w, h, Math.floor((w * h) / 140)).sort((a, b) => a[1] - b[1]);
  for (const [px, py] of pts) {
    if (rng.chance(0.22)) {
      // a little tin can on its side
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rng.range(0, Math.PI));
      ctx.fillStyle = 'rgba(40,40,50,0.35)';
      ctx.fillRect(-11, -6, 24, 14);
      const g = ctx.createLinearGradient(0, -7, 0, 7);
      g.addColorStop(0, '#e6edf2');
      g.addColorStop(0.5, '#a7b3bd');
      g.addColorStop(1, '#6f7c87');
      ctx.fillStyle = g;
      ctx.fillRect(-12, -7, 24, 14);
      ctx.fillStyle = rng.pick([TOY.red, TOY.blue, TOY.yellow]);
      ctx.fillRect(-5, -7, 10, 14);
      ctx.restore();
    } else {
      // bottle cap
      const r = rng.range(5, 7);
      const c = rng.pick(['#c9d2d9', '#e0463a', '#3b82d6', '#f5c542', '#9aa6b0']);
      ctx.fillStyle = 'rgba(40,40,50,0.35)';
      ctx.beginPath();
      ctx.arc(px + 1.5, py + 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(c, -0.2);
      ctx.beginPath();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const rr = k % 2 ? r : r * 0.86;
        ctx.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
      }
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(px, py, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(px - r * 0.25, py - r * 0.25, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPowder(ctx, rng, x, y, w, h) {
  const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, Math.max(w, h) * 0.6);
  g.addColorStop(0, 'rgba(40,34,32,0.95)');
  g.addColorStop(0.7, 'rgba(60,52,48,0.8)');
  g.addColorStop(1, 'rgba(60,52,48,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w * 0.6, h * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  const pts = blobPoints(rng, x, y, w, h, Math.floor((w * h) / 10));
  for (const [px, py] of pts) {
    ctx.fillStyle = rng.pick(['#1e1a19', '#4a413d', '#2d2826', '#6b5f58']);
    ctx.fillRect(px, py, rng.range(1, 3), rng.range(1, 3));
  }
  const tubes = Math.floor((w * h) / 1400);
  for (let i = 0; i < tubes; i++) {
    const [px, py] = blobPoints(rng, x, y, w, h, 1)[0];
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rng.range(0, Math.PI));
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-9, -2, 20, 8);
    ctx.fillStyle = TOY.red;
    ctx.fillRect(-10, -4, 20, 8);
    ctx.fillStyle = TOY.yellow;
    ctx.fillRect(-4, -4, 3, 8);
    ctx.strokeStyle = '#3a2a20';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.quadraticCurveTo(14, -4, 17, -1);
    ctx.stroke();
    ctx.restore();
  }
  drawSack(ctx, x + w * 0.55, y + h * 0.72, '#d8322a', 'BANG!');
}

function drawDeposits(ctx, rng, deposits) {
  // group contiguous deposit tiles into rects for nicer piles
  const seen = new Uint8Array(deposits.length);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const k = deposits[idx(x, y)];
      if (!k || seen[idx(x, y)]) continue;
      let w = 0;
      while (x + w < MAP_W && deposits[idx(x + w, y)] === k) w++;
      let h = 0;
      while (y + h < MAP_H && deposits[idx(x, y + h)] === k) h++;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) seen[idx(xx, yy)] = 1;
      const rect = [x * TP, y * TP, w * TP, h * TP];
      if (k === D_PELLETS) drawPellets(ctx, rng, ...rect);
      else if (k === D_TIN) drawTin(ctx, rng, ...rect);
      else if (k === D_POWDER) drawPowder(ctx, rng, ...rect);
    }
  }
}

function drawHive(ctx, rng) {
  // dirt mounds around the Swarm's holes are drawn by the building renderer; here: trampled dirt paths
  for (const l of LANES) {
    const cy = ((l.y0 + l.y1) / 2) * TP;
    const g = ctx.createLinearGradient(FIELD_X1 * TP, 0, MAP_W * TP, 0);
    g.addColorStop(0, 'rgba(120,85,50,0.55)');
    g.addColorStop(1, 'rgba(120,85,50,0.2)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(FIELD_X1 * TP, cy - TP * 2);
    ctx.quadraticCurveTo((FIELD_X1 + 18) * TP, cy, (MAP_W - 6) * TP, 22 * TP - TP);
    ctx.lineTo((MAP_W - 6) * TP, 22 * TP + TP);
    ctx.quadraticCurveTo((FIELD_X1 + 18) * TP, cy + TP * 0.5, FIELD_X1 * TP, cy + TP * 2);
    ctx.fill();
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = 'rgba(90,60,35,0.4)';
    ctx.beginPath();
    ctx.ellipse(rng.range(FIELD_X1, MAP_W) * TP, rng.range(0, MAP_H) * TP, rng.range(4, 10), rng.range(3, 6), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Render the whole static world once. */
export function renderTerrain(sim) {
  const c = canvas(MAP_W * TP, MAP_H * TP);
  const ctx = c.getContext('2d');
  const rng = new Rng(1234);
  const bughunt = sim.mode === MODE_BUGHUNT;
  drawFloor(ctx, rng, 0, FIELD_X0, 'warm');
  drawRug(ctx, 0.3, 16.5, 7.4, 11, '#b8423a');
  if (bughunt) drawGrass(ctx, rng, FIELD_X1, MAP_W);
  else {
    drawFloor(ctx, rng, FIELD_X1, MAP_W, 'cool');
    drawRug(ctx, MAP_W - 7.7, 16.5, 7.4, 11, '#3a5fb8');
  }
  drawSand(ctx, rng, FIELD_X0, FIELD_X1);
  for (let y = 0; y < MAP_H; y++) {
    // lane dividers (rows 0 and MAP_H-1 are the sandbox frame)
    if (y > 0 && y < MAP_H - 1 && sim.map.terrain[idx(FIELD_X0, y)] === T_WALL && sim.map.terrain[idx(FIELD_X0, y - 1)] !== T_WALL) {
      let y1 = y;
      while (sim.map.terrain[idx(FIELD_X0, y1)] === T_WALL) y1++;
      drawWall(ctx, rng, y, y1);
    }
  }
  if (bughunt) drawHive(ctx, rng);
  drawFrame(ctx, bughunt);
  drawDeposits(ctx, rng, sim.map.deposits);
  return c;
}

/** The scar layer covers the sandbox (and the backyard) and accumulates decals forever. */
export function createScars() {
  return canvas(MAP_W * TP, MAP_H * TP);
}

export { T_YARD };
