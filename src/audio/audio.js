// PLASTIC FRONT audio: every sound is synthesized live with WebAudio (cap guns,
// cork pops, tin tanks, a toy-soldier march) plus a speechSynthesis newsreel
// announcer. Safe to import and construct anywhere; silent until unlock().

const WIN = typeof window !== 'undefined' ? window : null;
const AC = WIN ? (WIN.AudioContext || WIN.webkitAudioContext || null) : null;
const SPEECH = WIN && WIN.speechSynthesis ? WIN.speechSynthesis : null;

const MAX_VOICES = 24;
const BUSY_VOICES = 16;
const BUSY_MIN_LEVEL = 0.3;
const SAME_WINDOW = 0.06;
const SAME_MAX = 3;
const NEAR_TILES = 12;
const FAR_TILES = 40;
const CRAFT_PER_SEC = 4;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.2;
const MUSIC_LEVEL = 0.45;
const DUCK_LEVEL = 0.6;
const FADE = 1;
const LOOP_STEPS = 128; // 8 bars of 16ths
const COOLDOWN = { alarm: 2.5, wave: 2, roar: 3, research: 0.4, march: 0.12, newsreel: 0.3, victory: 1, defeat: 1 };

const SCALE = [0, 2, 4, 5, 7, 9, 11];
const ROOT = 58; // Bb3: the band key
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const degToMidi = (d, base = ROOT) => base + 12 * Math.floor(d / 7) + SCALE[((d % 7) + 7) % 7];

// --- March material: 2-bar melody chunks in scale degrees ('-' hold, '.' rest) ---
const parse = (s) => s.split(/\s+/).filter((t) => t && t !== '|')
  .map((t) => (t === '-' ? '-' : t === '.' ? null : Number(t)));

const CHUNKS = {
  'I-V': { chords: ['I', 'V'], phrases: [
    '4 - 4 2 0 2 4 7 | 6 - 4 - 1 - . .', '0 0 2 4 7 - 4 - | 4 5 6 4 8 - . .',
    '7 - 4 - 2 - 0 - | 1 2 4 6 4 - . .', '2 4 7 4 2 4 0 - | 1 - 4 - 6 - - .',
  ] },
  'V-I': { chords: ['V', 'I'], phrases: [
    '6 - 8 6 4 - 1 - | 2 - 0 - 0 . . .', '4 6 8 6 4 3 2 1 | 0 - 2 - 4 - . .',
    '8 - 6 4 6 - 1 - | 0 - - - 7 - . .',
  ] },
  'I-IV': { chords: ['I', 'IV'], phrases: [
    '0 2 4 0 2 4 7 - | 5 - 3 - 5 7 5 3', '4 - 2 - 4 - 7 - | 7 - 5 - 3 - 5 -',
    '0 - 4 - 7 - 4 2 | 3 5 7 5 3 - . .',
  ] },
  'IV-V': { chords: ['IV', 'V'], phrases: [
    '5 - 3 - 0 - 3 - | 4 - 6 - 8 - . .', '3 5 7 5 3 - 5 - | 4 6 8 6 4 - . .',
    '7 - 5 3 5 - 7 - | 8 - 6 - 4 - 1 -',
  ] },
  CAD: { chords: ['V', 'I'], phrases: [
    '4 - 6 - 8 - 6 - | 7 - - - . . . .', '8 6 4 6 1 - 4 - | 0 - - - . . . .',
    '4 4 6 6 8 - 1 - | 7 - 4 - 0 - . .',
  ] },
};
for (const c of Object.values(CHUNKS)) c.phrases = c.phrases.map(parse);

const PROGRESSIONS = [
  ['I-V', 'V-I', 'I-V', 'CAD'],
  ['I-IV', 'IV-V', 'I-V', 'CAD'],
  ['I-V', 'V-I', 'I-IV', 'IV-V'],
  ['I-IV', 'IV-V', 'V-I', 'CAD'],
];
const CHORD_ROOT = { I: 0, IV: 3, V: 4 };

// --- Low-level synth primitives bound to one AudioContext ---
class Synth {
  constructor(ctx) {
    this.ctx = ctx;
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  // Attack to peak, optional hold, then exponential decay to silence at t + dur.
  env(param, t, attack, peak, dur, hold = 0) {
    const p = Math.max(peak, 0.0002);
    const a = t + Math.max(attack, 0.001);
    const h = Math.max(a, t + hold);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(p, a);
    if (h > a) param.setValueAtTime(p, h);
    param.exponentialRampToValueAtTime(0.0001, Math.max(h + 0.005, t + dur));
  }

  gain(dest, value = 1) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    g.connect(dest);
    return g;
  }

  // A gain node carrying an envelope, connected to dest.
  vca(dest, t, attack, vol, dur, hold = 0) {
    const g = this.gain(dest);
    this.env(g.gain, t, attack, vol, dur, hold);
    return g;
  }

