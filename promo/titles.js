// Poster-style typography for the promo films: pop-in captions, red banners, rubber stamps, and
// full-frame cards (the FPN newsreel bumper, the recruitment end card).

const INK = '#2a2420';
const PAPER = '#f3e6c8';
const CREAM = '#fff6df';
const RED = '#c8352b';
const RED_2 = '#9e2820';
const GOLD = '#e8b93a';
const NAVY = '#1f2a44';
const DISPLAY = 'Bangers, Impact, sans-serif';
const HEAD = 'Oswald, "Arial Narrow", sans-serif';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const backOut = (k) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;

function lines(text) {
  return String(text).split('\n');
}

/** Scale + alpha for a title at time u (seconds into its shot). */
function envelope(t, u, pop = 0.28) {
  const local = u - t.at;
  if (local < 0 || local > t.dur) return null;
  const k = clamp01(local / pop);
  const out = clamp01((t.dur - local) / (t.fadeOut ?? 0.2));
  return { scale: t.stamp ? 2 - backOut(k) : 0.55 + 0.45 * backOut(k), alpha: Math.min(k * 1.6, 1) * out, local };
}

function strokeText(ctx, text, x, y, fill, stroke, width, shadow) {
  ctx.lineJoin = 'round';
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(text, x + width * 0.55, y + width * 0.55);
  }
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/**
 * t = { text, at, dur, y (0..1), size (px at 1080 short side), style: caption|banner|stamp|label, color }
 */
