// Procedural sprites: plastic army men, tin vehicles and the items that ride the belts.
// Army men are baked once per (type, team, pose) and blitted; bugs are drawn live (their legs move).
import { TEAM_COLORS, TOY, shade } from './palette.js';

export const SPR = 96; // sprite pixels per tile

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}

/** Plastic sheen: light from the top-left, shade to the bottom-right, only where paint already is. */
function sheen(ctx, w, h, strength = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, 0, w * 0.9, h);
  g.addColorStop(0, `rgba(255,255,255,${0.32 * strength})`);
  g.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.addColorStop(1, `rgba(0,0,0,${0.28 * strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function part(ctx, pts, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function blob(ctx, x, y, rx, ry, fill, stroke, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function limb(ctx, x0, y0, x1, y1, w, color, outline) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = w + 3;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

// ------------------------------------------------------------------ army men

/**
 * Draw a plastic soldier facing right. Units: sprite pixels; (0,0) is the centre of the base.
 * pose: stand | kneel | prone | throw; prop: rifle | mg | grenade | glue | flamer | tube
 */
function drawSoldier(ctx, col, pose, prop, firing) {
  const C = col.base;
  const L = col.light;
  const D = col.dark;
  const O = col.deep;
  const s = SPR;
  // the base plate every army man stands on
  blob(ctx, 0, 0, s * 0.26, s * 0.085, D, O);
  blob(ctx, 0, -s * 0.02, s * 0.24, s * 0.065, C);

  let hipX = 0;
  let hipY = -s * 0.34;
  let shX = s * 0.03;
  let shY = -s * 0.6;
  if (pose === 'kneel') {
    hipX = -s * 0.03;
    hipY = -s * 0.2;
    shX = s * 0.02;
    shY = -s * 0.46;
    limb(ctx, -s * 0.12, -s * 0.03, hipX, hipY, s * 0.075, C, O); // shin on the ground
    limb(ctx, s * 0.12, -s * 0.03, s * 0.1, -s * 0.2, s * 0.075, C, O);
    limb(ctx, s * 0.1, -s * 0.2, hipX, hipY, s * 0.08, C, O);
  } else if (pose === 'prone') {
    hipX = -s * 0.14;
    hipY = -s * 0.1;
    shX = s * 0.1;
    shY = -s * 0.16;
    limb(ctx, -s * 0.26, -s * 0.05, hipX, hipY, s * 0.07, C, O);
  } else {
    const stride = pose === 'throw' ? 0.12 : 0.08;
    limb(ctx, -s * stride, -s * 0.02, hipX - s * 0.02, hipY, s * 0.08, C, O);
    limb(ctx, s * stride, -s * 0.02, hipX + s * 0.02, hipY, s * 0.08, D, O);
  }
  // backpack / fuel tank
  if (prop === 'flamer') {
    part(ctx, [[hipX - s * 0.16, hipY - s * 0.02], [hipX - s * 0.18, shY + s * 0.02], [hipX - s * 0.04, shY], [hipX - s * 0.03, hipY]], shade(C, -0.15), O);
    blob(ctx, hipX - s * 0.12, (hipY + shY) / 2, s * 0.06, s * 0.13, shade(C, -0.05), O);
  } else if (pose !== 'prone') {
    part(ctx, [[hipX - s * 0.13, hipY - s * 0.04], [hipX - s * 0.14, shY + s * 0.08], [hipX - s * 0.03, shY + s * 0.04], [hipX - s * 0.02, hipY]], D, O);
  }
  // torso
  if (pose === 'prone') {
    limb(ctx, hipX, hipY, shX, shY, s * 0.13, C, O);
  } else {
    part(ctx, [[hipX - s * 0.09, hipY + s * 0.02], [shX - s * 0.1, shY], [shX + s * 0.09, shY - s * 0.01], [hipX + s * 0.09, hipY + s * 0.02]], C, O);
    // belt
    ctx.fillStyle = D;
    ctx.fillRect(hipX - s * 0.09, hipY - s * 0.05, s * 0.18, s * 0.04);
  }
  // head + helmet
  const hx = shX + (pose === 'prone' ? s * 0.08 : s * 0.02);
  const hy = shY - (pose === 'prone' ? s * 0.04 : s * 0.09);
  blob(ctx, hx + s * 0.015, hy + s * 0.01, s * 0.065, s * 0.07, C, O);
  ctx.beginPath();
  ctx.ellipse(hx, hy - s * 0.02, s * 0.095, s * 0.075, 0, Math.PI, Math.PI * 2);
  ctx.lineTo(hx + s * 0.11, hy - s * 0.01);
  ctx.lineTo(hx - s * 0.11, hy - s * 0.01);
  ctx.closePath();
  ctx.fillStyle = L;
  ctx.fill();
  ctx.strokeStyle = O;
  ctx.lineWidth = 2;
  ctx.stroke();

  // weapon + arms
  const gunY = shY + s * 0.06;
  if (prop === 'rifle' || prop === 'mg' || prop === 'flamer' || prop === 'tube') {
    const len = prop === 'mg' ? 0.46 : prop === 'tube' ? 0.34 : 0.4;
    const thick = prop === 'mg' ? 0.06 : prop === 'tube' ? 0.09 : 0.04;
    const gx0 = shX - s * 0.08;
    const gx1 = shX + s * len;
    const gy1 = gunY - (prop === 'tube' ? s * 0.12 : s * 0.02);
    limb(ctx, gx0, gunY + s * 0.02, gx1, gy1, s * thick, prop === 'flamer' ? TOY.steelDark : D, O);
    if (prop === 'mg') {
      limb(ctx, gx1 - s * 0.06, gy1, gx1 - s * 0.02, gy1 + s * 0.14, s * 0.02, D, O); // bipod
      blob(ctx, shX + s * 0.1, gunY + s * 0.05, s * 0.05, s * 0.04, D, O); // ammo box
    }
    limb(ctx, shX - s * 0.02, shY + s * 0.02, shX + s * 0.14, gunY, s * 0.06, C, O);
    limb(ctx, shX + s * 0.02, shY + s * 0.03, shX + s * 0.24, gunY - s * 0.01, s * 0.055, L, O);
    if (firing) {
      const fx = gx1 + s * 0.04;
      ctx.fillStyle = prop === 'flamer' ? '#ffb347' : '#fff2a8';
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const r = k % 2 ? s * 0.035 : s * 0.1;
        ctx.lineTo(fx + Math.cos(a) * r * 1.3, gy1 + Math.sin(a) * r);
      }
      ctx.fill();
    }
  } else if (prop === 'grenade') {
    limb(ctx, shX, shY + s * 0.02, shX - s * 0.16, shY - s * 0.2, s * 0.06, L, O);
    blob(ctx, shX - s * 0.17, shY - s * 0.24, s * 0.05, s * 0.06, D, O);
    limb(ctx, shX, shY + s * 0.04, shX + s * 0.15, shY + s * 0.02, s * 0.055, C, O);
  } else if (prop === 'glue') {
    // the Glue Corps carry an enormous bottle of school glue
    limb(ctx, shX, shY + s * 0.03, shX + s * 0.14, gunY + s * 0.04, s * 0.055, C, O);
    ctx.fillStyle = TOY.white;
    ctx.strokeStyle = '#8a8070';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect?.(shX + s * 0.1, gunY - s * 0.07, s * 0.12, s * 0.18, s * 0.03);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = TOY.orange;
    ctx.fillRect(shX + s * 0.13, gunY - s * 0.13, s * 0.06, s * 0.07);
    ctx.fillStyle = TOY.red;
    ctx.fillRect(shX + s * 0.12, gunY - s * 0.01, s * 0.08, s * 0.03);
  }
}

const PROPS = {
  rifle: ['stand', 'rifle'],
  mg: ['prone', 'mg'],
  grenadier: ['throw', 'grenade'],
  medic: ['stand', 'glue'],
  flamer: ['stand', 'flamer'],
  mortar: ['kneel', 'tube'],
};

// ------------------------------------------------------------------ tin vehicles

function drawTank(ctx, col) {
  const s = SPR;
  const C = col.base;
  const O = col.deep;
  // treads
  ctx.fillStyle = '#3b3632';
  ctx.beginPath();
  ctx.roundRect(-s * 0.62, -s * 0.28, s * 1.24, s * 0.3, s * 0.14);
  ctx.fill();
  for (let i = 0; i < 6; i++) blob(ctx, -s * 0.48 + i * s * 0.19, -s * 0.13, s * 0.075, s * 0.075, '#5c554e', '#221e1b');
  // hull (lithographed tin)
  ctx.beginPath();
  ctx.moveTo(-s * 0.66, -s * 0.28);
  ctx.lineTo(-s * 0.58, -s * 0.52);
  ctx.lineTo(s * 0.56, -s * 0.52);
  ctx.lineTo(s * 0.7, -s * 0.28);
  ctx.closePath();
  ctx.fillStyle = C;
  ctx.fill();
  ctx.strokeStyle = O;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = TOY.yellow;
  ctx.fillRect(-s * 0.6, -s * 0.36, s * 1.24, s * 0.04);
  ctx.fillStyle = TOY.red;
  ctx.beginPath();
  ctx.arc(-s * 0.2, -s * 0.44, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = TOY.white;
  ctx.font = `900 ${s * 0.08}px sans-serif`;
  ctx.fillText('★', -s * 0.235, -s * 0.415);
  // rivets
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i = 0; i < 9; i++) ctx.fillRect(-s * 0.54 + i * s * 0.13, -s * 0.49, 2.5, 2.5);
  // turret
  blob(ctx, s * 0.04, -s * 0.58, s * 0.26, s * 0.14, shade(C, 0.1), O);
  ctx.fillStyle = shade(C, -0.1);
  ctx.fillRect(s * 0.2, -s * 0.64, s * 0.5, s * 0.07);
  ctx.strokeStyle = O;
  ctx.lineWidth = 2;
  ctx.strokeRect(s * 0.2, -s * 0.64, s * 0.5, s * 0.07);
  blob(ctx, s * 0.0, -s * 0.7, s * 0.07, s * 0.04, shade(C, 0.3), O);
}

function drawPlane(ctx, col) {
  const s = SPR;
  const C = col.base;
  const O = col.deep;
  // lower wing
  ctx.fillStyle = shade(C, -0.15);
  ctx.beginPath();
  ctx.roundRect(-s * 0.2, -s * 0.2, s * 0.4, s * 0.1, s * 0.05);
  ctx.fill();
  // fuselage
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, -s * 0.3);
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.46, s * 0.45, -s * 0.36);
  ctx.lineTo(s * 0.5, -s * 0.2);
  ctx.quadraticCurveTo(-s * 0.1, -s * 0.12, -s * 0.7, -s * 0.24);
  ctx.closePath();
  ctx.fillStyle = C;
  ctx.fill();
  ctx.strokeStyle = O;
  ctx.lineWidth = 3;
  ctx.stroke();
  // tail
  part(ctx, [[-s * 0.66, -s * 0.28], [-s * 0.76, -s * 0.52], [-s * 0.56, -s * 0.34]], TOY.red, O);
  // upper wing with struts
  ctx.strokeStyle = O;
  ctx.lineWidth = 3;
  for (const x of [-s * 0.12, s * 0.12]) {
    ctx.beginPath();
    ctx.moveTo(x, -s * 0.3);
    ctx.lineTo(x, -s * 0.52);
    ctx.stroke();
  }
  ctx.fillStyle = shade(C, 0.15);
  ctx.beginPath();
  ctx.roundRect(-s * 0.3, -s * 0.6, s * 0.6, s * 0.1, s * 0.05);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = TOY.yellow;
  ctx.fillRect(-s * 0.05, -s * 0.6, s * 0.1, s * 0.1);
  // pilot
  blob(ctx, -s * 0.05, -s * 0.42, s * 0.06, s * 0.06, shade(C, 0.25), O);
  // nose
  blob(ctx, s * 0.5, -s * 0.28, s * 0.05, s * 0.08, TOY.steelDark, O);
}

function drawColossus(ctx, col) {
  const s = SPR * 1.8;
  const C = col.base;
  const O = col.deep;
  // legs
  ctx.fillStyle = TOY.steelDark;
  ctx.fillRect(-s * 0.2, -s * 0.34, s * 0.13, s * 0.32);
  ctx.fillRect(s * 0.07, -s * 0.34, s * 0.13, s * 0.32);
  blob(ctx, -s * 0.14, -s * 0.02, s * 0.12, s * 0.05, '#3b3632', '#221e1b');
  blob(ctx, s * 0.14, -s * 0.02, s * 0.12, s * 0.05, '#3b3632', '#221e1b');
  // body
  ctx.beginPath();
  ctx.roundRect(-s * 0.3, -s * 0.78, s * 0.6, s * 0.46, s * 0.06);
  ctx.fillStyle = C;
  ctx.fill();
  ctx.strokeStyle = O;
  ctx.lineWidth = 4;
  ctx.stroke();
  // chest panel with dials
  ctx.fillStyle = TOY.steel;
  ctx.beginPath();
  ctx.roundRect(-s * 0.18, -s * 0.7, s * 0.36, s * 0.26, s * 0.03);
  ctx.fill();
  for (const [x, c] of [[-s * 0.09, TOY.red], [0, TOY.yellow], [s * 0.09, TOY.blue]]) blob(ctx, x, -s * 0.62, s * 0.035, s * 0.035, c, O);
  ctx.fillStyle = '#222';
  ctx.fillRect(-s * 0.12, -s * 0.53, s * 0.24, s * 0.05);
  ctx.fillStyle = TOY.yellow;
  for (let i = 0; i < 5; i++) ctx.fillRect(-s * 0.11 + i * s * 0.05, -s * 0.52, s * 0.03, s * 0.03);
  // arms with cannons
  ctx.fillStyle = shade(C, -0.15);
  ctx.fillRect(-s * 0.42, -s * 0.74, s * 0.12, s * 0.34);
  ctx.fillRect(s * 0.3, -s * 0.74, s * 0.12, s * 0.2);
  ctx.fillStyle = TOY.steelDark;
  ctx.fillRect(s * 0.3, -s * 0.6, s * 0.34, s * 0.09);
  // head dome
  blob(ctx, 0, -s * 0.86, s * 0.16, s * 0.12, TOY.steel, O);
  ctx.fillStyle = '#ff3b2f';
  ctx.fillRect(-s * 0.1, -s * 0.9, s * 0.2, s * 0.05);
  ctx.strokeStyle = O;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.97);
  ctx.lineTo(0, -s * 1.06);
  ctx.stroke();
  blob(ctx, 0, -s * 1.08, s * 0.03, s * 0.03, TOY.red, O);
}

// ------------------------------------------------------------------ cache

const cache = new Map();

/** Returns {canvas, ox, oy} where (ox, oy) is the sprite-space position of the unit's feet. */
export function unitSprite(type, team, firing = false) {
  const key = `${type}|${team}|${firing ? 1 : 0}`;
  let spr = cache.get(key);
  if (spr) return spr;
  const col = TEAM_COLORS[team] || TEAM_COLORS[0];
  const big = type === 'colossus';
  const w = SPR * (big ? 3.4 : type === 'tank' || type === 'plane' ? 1.7 : 1.1);
  const h = SPR * (big ? 3.4 : type === 'tank' ? 1.0 : type === 'plane' ? 0.9 : 1.0);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const ox = w / 2;
  const oy = h - SPR * 0.12;
  ctx.translate(ox, oy);
  if (type === 'tank') drawTank(ctx, col);
  else if (type === 'plane') drawPlane(ctx, col);
  else if (type === 'colossus') drawColossus(ctx, col);
  else {
    const [pose, prop] = PROPS[type] || PROPS.rifle;
    drawSoldier(ctx, col, pose, prop, firing);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  sheen(ctx, w, h, type === 'tank' || type === 'plane' ? 0.8 : 1);
  spr = { canvas: c, ox, oy };
  cache.set(key, spr);
  return spr;
}

// ------------------------------------------------------------------ bugs (drawn live)

const BUG_LOOK = {
  ant: { body: '#2b1a12', shine: '#6a4a38', size: 0.72 },
  spider: { body: '#1d1a1f', shine: '#4a4450', size: 1.0 },
  beetle: { body: '#1f3b3a', shine: '#4fc0a8', size: 1.25 },
  bombardier: { body: '#c4561d', shine: '#f3a65a', size: 0.95 },
  wasp: { body: '#f2c21b', shine: '#fff0a0', size: 0.85 },
  queen: { body: '#3a1e14', shine: '#b0785a', size: 3.2 },
};

/** Draw a bug at the current transform origin (feet), facing right. `t` animates the legs. */
export function drawBug(ctx, type, scale, t, moving) {
  const look = BUG_LOOK[type] || BUG_LOOK.ant;
  const s = scale * look.size;
  const wig = moving ? Math.sin(t * 18) : 0;
  ctx.lineCap = 'round';
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.75, s * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  const lift = type === 'wasp' ? s * 0.7 + Math.sin(t * 10) * s * 0.06 : 0;
  ctx.save();
  ctx.translate(0, -lift);
  // legs
  if (type !== 'wasp') {
    const legs = type === 'spider' ? 4 : 3;
    ctx.strokeStyle = look.body;
    ctx.lineWidth = Math.max(1, s * 0.05);
    for (let i = 0; i < legs; i++) {
      const lx = (i - (legs - 1) / 2) * s * 0.28;
      const phase = (i % 2 ? 1 : -1) * wig * s * 0.12;
      const reach = type === 'spider' ? 0.5 : 0.32;
      ctx.beginPath();
      ctx.moveTo(lx, -s * 0.2);
      ctx.lineTo(lx + phase - s * 0.04, -s * (type === 'spider' ? 0.52 : 0.34));
      ctx.lineTo(lx + phase * 1.6 + (i - 1) * s * 0.12, -s * 0.02);
      ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(lx, -s * 0.2);
      ctx.lineTo(lx - phase + s * 0.03, -s * (type === 'spider' ? 0.46 : 0.3));
      ctx.lineTo(lx - phase * 1.6 + (i - 1) * s * reach * 0.2, s * 0.02);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  const glossy = (x, y, rx, ry, color) => {
    const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.4, 1, x, y, Math.max(rx, ry));
    g.addColorStop(0, look.shine);
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, -0.4));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  if (type === 'beetle' || type === 'bombardier') {
    glossy(-s * 0.05, -s * 0.3, s * 0.42, s * 0.26, look.body);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.45, -s * 0.3);
    ctx.lineTo(s * 0.34, -s * 0.3);
    ctx.stroke();
    if (type === 'bombardier') {
      ctx.fillStyle = '#1a1210';
      ctx.fillRect(-s * 0.2, -s * 0.52, s * 0.06, s * 0.44);
      ctx.fillRect(s * 0.02, -s * 0.52, s * 0.06, s * 0.44);
    }
    glossy(s * 0.42, -s * 0.28, s * 0.12, s * 0.1, '#1a1210');
  } else if (type === 'spider') {
    glossy(-s * 0.18, -s * 0.32, s * 0.3, s * 0.26, look.body);
    glossy(s * 0.18, -s * 0.3, s * 0.16, s * 0.14, look.body);
    ctx.fillStyle = '#e03030';
    ctx.fillRect(s * 0.26, -s * 0.34, 2, 2);
    ctx.fillRect(s * 0.3, -s * 0.31, 2, 2);
  } else if (type === 'wasp') {
    // wings
    ctx.fillStyle = 'rgba(220,240,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-s * 0.05, -s * 0.5 + Math.sin(t * 60) * s * 0.05, s * 0.3, s * 0.12, -0.4, 0, Math.PI * 2);
    ctx.fill();
    glossy(-s * 0.28, -s * 0.24, s * 0.26, s * 0.16, look.body);
    ctx.fillStyle = '#1a1210';
    for (let i = 0; i < 3; i++) ctx.fillRect(-s * 0.44 + i * s * 0.1, -s * 0.38, s * 0.045, s * 0.28);
    glossy(s * 0.06, -s * 0.26, s * 0.12, s * 0.1, '#1a1210');
    glossy(s * 0.26, -s * 0.28, s * 0.09, s * 0.09, '#1a1210');
  } else {
    // ants and the queen
    const abd = type === 'queen' ? 0.4 : 0.22;
    glossy(-s * 0.3, -s * 0.27, s * abd, s * abd * 0.78, type === 'queen' ? '#6a4030' : look.body);
    if (type === 'queen') {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(-s * 0.3, -s * 0.27, s * abd * (0.3 + i * 0.18), s * abd * 0.78, 0, -1.2, 1.2);
        ctx.stroke();
      }
    }
    glossy(s * 0.04, -s * 0.28, s * 0.14, s * 0.1, look.body);
    glossy(s * 0.28, -s * 0.3, s * 0.12, s * 0.11, look.body);
  }
  // antennae / mandibles
  if (type !== 'spider') {
    ctx.strokeStyle = look.body;
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath();
    ctx.moveTo(s * 0.34, -s * 0.36);
    ctx.quadraticCurveTo(s * 0.5, -s * 0.62, s * 0.62, -s * 0.55 + wig * s * 0.04);
    ctx.stroke();
    ctx.strokeStyle = '#6a2a1a';
    ctx.beginPath();
    ctx.moveTo(s * 0.38, -s * 0.26);
    ctx.lineTo(s * 0.48, -s * 0.22 + wig * s * 0.03);
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ belt items

const itemCache = new Map();
const IS = 40; // item sprite px

function crateIcon(ctx, unit) {
  ctx.fillStyle = '#2a1e12';
  ctx.font = `900 ${IS * 0.32}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyph = {
    rifle: 'R', mg: 'MG', grenadier: 'G', medic: '+', flamer: 'F', mortar: 'M', tank: 'T', plane: 'P', colossus: '!',
  }[unit] || '?';
  ctx.fillText(glyph, IS / 2, IS / 2 + 2);
}