  filter(dest, type, f, q = 1) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    b.connect(dest);
    return b;
  }

  osc(dest, type, f, t, end) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.connect(dest);
    o.start(t);
    o.stop(end);
    return o;
  }

  tone(out, t, { type = 'sine', f = 440, f2 = 0, glide = 0, dur = 0.1, vol = 1, attack = 0.002, hold = 0 }) {
    const o = this.osc(this.vca(out, t, attack, vol, dur, hold), type, f, t, t + dur + 0.05);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + (glide || dur));
    return o;
  }

  noise(out, t, { type = 'bandpass', f = 1000, f2 = 0, q = 1, dur = 0.1, vol = 1, attack = 0.001, hold = 0 }) {
    const flt = this.filter(this.vca(out, t, attack, vol, dur, hold), type, f, q);
    flt.frequency.setValueAtTime(f, t);
    if (f2) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.connect(flt);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // Inharmonic square partials through a bandpass: tin can / wind-up tank clang.
  metal(out, t, f, dur, vol) {
    const g = this.vca(this.filter(out, 'bandpass', f * 2.5, 0.9), t, 0.001, vol, dur);
    for (const r of [1, 1.47, 2.09, 2.56, 3.18]) this.osc(g, 'square', f * r, t, t + dur + 0.05);
  }

  // Spring 'boing': triangle with a fast, decaying vibrato.
  boing(out, t, f, dur, vol) {
    const o = this.osc(this.vca(out, t, 0.005, vol, dur), 'triangle', f, t, t + dur + 0.05);
    const depth = this.gain(o.frequency, f * 0.45);
    depth.gain.setValueAtTime(f * 0.45, t);
    depth.gain.exponentialRampToValueAtTime(1, t + dur);
    this.osc(depth, 'sine', 17, t, t + dur + 0.05).frequency.linearRampToValueAtTime(8, t + dur);
  }

  // Two detuned saws through a swelling lowpass: toy brass / kazoo trumpet.
  brass(out, t, f, dur, vol, { attack = 0.03, bright = 4, vib = 0, bend = 1 } = {}) {
    const hold = Math.max(t + attack + 0.01, t + dur - 0.02);
    const g = this.gain(out, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.linearRampToValueAtTime(vol * 0.75, hold);
    g.gain.linearRampToValueAtTime(0, hold + 0.09);
    const lp = this.filter(g, 'lowpass', f * 1.2, 1.5);
    lp.frequency.setValueAtTime(f * 1.2, t);
    lp.frequency.linearRampToValueAtTime(f * bright, t + attack + 0.04);
    lp.frequency.linearRampToValueAtTime(f * bright * 0.7, t + dur);
    const saws = [-7, 7].map((det) => {
      const o = this.osc(lp, 'sawtooth', f, t, hold + 0.15);
      o.detune.value = det;
      if (bend !== 1) o.frequency.linearRampToValueAtTime(f * bend, t + dur);
      return o;
    });
    if (!vib) return;
    const depth = this.ctx.createGain();
    depth.gain.value = f * vib;
    for (const o of saws) depth.connect(o.frequency);
    this.osc(depth, 'sine', 5.5, t, hold + 0.15);
  }

  // Glockenspiel: sine partials at 1, 2.76 and 5.4 with shrinking decays.
  bell(out, t, f, dur, vol) {
    this.tone(out, t, { f, dur, vol });
    this.tone(out, t, { f: f * 2.76, dur: dur * 0.3, vol: vol * 0.35 });
    this.tone(out, t, { f: f * 5.4, dur: dur * 0.12, vol: vol * 0.15 });
  }

  toyPiano(out, t, f, vol) {
    this.tone(out, t, { type: 'triangle', f, dur: 0.22, vol });
    this.tone(out, t, { f: f * 3.9, dur: 0.05, vol: vol * 0.25 });
  }

  tuba(out, t, f, dur, vol) {
    const lp = this.filter(out, 'lowpass', f * 5, 3);
    lp.frequency.setValueAtTime(f * 5, t);
    lp.frequency.exponentialRampToValueAtTime(f * 2, t + dur);
    this.tone(lp, t, { type: 'square', f, dur, vol, attack: 0.012, hold: dur * 0.4 });
  }

  kick(out, t, vol) {
    this.tone(out, t, { f: 115, f2: 42, dur: 0.16, vol });
    this.noise(out, t, { type: 'lowpass', f: 900, dur: 0.02, vol: vol * 0.3 });
  }

  snare(out, t, vol) {
    this.noise(out, t, { f: 2100, q: 0.9, dur: 0.08, vol });
    this.tone(out, t, { type: 'triangle', f: 230, f2: 180, dur: 0.05, vol: vol * 0.4 });
  }

  rim(out, t, vol) {
    this.tone(out, t, { type: 'square', f: 1700, dur: 0.015, vol: vol * 0.4 });
    this.noise(out, t, { f: 3500, q: 6, dur: 0.012, vol });
  }

  crash(out, t, vol) {
    this.noise(out, t, { type: 'highpass', f: 6000, dur: 1.2, vol });
    this.noise(out, t, { f: 4000, dur: 0.4, vol: vol * 0.5 });
  }

  clack(out, t, p, vol) {
    this.noise(out, t, { f: 2500 * p, q: 3, dur: 0.03, vol });
    this.tone(out, t, { type: 'triangle', f: 900 * p, f2: 600 * p, dur: 0.04, vol: vol * 0.4 });
  }

  blip(out, t, vol) {
    this.tone(out, t, { type: 'square', f: rand(1800, 2600), dur: 0.012, vol: vol * 0.8 });
    this.noise(out, t, { type: 'highpass', f: 6000, dur: 0.008, vol });
  }

  // 'Da-da-da DAAA, da-da DAAAAA': shared by the victory cue and the victory music.
  fanfare(out, t, vol) {
    const lead = [[65, 0, 0.13], [65, 0.15, 0.13], [65, 0.3, 0.13], [70, 0.45, 0.45],
      [67, 0.95, 0.13], [69, 1.1, 0.13], [70, 1.25, 1.1]];
    for (const [m, at, d] of lead) this.brass(out, t + at, mtof(m), d, vol * 0.5, { bright: 5 });
    for (const m of [62, 65, 74]) this.brass(out, t + 1.25, mtof(m), 1.1, vol * 0.28);
    [82, 86, 89, 94].forEach((m, i) => this.bell(out, t + 1.3 + i * 0.07, mtof(m), 0.8, vol * 0.18));
    return 2.5;
  }
}

// --- SFX recipes: fn(synth, out, t, pitchVariation, size); vol is the base level ---
const R = {
  click: { dur: 0.06, vol: 0.5, fn: (s, o, t) => {
    s.tone(o, t, { type: 'triangle', f: 1400, f2: 900, dur: 0.03, vol: 0.6 });
    s.noise(o, t, { type: 'highpass', f: 4000, dur: 0.01, vol: 0.4 });
  } },
  hover: { dur: 0.04, vol: 0.18, fn: (s, o, t) => s.tone(o, t, { f: 2200, dur: 0.02, vol: 1 }) },
  build: { dur: 0.2, vol: 0.6, fn: (s, o, t, p) => {
    s.clack(o, t, p, 0.8);
    s.clack(o, t + 0.06, p * 1.2, 0.6);
    s.tone(o, t + 0.08, { f: 600, f2: 1200, dur: 0.08, vol: 0.3 });
  } },
  build_big: { dur: 0.5, vol: 0.7, fn: (s, o, t, p) => {
    s.tone(o, t, { f: 120, f2: 50, dur: 0.15, vol: 0.9 });
    s.noise(o, t, { type: 'lowpass', f: 600, dur: 0.08, vol: 0.5 });
    for (let i = 0; i < 3; i++) s.clack(o, t + 0.05 + i * 0.05, p * (1 + i * 0.15), 0.5);
    [70, 74, 77].forEach((m, i) => s.bell(o, t + 0.2 + i * 0.06, mtof(m + 12), 0.3, 0.25));
  } },
  remove: { dur: 0.18, vol: 0.5, fn: (s, o, t, p) => {
    s.tone(o, t, { f: 900, f2: 300, dur: 0.12, vol: 0.5 });
    s.clack(o, t + 0.02, p * 0.8, 0.6);
  } },
  error: { dur: 0.26, vol: 0.45, fn: (s, o, t) => {
    const lp = s.filter(o, 'lowpass', 1200);
    for (const at of [0, 0.12]) s.tone(lp, t + at, { type: 'square', f: 160, dur: 0.09, vol: 0.7, hold: 0.06 });
  } },
  rotate: { dur: 0.12, vol: 0.45, fn: (s, o, t, p) => { // ratchet
    for (const at of [0, 0.035, 0.07]) s.clack(o, t + at, p * 1.4, 0.8);
  } },
  research: { dur: 0.9, vol: 0.55, fn: (s, o, t) => {
    [70, 74, 77, 82].forEach((m, i) => s.bell(o, t + i * 0.07, mtof(m), 0.6, 0.5));
    s.bell(o, t + 0.32, mtof(89), 0.5, 0.2);
  } },
  order: { dur: 0.16, vol: 0.45, fn: (s, o, t) => {
    const bp = s.filter(o, 'bandpass', 1500, 1.5);
    s.tone(bp, t, { type: 'square', f: 1500, dur: 0.035, vol: 0.7, hold: 0.02 });
    s.tone(bp, t + 0.05, { type: 'square', f: 1100, dur: 0.05, vol: 0.7, hold: 0.03 });
    s.noise(o, t, { f: 2500, dur: 0.12, vol: 0.12, hold: 0.08 });
  } },
  alarm: { dur: 1.0, vol: 0.55, fn: (s, o, t) => { // 'aa-OO-ga' klaxon, twice
    const bp = s.filter(o, 'bandpass', 1100, 1.2);
    for (const at of [0, 0.5]) {
      for (const [type, f, vol] of [['sawtooth', 260, 0.8], ['square', 263, 0.4]]) {
        s.tone(bp, t + at, { type, f, f2: f * 2, glide: 0.12, dur: 0.42, vol, attack: 0.02, hold: 0.32 });
      }
    }
  } },
  wave: { dur: 2.1, vol: 0.75, fn: (s, o, t) => {
    for (const m of [46, 53]) s.brass(o, t, mtof(m), 0.7, 0.45, { attack: 0.15, bright: 3 });
    for (const m of [45, 52]) s.brass(o, t + 0.85, mtof(m), 1.1, 0.45, { attack: 0.2, bright: 3, bend: 0.96 });
  } },
  victory: { dur: 2.6, vol: 0.8, fn: (s, o, t) => s.fanfare(o, t, 1) },
  defeat: { dur: 2.5, vol: 0.75, fn: (s, o, t) => { // sad trombone
    [62, 61, 60].forEach((m, i) => s.brass(o, t + i * 0.42, mtof(m), 0.38, 0.5, { attack: 0.08, bright: 2.5 }));
    s.brass(o, t + 1.26, mtof(59), 1.1, 0.5, { attack: 0.08, bright: 2.5, vib: 0.03, bend: 0.97 });
  } },
  ticker: { dur: 0.03, vol: 0.3, fn: (s, o, t) => s.blip(o, t, 0.6) },
  newsreel: { dur: 0.8, vol: 0.4, fn: (s, o, t) => {
    for (let i = 0; i < 6; i++) s.blip(o, t + i * 0.04, 0.5);
    s.bell(o, t + 0.28, mtof(91), 0.5, 0.5);
  } },
  deploy: { dur: 0.45, vol: 0.5, fn: (s, o, t) => { // bugle toot
    s.brass(o, t, mtof(65), 0.1, 0.6, { attack: 0.01, bright: 6 });
    s.brass(o, t + 0.12, mtof(70), 0.25, 0.6, { attack: 0.01, bright: 6 });
  } },
  coin: { dur: 0.35, vol: 0.4, fn: (s, o, t) => {
    s.tone(o, t, { type: 'triangle', f: 988, dur: 0.07, vol: 0.6, hold: 0.05 });
    s.tone(o, t + 0.07, { type: 'triangle', f: 1319, dur: 0.25, vol: 0.6 });
    s.bell(o, t + 0.07, 2637, 0.2, 0.15);
  } },
  // --- world sounds ---
  cap: { dur: 0.12, vol: 0.42, fn: (s, o, t, p) => {
    s.noise(o, t, { f: 3200 * p, q: 0.8, dur: 0.05, vol: 0.9 });
    s.tone(o, t, { type: 'square', f: 1900 * p, f2: 380, dur: 0.03, vol: 0.25 });
    s.noise(o, t + 0.004, { type: 'highpass', f: 5000, dur: 0.09, vol: 0.25 });
  } },
  mg: { dur: 0.05, vol: 0.3, fn: (s, o, t, p) => {
    s.noise(o, t, { type: 'highpass', f: 4500 * p, dur: 0.018, vol: 0.8 });
    s.tone(o, t, { type: 'square', f: 1100 * p, dur: 0.012, vol: 0.18 });
  } },
  cork: { dur: 0.08, vol: 0.45, fn: (s, o, t, p) => {
    s.tone(o, t, { f: 280 * p, f2: 900 * p, dur: 0.025, vol: 0.7 });
    s.noise(o, t, { f: 1200, q: 1.5, dur: 0.03, vol: 0.5 });
  } },
  popheavy: { dur: 0.16, vol: 0.55, fn: (s, o, t, p) => {
    s.tone(o, t, { f: 200 * p, f2: 70, dur: 0.1, vol: 0.8 });
    s.noise(o, t, { f: 900, dur: 0.07, vol: 0.7 });
    s.noise(o, t, { type: 'highpass', f: 3000, dur: 0.03, vol: 0.4 });
  } },
  flak: { dur: 0.12, vol: 0.5, fn: (s, o, t, p) => {
    s.tone(o, t, { f: 140 * p, f2: 45, dur: 0.09, vol: 1 });
    s.noise(o, t, { f: 2000, dur: 0.04, vol: 0.6 });
  } },
  whoosh: { dur: 0.3, vol: 0.35, fn: (s, o, t, p) => {
    s.noise(o, t, { f: 400 * p, f2: 2200 * p, q: 2, dur: 0.25, vol: 0.8, attack: 0.08 });
  } },
  thoonk: { dur: 0.2, vol: 0.55, fn: (s, o, t, p) => {
    s.tone(o, t, { f: 240 * p, f2: 110, dur: 0.14, vol: 0.8 });
    s.tone(o, t, { f: 360 * p, f2: 165, dur: 0.1, vol: 0.3 });
    s.noise(o, t, { type: 'lowpass', f: 800, dur: 0.03, vol: 0.4 });
  } },
  tincannon: { dur: 0.45, vol: 0.65, wet: 0.2, fn: (s, o, t, p) => {
    s.tone(o, t, { f: 110 * p, f2: 35, dur: 0.3, vol: 1 });
    s.noise(o, t, { type: 'lowpass', f: 1800, dur: 0.18, vol: 0.7 });
    s.metal(o, t, 420 * p, 0.35, 0.3);
  } },
  squirt: { dur: 0.25, vol: 0.45, fn: (s, o, t, p) => {
    s.noise(o, t, { f: 2800 * p, f2: 500, q: 5, dur: 0.22, vol: 0.9, attack: 0.01 });
    s.tone(o, t, { f: 500 * p, f2: 250, dur: 0.12, vol: 0.2 });
  } },
  bang: { dur: (r) => 0.35 + 0.35 * r, vol: 0.7, wet: 0.25, fn: (s, o, t, p, r) => { // firecracker
    s.noise(o, t, { type: 'lowpass', f: 6000, dur: 0.12 + 0.12 * r, vol: 1 });
    s.noise(o, t, { f: 1200 * p, q: 0.7, dur: 0.3 * r, vol: 0.5 });
    s.tone(o, t, { f: 120 * p, f2: 38, dur: 0.25 + 0.2 * r, vol: 0.9 });
    const crackles = Math.round(Math.max(0, r - 1) * 4);
    for (let i = 0; i < crackles; i++) {
      s.noise(o, t + rand(0.05, 0.35), { type: 'highpass', f: 3000, dur: 0.02, vol: rand(0.2, 0.5) });
    }
  } },
  acid: { dur: 0.7, vol: 0.5, fn: (s, o, t, p) => {
    s.noise(o, t, { f: 1400 * p, dur: 0.12, vol: 0.8 });
    s.noise(o, t, { type: 'highpass', f: 5000, dur: 0.6, vol: 0.35, attack: 0.02 });
    for (let i = 0; i < 4; i++) {
      const f = rand(400, 900);
      s.tone(o, t + rand(0.02, 0.4), { f, f2: f * 1.6, dur: 0.04, vol: 0.25 });
    }
  } },
  chomp: { dur: 0.15, vol: 0.4, fn: (s, o, t, p) => {
    for (const at of [0, 0.07]) {
      s.noise(o, t + at, { f: 1800 * p, q: 2, dur: 0.025, vol: 0.7 });
      s.tone(o, t + at, { type: 'square', f: 180, f2: 120, dur: 0.04, vol: 0.15 });
    }
  } },
  snap: { dur: 0.22, vol: 0.45, fn: (s, o, t, p) => { // plastic snap, then bits clattering
    s.noise(o, t, { type: 'highpass', f: 2500, dur: 0.02, vol: 0.8 });
    s.tone(o, t, { type: 'triangle', f: 2400 * p, f2: 1500, dur: 0.025, vol: 0.3 });
    for (const [at, v] of [[0.07, 0.3], [0.13, 0.2], [0.17, 0.12]]) s.noise(o, t + at, { f: 4000 * p, q: 5, dur: 0.01, vol: v });
  } },
  melt: { dur: 0.75, vol: 0.4, fn: (s, o, t, p) => {
    s.noise(o, t, { type: 'highpass', f: 3500, dur: 0.7, vol: 0.4, attack: 0.03 });
    s.tone(o, t, { f: 700 * p, f2: 180, dur: 0.5, vol: 0.12 });
    s.noise(o, t, { type: 'highpass', f: 2500, dur: 0.02, vol: 0.3 });
  } },
  crunch: { dur: 0.9, vol: 0.6, wet: 0.15, fn: (s, o, t, p) => {
    s.noise(o, t, { f: 1500, dur: 0.25, vol: 0.8 });
    s.metal(o, t, 320 * p, 0.4, 0.3);
    s.tone(o, t, { f: 100, f2: 40, dur: 0.25, vol: 0.6 });
    s.boing(o, t + 0.12, 220 * p, 0.7, 0.3);
  } },
  squelch: { dur: 0.25, vol: 0.45, fn: (s, o, t, p) => {
    s.noise(o, t, { type: 'lowpass', f: 2200 * p, f2: 250, q: 8, dur: 0.2, vol: 0.9 });
    s.tone(o, t, { f: 320 * p, f2: 70, dur: 0.15, vol: 0.4 });
  } },
  bigsquelch: { dur: 1.2, vol: 0.7, wet: 0.2, fn: (s, o, t) => {
    s.noise(o, t, { type: 'lowpass', f: 1400, f2: 120, q: 8, dur: 0.5, vol: 1 });
    s.noise(o, t + 0.25, { type: 'lowpass', f: 1000, f2: 90, q: 8, dur: 0.6, vol: 0.8 });
    s.tone(o, t, { type: 'sawtooth', f: 90, f2: 30, dur: 1.1, vol: 0.4, hold: 0.3 });
  } },
  crash: { dur: 1.0, vol: 0.8, wet: 0.35, fn: (s, o, t, p) => { // toy building smashed to bits
    s.tone(o, t, { f: 90, f2: 30, dur: 0.5, vol: 1 });
    s.noise(o, t, { type: 'lowpass', f: 2500, dur: 0.5, vol: 0.7 });
    s.metal(o, t, 250 * p, 0.5, 0.2);
    for (let i = 0; i < 10; i++) s.noise(o, t + rand(0, 0.6), { f: rand(1500, 5000), q: 4, dur: 0.02, vol: rand(0.15, 0.4) });
    s.boing(o, t + 0.2, 300 * p, 0.5, 0.15);
  } },
  march: { dur: 0.1, vol: 0.3, fn: (s, o, t, p) => {
    s.tone(o, t, { f: 85 * p, f2: 55, dur: 0.07, vol: 0.6 });
    s.noise(o, t, { type: 'lowpass', f: 500, dur: 0.04, vol: 0.3 });
  } },
  craft: { dur: 0.2, vol: 0.14, fn: (s, o, t, p) => {
    s.noise(o, t, { f: 900 * p, q: 2, dur: 0.03, vol: 0.5 });
    s.tone(o, t + 0.08, { type: 'square', f: 110, f2: 70, dur: 0.06, vol: 0.25 });
    s.noise(o, t + 0.08, { type: 'lowpass', f: 400, dur: 0.05, vol: 0.4 });
  } },
  roar: { dur: 1.9, vol: 0.8, wet: 0.3, fn: (s, o, t) => {
    const am = s.gain(o, 0.6); // growl: amplitude-modulated at ~23 Hz
    s.osc(s.gain(am.gain, 0.4), 'square', 23, t, t + 1.9);
    const lp = s.filter(am, 'lowpass', 600, 4);
    for (const f of [75, 76.5]) s.tone(lp, t, { type: 'sawtooth', f, f2: f * 0.56, dur: 1.7, vol: 0.7, attack: 0.15, hold: 1 });
    s.noise(am, t, { f: 260, q: 3, dur: 1.6, vol: 0.6, attack: 0.1, hold: 1 });
  } },
};

const SHOT_SFX = { rifle: 'cap', mg: 'mg', popgun: 'cork', gate: 'popheavy', hq: 'popheavy', flak: 'flak' };
const LAUNCH_SFX = {
  grenadier: 'whoosh', mortar: 'thoonk', mortarpit: 'thoonk', tank: 'tincannon', colossus: 'tincannon', bombardier: 'squirt',
};
const VEHICLES = new Set(['tank', 'plane', 'colossus']);
const BUGS = new Set(['ant', 'spider', 'beetle', 'bombardier', 'wasp']);
const cue = (name, vol = 1, size = 1) => ({ name, vol, size });

function deathSfx(ev) {
  if (ev.type === 'queen') return 'bigsquelch';
  if (BUGS.has(ev.type)) return 'squelch';
  if (VEHICLES.has(ev.type)) return 'crunch';
  return ev.dtype === 'fire' ? 'melt' : 'snap';
}

export class GameAudio {
  constructor() {
    Object.assign(this, {
      ctx: null, synth: null, flame: null, track: null, wantMusic: null, timer: null,
      voices: [], recent: new Map(), lastPlayed: new Map(), craftTokens: CRAFT_PER_SEC,
      intensity: 0, intensityTarget: 0, speechId: 0, speechTimer: null, ducked: false, enVoice: null, warned: false,
      _muted: false, vol: { master: 0.8, music: 0.6, sfx: 0.9 },
    });
    SPEECH?.addEventListener?.('voiceschanged', () => { this.enVoice = null; });
  }

  unlock() {
    if (!AC) return;
    try {
      if (!this.ctx) this._build();
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      if (this.wantMusic && !this.track) this.music(this.wantMusic);
    } catch (err) {
      this._warn(err);
    }
  }

  get muted() { return this._muted; }

  toggleMute() {
    this.setMuted(!this._muted);
    return this._muted;
  }

  setMuted(on) {
    this._muted = !!on;
    if (this._muted) {
      this._stopSpeech();
      this._stopClip();
    }
    this._applyVolumes();
  }

  setVolumes({ master, music, sfx } = {}) {
    const next = { ...this.vol };
    if (Number.isFinite(master)) next.master = clamp(master, 0, 1);
    if (Number.isFinite(music)) next.music = clamp(music, 0, 1);
    if (Number.isFinite(sfx)) next.sfx = clamp(sfx, 0, 1);
    this.vol = next;
    this._applyVolumes();
  }

  play(name, opts = {}) {
    if (!this._live()) return;
    const vol = Number.isFinite(opts.vol) ? opts.vol : 1;
    this._fire(name, vol, clamp(+opts.pan || 0, -1, 1), 1, true);
  }

  // Positional cues are sorted loudest-first so throttling drops the distant ones.
  onEvents(events, listener) {
    if (!this._live() || !Array.isArray(events)) return;
    const L = listener || {};
    const cues = [];
    for (const ev of events) {
      if (!ev || typeof ev.e !== 'string') continue;
      const c = this._cue(ev, L);
      if (!c) continue;
      const { gain, pan } = this._spatial(ev.x, ev.y, L);
      if (gain * c.vol >= 0.02) cues.push({ ...c, level: gain * c.vol, pan });
    }
    cues.sort((a, b) => b.level - a.level);
    for (const c of cues) this._fire(c.name, c.level, c.pan, c.size, false, Math.random() * 0.03);
  }

  music(state) {
    const next = ['menu', 'game', 'victory', 'defeat'].includes(state) ? state : null;
    this.wantMusic = next;
    if (!this.ctx || (this.track?.state ?? null) === next) return;
    try {
      if (this.track) this._fadeOutTrack(this.track);
      this.track = null;
      if (next === 'menu' || next === 'game') this._startLoop(next);
      else if (next) this._startSting(next);
    } catch (err) {
      this._warn(err);
    }
  }

  setIntensity(v) { this.intensityTarget = clamp(+v || 0, 0, 1); }

  announce(text, { priority = false } = {}) {
    if (!SPEECH || typeof SpeechSynthesisUtterance === 'undefined' || !text || this._muted) return;
    const busy = SPEECH.speaking || SPEECH.pending || this.speechTimer;
    if (busy && !priority) return;
    if (busy) this._stopSpeech();
    const id = ++this.speechId;
    this.play('newsreel');
    this._duck(true);
    this.speechTimer = setTimeout(() => {
      this.speechTimer = null;
      this._speak(String(text), id);
    }, 260);
  }

  /**
   * Speak a pre-rendered announcer line (public/voice/<id>.wav) through a newsreel radio filter.
   */
  voice(id, fallbackText, { priority = false } = {}) {
    // Only the designed announcer speaks; a line without a clip stays on the ticker.
    if (this._muted || !this._live() || !this.voiceSet?.has(id)) return;
    if (this.clip && !priority) return;
    this._stopClip();
    this._stopSpeech();
    const token = {};
    this.clip = token;
    this.play('newsreel');
    this._duck(true);
    this._clipBuffer(id).then((buf) => {
      if (this.clip !== token || !buf || !this._live()) {
        if (this.clip === token) this._endClip();
        return;
      }
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const out = this.synth.gain(this.master, 1.1);
      const drive = ctx.createWaveShaper();
      drive.connect(out);
      const lp = this.synth.filter(drive, 'lowpass', 5200, 0.8);
      const hp = this.synth.filter(lp, 'highpass', 220, 0.7);
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * 2 - 1;
        curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
      }
      drive.curve = curve;
      src.connect(hp);
      src.onended = () => {
        if (this.clip === token) this._endClip();
      };
      token.src = src;
      src.start(ctx.currentTime + 0.25);
    }).catch((err) => {
      this._warn(err);
      if (this.clip === token) this._endClip();
    });
  }

  /** A MediaStream of the final mix (used by the promo director to record trailers). */
  captureStream() {
    if (!this.ctx) return null;
    if (!this.tap) {
      this.tap = this.ctx.createMediaStreamDestination();
      this.master.connect(this.tap);
    }
    return this.tap.stream;
  }

  /** Load public/voice/manifest.json so voice() knows which clips exist. */
  async loadVoices(base = 'voice/') {
    this.voiceBase = base;
    try {
      const res = await fetch(`${base}manifest.json`);
      this.voiceSet = res.ok ? new Set(await res.json()) : new Set();
    } catch {
      this.voiceSet = new Set();
    }
  }

  _clipBuffer(id) {
    this.clipCache ??= new Map();
    if (!this.clipCache.has(id)) {
      const p = fetch(`${this.voiceBase || 'voice/'}${id}.wav`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((ab) => (ab ? this.ctx.decodeAudioData(ab) : null));
      this.clipCache.set(id, p);
    }
    return this.clipCache.get(id);
  }

  _stopClip() {
    try {
      this.clip?.src?.stop();
    } catch {
      /* already stopped */
    }
    this.clip = null;
  }

  _endClip() {
    this.clip = null;
    this._duck(false);
  }

  update(dt) {
    const d = clamp(+dt || 0, 0, 0.25);
    this.intensity += (this.intensityTarget - this.intensity) * Math.min(1, d * 0.8);
    this.craftTokens = Math.min(CRAFT_PER_SEC, this.craftTokens + d * CRAFT_PER_SEC);
    if (this.flame && this.ctx) {
      this.flame.level *= Math.exp(-d * 5);
      this.flame.g.gain.setTargetAtTime(this.flame.level, this.ctx.currentTime, 0.06);
    }
    // Watchdog: some browsers never fire onend, so unduck once speech is idle.
    if (this.ducked && !this.clip && SPEECH && !SPEECH.speaking && !SPEECH.pending && !this.speechTimer) this._duck(false);
  }

  // ---------- graph ----------

  _build() {
    const ctx = new AC();
    this.ctx = ctx;
    this.synth = new Synth(ctx);
    const comp = ctx.createDynamicsCompressor(); // master limiter
    const limiter = { threshold: -14, knee: 8, ratio: 12, attack: 0.002, release: 0.2 };
    for (const [k, v] of Object.entries(limiter)) comp[k].value = v;
    this.master = this.synth.gain(ctx.destination);
    comp.connect(this.master);
    this.sfxBus = this.synth.gain(comp);
    this.duckGain = this.synth.gain(comp);
    this.musicBus = this.synth.gain(this.duckGain);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(0.9);
    this.reverb.connect(this.synth.gain(comp, 0.5));
    this._applyVolumes();
  }

  // Short decaying stereo noise: a small playroom.
  _impulse(sec) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * sec);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
    }
    return buf;
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this._muted ? 0 : this.vol.master, now, 0.03);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, now, 0.03);
    this.musicBus.gain.setTargetAtTime(this.vol.music * MUSIC_LEVEL, now, 0.03);
  }

  _live() { return !!this.ctx && !this._muted && this.ctx.state !== 'closed'; }

  _warn(err) {
    if (this.warned) return;
    this.warned = true;
    console.warn('[audio]', err);
  }

  // ---------- sim events ----------

  // Returns a positional cue, or handles the event directly and returns null.
  _cue(ev, L) {
    switch (ev.e) {
      case 'shot': return cue(SHOT_SFX[ev.src] || 'cap');
      case 'launch': return cue(LAUNCH_SFX[ev.src] || 'whoosh');
      case 'boom': {
        if (ev.dtype === 'acid') return cue('acid');
        const r = clamp(+ev.r || 1, 0.5, 2.5);
        return cue('bang', 0.6 + 0.25 * r, r);
      }
      case 'bite': return cue('chomp');
      case 'death': return cue(deathSfx(ev));
      case 'bdeath': return cue('crash');
      case 'deploy':
        if (Number.isFinite(ev.x)) return cue('march');
        if (ev.team === L.team) this._fire('march', 0.8, rand(-0.3, 0.3), 1, false);
        return null;
      case 'flame': this._flame(ev, L); return null;
      case 'craft': this._craft(); return null;
      case 'breach': if (ev.team === L.team) this.play('alarm'); return null;
      case 'research': if (ev.team === L.team) this.play('research'); return null;
      case 'wave': this.play('wave'); return null;
      case 'queen': this.play('roar'); return null;
      default: return null;
    }
  }

  // Distance attenuation and stereo pan relative to the camera (tiles; zoom 1 = default).
  _spatial(x, y, L) {
    if (!Number.isFinite(x) || !Number.isFinite(L.x)) return { gain: 1, pan: 0 };
    const near = NEAR_TILES / clamp(+L.zoom || 1, 0.25, 4);
    const far = Math.max(FAR_TILES, near + 20);
    const dx = x - L.x;
    const dist = Math.hypot(dx, (+y || 0) - (+L.y || 0));
    const k = dist <= near ? 1 : dist >= far ? 0 : 1 - (dist - near) / (far - near);
    return { gain: k * k, pan: clamp(dx / (near * 2), -1, 1) * 0.8 };
  }

  _allow(name, level, now, force) {
    this.voices = this.voices.filter((end) => end > now);
    if (!force && this.voices.length >= MAX_VOICES) return false;
    if (!force && this.voices.length >= BUSY_VOICES && level < BUSY_MIN_LEVEL) return false;
    const cd = COOLDOWN[name];
    if (cd && now - (this.lastPlayed.get(name) ?? -Infinity) < cd) return false;
    const hist = (this.recent.get(name) || []).filter((tm) => now - tm < SAME_WINDOW);
    if (hist.length >= SAME_MAX) {
      this.recent.set(name, hist);
      return false;
    }
    this.recent.set(name, [...hist, now]);
    this.lastPlayed.set(name, now);
    return true;
  }

  _fire(name, vol, pan, size, force, jitter = 0) {
    const r = R[name];
    if (!r || !this.synth) return false;
    const now = this.ctx.currentTime;
    const level = vol * r.vol;
    if (level < 0.005 || !this._allow(name, level, now, force)) return false;
    const dur = typeof r.dur === 'function' ? r.dur(size) : r.dur;
    try {
      const out = this._voice(level, pan, dur, r.wet || 0);
      r.fn(this.synth, out, now + 0.005 + jitter, rand(0.93, 1.07), size);
      return true;
    } catch (err) {
      this._warn(err);
      return false;
    }
  }

  // A per-sound output: gain -> pan -> sfx bus (+ optional reverb send), auto-disconnected.
  _voice(level, pan, dur, wet) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = level;
    const panner = pan && ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) panner.pan.value = pan;
    g.connect(panner || this.sfxBus);
    panner?.connect(this.sfxBus);
    const send = wet ? this.synth.gain(this.reverb, wet) : null;
    if (send) g.connect(send);
    this.voices.push(ctx.currentTime + dur);
    setTimeout(() => {
      for (const n of [g, panner, send]) n?.disconnect();
    }, (dur + 0.4) * 1000);
    return g;
  }

  _craft() {
    if (this.craftTokens < 1) return;
    this.craftTokens -= 1;
    this._fire('craft', 1, rand(-0.3, 0.3), 1, false);
  }

  // Flamethrowers feed one continuous noise loop whose level decays in update().
  _flame(ev, L) {
    const { gain, pan } = this._spatial(ev.x, ev.y, L);
    if (gain < 0.02) return;
    const f = this.flame || this._makeFlame();
    if (!f) return;
    f.level = Math.min(0.7, Math.max(f.level, gain * 0.45) + gain * 0.04);
    f.pan?.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.15);
  }

  _makeFlame() {
    try {
      const ctx = this.ctx;
      const s = this.synth;
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) panner.connect(this.sfxBus);
      const g = s.gain(panner || this.sfxBus, 0);
      const src = ctx.createBufferSource();
      src.buffer = s.noiseBuf;
      src.loop = true;
      const roar = s.filter(g, 'lowpass', 700, 1);
      src.connect(roar);
      src.connect(s.filter(s.gain(g, 0.3), 'bandpass', 3000, 0.7)); // hiss
      src.start();
      s.osc(s.gain(roar.frequency, 250), 'sine', 7, ctx.currentTime, 1e9); // flicker
      this.flame = { g, pan: panner, level: 0 };
      return this.flame;
    } catch (err) {
      this._warn(err);
      return null;
    }
  }

  // ---------- music ----------

  _newTrack(state, fadeIn) {
    const now = this.ctx.currentTime;
    const out = this.synth.gain(this.musicBus, 0);
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(1, now + fadeIn);
    return { state, out, loop: false, step: 0, next: now + 0.1, section: null };
  }

  _fadeOutTrack(tr) {
    const now = this.ctx.currentTime;
    tr.loop = false;
    tr.out.gain.cancelScheduledValues(now);
    tr.out.gain.setValueAtTime(tr.out.gain.value, now);
    tr.out.gain.linearRampToValueAtTime(0, now + FADE);
    setTimeout(() => tr.out.disconnect(), (FADE + 0.3) * 1000);
  }

  _startLoop(state) {
    const tr = this._newTrack(state, FADE);
    tr.loop = true;
    this.track = tr;
    if (!this.timer) this.timer = setInterval(() => this._tick(), LOOKAHEAD_MS);
  }

  _startSting(state) {
    const tr = this._newTrack(state, 0.05);
    const t = this.ctx.currentTime + 0.3;
    const len = state === 'victory' ? this._victoryMusic(tr.out, t) : this._defeatMusic(tr.out, t);
    this.track = tr;
    setTimeout(() => {
      if (this.track !== tr) return;
      this.track = null;
      this.wantMusic = null;
      tr.out.disconnect();
    }, (len + 1) * 1000);
  }

  // Lookahead scheduler: queue 16th-note steps up to SCHEDULE_AHEAD seconds ahead.
  _tick() {
    const tr = this.track;
    if (!tr || !tr.loop || !this.ctx) {
      clearInterval(this.timer);
      this.timer = null;
      return;
    }
    const now = this.ctx.currentTime;
    if (tr.next < now - 0.3) tr.next = now + 0.05; // resync after a hidden-tab stall
    try {
      while (tr.next < now + SCHEDULE_AHEAD) {
        const i = tr.state === 'menu' ? 0.3 : this.intensity;
        if (tr.step === 0) tr.section = this._buildSection();
        this._step(tr, tr.next, i);
        tr.next += 60 / (110 + 12 * i) / 4;
        tr.step = (tr.step + 1) % LOOP_STEPS;
      }
    } catch (err) {
      this._warn(err);
      tr.loop = false;
    }
  }

  _buildSection() {
    const melody = [];
    const chords = [];
    for (const key of pick(PROGRESSIONS)) {
      const c = CHUNKS[key];
      chords.push(...c.chords);
      melody.push(...pick(c.phrases));
    }
    return { melody, chords, lift: Math.random() < 0.25 ? 7 : 0 };
  }

  _step(tr, t, i) {
    const s = this.synth;
    const o = tr.out;
    const bar = Math.floor(tr.step / 16);
    const pos = tr.step % 16;
    const sixteenth = 60 / (110 + 12 * i) / 4;
    const root = CHORD_ROOT[tr.section.chords[bar]];
    const tones = [root, root + 2, root + 4];
    const bass = (d) => mtof(degToMidi(d, ROOT - 12));
    this._drums(s, o, t, bar, pos, i, sixteenth);
    // Oom-pah: tuba on 1 and 3 walking I-V, toy-piano chord stabs on 2 and 4.
    if (pos === 0) s.tuba(o, t, bass(root), sixteenth * 3.5, 0.35);
    if (pos === 8) s.tuba(o, t, bass(root - 3), sixteenth * 3.5, 0.32);
    if (pos === 14 && i > 0.45) s.tuba(o, t, bass(root - 1), sixteenth * 1.5, 0.2);
    if (pos === 4 || pos === 12) for (const d of tones.slice(1)) s.toyPiano(o, t, mtof(degToMidi(d)), 0.06);
    if (pos === 0 && i > 0.15) {
      for (const d of tones) s.brass(o, t, mtof(degToMidi(d)), sixteenth * 15, (i - 0.15) * 0.07, { attack: 0.25, bright: 2.5 });
    }
    if (pos % 2 === 0) this._melody(s, o, t, tr.section, tr.step / 2, i, sixteenth * 2);
  }

  _drums(s, o, t, bar, pos, i, sixteenth) {
    const fill = (bar === 7 || (i > 0.5 && bar === 3)) && pos >= 8;
    if (pos === 0 || pos === 8) s.kick(o, t, 0.45 + 0.3 * i);
    if (bar === 0 && pos === 0 && i > 0.6) s.crash(o, t, 0.15);
    if (fill) { // crescendo snare roll into the next phrase
      const v = 0.12 + 0.3 * ((pos - 8) / 8) * (0.5 + i);
      s.snare(o, t, v);
      if (i > 0.75 && pos >= 12) s.snare(o, t + sixteenth / 2, v * 0.7);
      return;
    }
    if (pos === 4 || pos === 12) s.snare(o, t, 0.35 + 0.2 * i);
    if (pos % 4 === 2) s.rim(o, t, 0.15);
    if ((pos === 7 || pos === 15) && i > 0.25) s.snare(o, t, 0.08 + 0.12 * i);
    if (i > 0.65 && pos === 14) s.snare(o, t + sixteenth / 2, 0.1);
  }

  _melody(s, o, t, sec, idx, i, eighth) {
    const deg = sec.melody[idx];
    if (typeof deg !== 'number') return;
    let len = 1;
    while (sec.melody[idx + len] === '-') len++;
    s.bell(o, t, mtof(degToMidi(deg + sec.lift, ROOT + 12)), Math.min(1.2, eighth * len + 0.3), 0.2);
    // Second brass voice a tenth below the glockenspiel once the battle heats up.
    if (i > 0.5) s.brass(o, t, mtof(degToMidi(deg - 2)), eighth * len * 0.9, (i - 0.5) * 0.18, { attack: 0.02 });
  }

  _victoryMusic(o, t) {
    const s = this.synth;
    for (let k = 0; k < 32; k++) s.snare(o, t + k * 0.031, 0.05 + 0.35 * (k / 32));
    const f = t + 1;
    s.crash(o, f, 0.3);
    s.crash(o, f + 1.25, 0.25);
    for (const at of [0, 0.45, 1.25]) s.kick(o, f + at, 0.7);
    s.tuba(o, f + 0.45, mtof(46), 0.4, 0.4);
    s.tuba(o, f + 1.25, mtof(46), 1.0, 0.45);
    return 1 + s.fanfare(o, f, 1.4);
  }

  // Bb minor funeral wind-down, each chord slower; the last one sags like a run-down spring.
  _defeatMusic(o, t) {
    const s = this.synth;
    const steps = [
      { bass: 46, pad: [58, 61, 65], mel: 77, dur: 1.3 },
      { bass: 42, pad: [58, 61, 66], mel: 73, dur: 1.5 },
      { bass: 39, pad: [58, 63, 66], mel: 70, dur: 1.8 },
      { bass: 41, pad: [57, 60, 65], mel: 69, dur: 2.1 },
      { bass: 34, pad: [53, 58, 61], mel: 70, dur: 3.2 },
    ];
    let at = t;
    steps.forEach((st, k) => {
      const bend = k === steps.length - 1 ? 0.94 : 1;
      s.kick(o, at, 0.5);
      s.tuba(o, at, mtof(st.bass), st.dur, 0.4);
      for (const m of st.pad) s.brass(o, at, mtof(m), st.dur, 0.08, { attack: 0.3, bright: 2, bend });
      s.bell(o, at + 0.05, mtof(st.mel), st.dur, 0.2);
      at += st.dur;
    });
    return at - t;
  }

  // ---------- announcer ----------

  _stopSpeech() {
    if (!SPEECH) return;
    this.speechId++;
    clearTimeout(this.speechTimer);
    this.speechTimer = null;
    SPEECH.cancel();
  }

  _duck(on) {
    this.ducked = on;
    if (this.ctx) this.duckGain.gain.setTargetAtTime(on ? DUCK_LEVEL : 1, this.ctx.currentTime, 0.15);
  }

  _pickVoice() {
    if (this.enVoice) return this.enVoice;
    const en = (SPEECH.getVoices?.() || []).filter((v) => /^en[-_]/i.test(v.lang || ''));
    const prefs = ['Google UK English Male', 'Daniel', 'David', 'Male'];
    const hit = prefs.map((p) => en.find((v) => v.name.includes(p))).find(Boolean);
    this.enVoice = hit || en[0] || null;
    return this.enVoice;
  }

  _speak(text, id) {
    if (id !== this.speechId || this._muted) {
      this._duck(false);
      return;
    }
    try {
      const u = new SpeechSynthesisUtterance(text);
      const voice = this._pickVoice();
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : 'en-GB';
      u.rate = 1.08;
      u.pitch = 0.85;
      u.volume = clamp(this.vol.master, 0, 1);
      const done = () => { if (id === this.speechId) this._duck(false); };
      u.onend = done;
      u.onerror = done;
      SPEECH.speak(u);
    } catch (err) {
      this._warn(err);
      this._duck(false);
    }
  }
}