export function drawTitle(ctx, W, H, t, u) {
  const env = envelope(t, u);
  if (!env) return;
  const base = Math.min(W, H) / 1080;
  const size = (t.size ?? 96) * base;
  const cx = (t.x ?? 0.5) * W;
  const cy = (t.y ?? 0.5) * H;
  const rows = lines(t.text);
  ctx.save();
  ctx.globalAlpha = env.alpha;
  ctx.translate(cx, cy);
  ctx.rotate(((t.rot ?? (t.style === 'stamp' ? -8 : 0)) * Math.PI) / 180);
  ctx.scale(env.scale, env.scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${size}px ${t.font === 'head' ? HEAD : DISPLAY}`;
  const lh = size * 1.02;
  const widest = Math.max(...rows.map((r) => ctx.measureText(r).width));
  const top = -((rows.length - 1) * lh) / 2;

  if (t.style === 'banner') {
    const bw = Math.min(W * 0.96, widest + size * 1.4);
    const bh = rows.length * lh + size * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ribbon(ctx, -bw / 2 + 10, top - lh / 2 - size * 0.25 + 12, bw, bh, size * 0.4);
    ctx.fillStyle = t.color || RED;
    ribbon(ctx, -bw / 2, top - lh / 2 - size * 0.25, bw, bh, size * 0.4);
    ctx.strokeStyle = INK;
    ctx.lineWidth = size * 0.07;
    ctx.stroke();
    rows.forEach((r, i) => strokeText(ctx, r, 0, top + i * lh + size * 0.04, CREAM, INK, size * 0.12, null));
  } else if (t.style === 'stamp') {
    const bw = widest + size * 0.6;
    const bh = rows.length * lh + size * 0.35;
    ctx.strokeStyle = t.color || RED;
    ctx.lineWidth = size * 0.09;
    ctx.strokeRect(-bw / 2, top - lh / 2 - size * 0.17, bw, bh);
    ctx.lineWidth = size * 0.03;
    ctx.strokeRect(-bw / 2 + size * 0.12, top - lh / 2 - size * 0.05, bw - size * 0.24, bh - size * 0.24);
    ctx.fillStyle = t.color || RED;
    rows.forEach((r, i) => ctx.fillText(r, 0, top + i * lh + size * 0.05));
  } else if (t.style === 'label') {
    // a small tag with an arrow pointing down at something in the scene
    const bw = widest + size * 0.7;
    const bh = size * 1.25;
    ctx.fillStyle = CREAM;
    ctx.strokeStyle = INK;
    ctx.lineWidth = size * 0.1;
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, size * 0.25);
    ctx.moveTo(-size * 0.3, bh / 2);
    ctx.lineTo(0, bh / 2 + size * 0.5);
    ctx.lineTo(size * 0.3, bh / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(rows[0], 0, size * 0.05);
  } else {
    rows.forEach((r, i) => strokeText(ctx, r, 0, top + i * lh, t.color || CREAM, INK, size * 0.16, t.shadow ?? RED));
  }
  ctx.restore();
}

function ribbon(ctx, x, y, w, h, notch) {
  ctx.beginPath();
  ctx.moveTo(x - notch, y);
  ctx.lineTo(x + w + notch, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w + notch, y + h);
  ctx.lineTo(x - notch, y + h);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
  ctx.fill();
}

function sunburst(ctx, W, H, cx, cy, u, colors = [RED, '#e0463a']) {
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, W, H);
  const R = Math.hypot(W, H);
  const rays = 24;
  ctx.fillStyle = colors[1];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + u * 0.12;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.lineTo(cx + Math.cos(a + Math.PI / rays) * R, cy + Math.sin(a + Math.PI / rays) * R);
    ctx.closePath();
    ctx.fill();
  }
}

function grain(ctx, W, H, amount = 0.06) {
  ctx.save();
  for (let i = 0; i < (W * H) / 900; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${amount})` : `rgba(255,255,255,${amount})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  ctx.restore();
}

function star(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.42 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** Full-frame cards. card = { type: 'fpn' | 'end', ... } */
export function drawCard(ctx, W, H, card, u, art) {
  const base = Math.min(W, H) / 1080;
  const portrait = H > W;
  ctx.save();
  if (card.type === 'fpn') {
    sunburst(ctx, W, H, W / 2, H / 2, u, [NAVY, '#2e3d63']);
    const r = 250 * base * (0.9 + 0.1 * backOut(clamp01(u / 0.4)));
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2 - 40 * base, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 14 * base;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2 - 40 * base, r * 0.86, 0, Math.PI * 2);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 8 * base;
    ctx.stroke();
    star(ctx, W / 2, H / 2 - 40 * base - r * 0.3, r * 0.3, RED);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${120 * base}px ${DISPLAY}`;
    strokeText(ctx, 'FPN', W / 2, H / 2 - 40 * base + r * 0.25, RED, INK, 10 * base, null);
    ctx.font = `700 ${46 * base}px ${HEAD}`;
    ctx.fillStyle = CREAM;
    ctx.fillText('FEDERAL PLAYROOM NETWORK', W / 2, H / 2 + r + 30 * base);
    ctx.font = `700 ${34 * base}px ${HEAD}`;
    ctx.fillStyle = GOLD;
    ctx.fillText(card.sub || 'PRESENTS', W / 2, H / 2 + r + 86 * base);
    grain(ctx, W, H, 0.08);
  } else if (card.type === 'end') {
    const cx = portrait ? W / 2 : W * 0.3;
    const cy = portrait ? H * 0.28 : H * 0.52;
    sunburst(ctx, W, H, cx, cy, u);
    if (art) {
      const ah = (portrait ? 740 : 900) * base;
      const aw = ah * (300 / 420);
      const k = backOut(clamp01(u / 0.5));
      ctx.drawImage(art, cx - (aw * k) / 2, cy - (ah * k) / 2, aw * k, ah * k);
    }
    const tx = portrait ? W / 2 : W * 0.68;
    let ty = portrait ? H * 0.55 : H * 0.28;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${(portrait ? 190 : 170) * base}px ${DISPLAY}`;
    const t1 = clamp01((u - 0.2) / 0.3);
    ctx.globalAlpha = t1;
    strokeText(ctx, 'PLASTIC', tx, ty, CREAM, INK, 16 * base, INK);
    ty += (portrait ? 180 : 160) * base;
    strokeText(ctx, 'FRONT', tx, ty, CREAM, INK, 16 * base, INK);
    ty += (portrait ? 130 : 115) * base;
    ctx.font = `700 ${(portrait ? 54 : 48) * base}px ${HEAD}`;
    ctx.globalAlpha = clamp01((u - 0.5) / 0.3);
    ctx.fillStyle = CREAM;
    ctx.fillText('Service guarantees bedtime.', tx, ty);
    ty += (portrait ? 120 : 105) * base;
    // call-to-action plate
    ctx.globalAlpha = clamp01((u - 0.8) / 0.3);
    const pw = (portrait ? 900 : 820) * base;
    const ph = 190 * base;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.roundRect(tx - pw / 2 + 12 * base, ty + 12 * base, pw, ph, 24 * base);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.roundRect(tx - pw / 2, ty, pw, ph, 24 * base);
    ctx.fill();
    ctx.lineWidth = 8 * base;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = RED;
    ctx.font = `${70 * base}px ${DISPLAY}`;
    ctx.fillText(card.cta || 'PLAY FREE IN YOUR BROWSER', tx, ty + 62 * base);
    ctx.fillStyle = INK;
    ctx.font = `700 ${38 * base}px ${HEAD}`;
    ctx.fillText(card.url || 'kunskapshunger.github.io/plastic-front', tx, ty + 138 * base);
    ty += ph + 70 * base;
    ctx.globalAlpha = clamp01((u - 1.1) / 0.3);
    ctx.fillStyle = CREAM;
    ctx.font = `700 ${38 * base}px ${HEAD}`;
    ctx.fillText(card.tag || 'SOLO  ·  CO-OP BUG HUNT  ·  VERSUS FRIENDS', tx, ty);
    ctx.globalAlpha = 1;
    grain(ctx, W, H, 0.05);
  }
  ctx.restore();
}