export function itemSprite(item, team = 0) {
  const key = `${item}|${team}`;
  let c = itemCache.get(key);
  if (c) return c;
  c = makeCanvas(IS, IS);
  const ctx = c.getContext('2d');
  const m = IS / 2;
  const col = TEAM_COLORS[team] || TEAM_COLORS[0];
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(m + 2, m + 4, IS * 0.3, IS * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  switch (item) {
    case 'pellets':
      for (const [dx, dy, cc] of [[-5, 2, '#fbf7ee'], [4, 3, '#f7d6e0'], [0, -4, '#cfe6f7'], [6, -3, '#fff0b8']]) blob(ctx, m + dx, m + dy, 5, 5, cc, '#9a8f80');
      break;
    case 'tin':
      part(ctx, [[m - 10, m + 4], [m - 6, m - 8], [m + 8, m - 6], [m + 11, m + 5], [m, m + 9]], '#a9b4bf', '#5f6a74');
      break;
    case 'powder':
      blob(ctx, m, m + 2, 11, 9, '#3a3533', '#1a1615');
      ctx.fillStyle = TOY.red;
      ctx.fillRect(m - 3, m - 9, 6, 5);
      break;
    case 'figure': {
      ctx.save();
      ctx.translate(m, m + 12);
      ctx.scale(0.36, 0.36);
      drawSoldier(ctx, col, 'stand', 'none', false);
      ctx.restore();
      break;
    }
    case 'plate':
      ctx.fillStyle = '#dfe6ec';
      ctx.strokeStyle = '#6f7c87';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(m - 10, m - 8, 20, 16, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#9aa6b0';
      for (const [dx, dy] of [[-7, -5], [5, -5], [-7, 3], [5, 3]]) ctx.fillRect(m + dx, m + dy, 2, 2);
      break;
    case 'spring':
      ctx.strokeStyle = '#d9a82a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) ctx.lineTo(m - 10 + i * 0.85, m + Math.sin(i * 1.3) * 7);
      ctx.stroke();
      break;
    case 'caps':
      blob(ctx, m, m, 10, 10, TOY.red, TOY.redDark);
      blob(ctx, m, m, 4, 4, '#f3ecd9', TOY.redDark);
      ctx.fillStyle = '#5a1a14';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.fillRect(m + Math.cos(a) * 7 - 1, m + Math.sin(a) * 7 - 1, 2.5, 2.5);
      }
      break;
    case 'firecracker':
      ctx.save();
      ctx.translate(m, m);
      ctx.rotate(-0.5);
      ctx.fillStyle = TOY.red;
      ctx.fillRect(-11, -5, 20, 10);
      ctx.fillStyle = TOY.yellow;
      ctx.fillRect(-5, -5, 4, 10);
      ctx.strokeStyle = '#3a2a20';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.quadraticCurveTo(14, -6, 16, -2);
      ctx.stroke();
      ctx.restore();
      break;
    default: {
      // unit crates: a cardboard box with a team stripe and a stencil
      ctx.fillStyle = '#c99a5c';
      ctx.strokeStyle = '#6e4f28';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(m - 13, m - 11, 26, 22, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col.base;
      ctx.fillRect(m - 13, m - 3, 26, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(m - 12, m - 10, 24, 3);
      crateIcon(ctx, item.replace('crate_', ''));
    }
  }
  itemCache.set(key, c);
  return c;
}

export { drawSoldier, sheen, blob, part, limb, makeCanvas };
