// Promo director: stages scripted scenes on real simulations, films them with a virtual camera,
// adds propaganda-poster titles, and records. Pass 1 renders every frame at a fixed rate into
// H.264 and logs sound cues; pass 2 replays the cues through the real audio engine and records it.
import { Sim } from '../src/sim/world.js';
import { spawnUnit } from '../src/sim/army.js';
import { View } from '../src/client/view.js';
import { Renderer } from '../src/client/renderer.js';
import { GameAudio } from '../src/audio/audio.js';
import { MODE_BUGHUNT, TEAM_GREEN, TEAM_TAN, TICK_RATE } from '../src/shared/constants.js';
import { TECHS } from '../src/shared/tech.js';
import { drawTitle, drawCard } from './titles.js';

const TICK = 1 / TICK_RATE;
const AUDIBLE = new Set(['shot', 'launch', 'boom', 'flame', 'bite', 'death', 'bdeath', 'craft']);

// ====================================================================== sets (one live world each)

export class WorldSet {
  constructor(kind, W, H) {
    this.kind = kind;
    const bugs = kind === 'bugs';
    const players = kind === 'stage'
      ? [{ id: 'g', name: 'G', team: TEAM_GREEN }, { id: 't', name: 'T', team: TEAM_TAN }]
      : bugs
        ? [{ id: 'g', name: 'G', team: TEAM_GREEN, ai: 'hard' }]
        : [{ id: 'g', name: 'G', team: TEAM_GREEN, ai: 'hard' }, { id: 't', name: 'T', team: TEAM_TAN, ai: 'hard' }];
    this.sim = new Sim({ seed: bugs ? 77 : 1234, mode: bugs ? MODE_BUGHUNT : 'skirmish', players, difficulty: 'normal' });
    this.canvas = document.createElement('canvas');
    this.view = new View(this.canvas);
    Object.assign(this.view, { w: W, h: H, dpr: 1 });
    this.canvas.width = W;
    this.canvas.height = H;
    this.renderer = new Renderer(this.canvas, this.view, this.sim);
    this.acc = 0;
    this.speed = 1;
    this.onAudio = null;
  }

  /** Nobody wins while the cameras roll. */
  immortal() {
    for (const hq of this.sim.hqs) if (hq) hq.maxHp = hq.hp = 1e9;
  }

  /** Fast-forward the war offscreen, letting debris settle and scar the sandbox. */
  warm(seconds) {
    this.immortal();
    const steps = Math.round(seconds * TICK_RATE);
    for (let i = 0; i < steps; i++) {
      this.sim.step();
      this.renderer.onEvents(this.sim.events, this.renderer.time);
      this.renderer.fx.update(TICK);
      this.renderer.time += TICK;
    }
    this.renderer.fx.list = this.renderer.fx.list.filter((p) => p.vz !== undefined);
    for (let i = 0; i < 80; i++) this.renderer.fx.update(TICK);
    this.renderer.fx.list = [];
  }

  researchAll() {
    for (const t of this.sim.teams) for (const id of Object.keys(TECHS)) t.researched.add(id);
  }

  spawn(type, team, lane, x, y) {
    const u = spawnUnit(this.sim, type, team, lane, x, y);
    u.px = u.x;
    u.py = u.y;
    return u;
  }

  /** Advance simulated time by dt seconds; returns interpolation alpha. */
  advance(dt, log) {
    this.acc += dt * this.speed;
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this.sim.step();
      this.renderer.onEvents(this.sim.events, this.renderer.time);
      if (log) log(this.sim.events);
    }
    return this.acc / TICK;
  }
}

// ====================================================================== director

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class Director {
  constructor(canvas, cfg) {
    this.canvas = canvas;
    this.cfg = cfg;
    canvas.width = cfg.width;
    canvas.height = cfg.height;
    this.ctx = canvas.getContext('2d');
    this.onStatus = () => {};
  }

  async prepare() {
    await document.fonts.load('80px Bangers');
    await document.fonts.load('700 40px Oswald');
    await document.fonts.load('800 40px "Baloo 2"');
    const { width: W, height: H } = this.cfg;
    this.sets = {};
    for (const [name, spec] of Object.entries(this.cfg.sets)) {
      this.onStatus(`warming ${name}…`);
      await new Promise((r) => setTimeout(r, 0));
      const set = new WorldSet(spec.kind, W, H);
      if (spec.warm) set.warm(spec.warm);
      else set.immortal();
      spec.init?.(set);
      this.sets[name] = set;
    }
    this.art = await this.cfg.art?.();
  }

  camera(shot, set, u) {
    if (shot.follow) {
      const [x, y] = shot.follow(set, u);
      const [z0, z1] = shot.zoom || [1.5, 1.5];
      set.view.x = x;
      set.view.y = y;
      set.view.zoom = (z0 + (z1 - z0) * ease(clamp01(u / shot.dur))) * (this.cfg.zoomScale ?? 1);
      return;
    }
    const c = typeof shot.cam === 'function' ? shot.cam(set) : shot.cam;
    const k = ease(clamp01(u / shot.dur));
    const [x0, y0, z0] = c.from;
    const [x1, y1, z1] = c.to || c.from;
    set.view.x = x0 + (x1 - x0) * k;
    set.view.y = y0 + (y1 - y0) * k;
    set.view.zoom = (z0 + (z1 - z0) * k) * (this.cfg.zoomScale ?? 1);
  }

  compose(shot, u, dt, alpha) {
    const { ctx } = this;
    const { width: W, height: H } = this.cfg;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (shot.set) {
      const set = this.sets[shot.set];
      this.camera(shot, set, u);
      set.renderer.draw(set.sim, alpha, dt, { ghosts: [], tool: null, team: TEAM_GREEN });
      ctx.drawImage(set.canvas, 0, 0);
      shot.overlay?.(ctx, W, H, u, set, this);
    }
    if (shot.card) drawCard(ctx, W, H, shot.card, u, this.art);
    for (const t of shot.titles || []) drawTitle(ctx, W, H, t, u);
    // film-style fades between shots
    const fin = shot.fadeIn ?? 0.2;
    const fout = shot.fadeOut ?? 0.2;
    const black = Math.max(fin ? 1 - clamp01(u / fin) : 0, fout ? 1 - clamp01((shot.dur - u) / fout) : 0);
    if (black > 0) {
      ctx.fillStyle = `rgba(20,12,6,${black})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (shot.flash && u < 0.15) {
      ctx.fillStyle = `rgba(255,250,235,${0.8 * (1 - u / 0.15)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** Walk the timeline to time t: shot setups, scripted events, cues, simulation. */
  step(t, dt) {
    for (const p of this.pending) {
      const { shot } = p;
      if (!p.setup && t >= shot.at - 0.05) {
        p.setup = true;
        const set = shot.set && this.sets[shot.set];
        if (set) set.speed = shot.speed ?? 1;
        try {
          shot.setup?.(set, this);
        } catch (err) {
          console.error('[director] setup', err);
        }
        if (shot.music) this.log.push({ t, k: 'music', state: shot.music });
        if (shot.intensity !== undefined) this.log.push({ t, k: 'intensity', v: shot.intensity });
      }
      (shot.events || []).forEach((ev, i) => {
        if (p.fired.has(i) || t < shot.at + ev.at) return;
        p.fired.add(i);
        try {
          ev.do(shot.set && this.sets[shot.set], this);
        } catch (err) {
          console.error('[director] event', err);
        }
      });
      (shot.vo || []).forEach((vo, i) => {
        if (p.fired.has(`vo${i}`) || t < shot.at + vo.at) return;
        p.fired.add(`vo${i}`);
        this.log.push({ t, k: 'voice', id: vo.id });
      });
      (shot.sfx || []).forEach((s, i) => {
        if (p.fired.has(`sfx${i}`) || t < shot.at + s.at) return;
        p.fired.add(`sfx${i}`);
        this.log.push({ t, k: 'sfx', name: s.name });
      });
    }
    const shot = this.shotAt(t);
    let alpha = 1;
    if (shot?.set) {
      const set = this.sets[shot.set];
      alpha = set.advance(dt, (events) => this.logEvents(t, set, events));
    }
    return { shot, alpha };
  }

  shotAt(t) {
    const { shots } = this.cfg;
    return shots.find((s) => t >= s.at && t < s.at + s.dur) || shots[shots.length - 1];
  }

  logEvents(t, set, events) {
    const b = set.view.bounds(3);
    const keep = [];
    for (const e of events) {
      if (!AUDIBLE.has(e.e)) continue;
      if (e.x !== undefined && (e.x < b.x0 || e.x > b.x1 || e.y < b.y0 || e.y > b.y1)) continue;
      keep.push({ e: e.e, src: e.src, x: e.x, y: e.y, r: e.r, dtype: e.dtype, type: e.type, team: e.team, id: e.id });
      if (keep.length >= 14) break;
    }
    if (keep.length) {
      this.log.push({ t, k: 'ev', l: { x: set.view.x, y: set.view.y, zoom: set.view.zoom, team: TEAM_GREEN }, ev: keep });
    }
  }

  /** Pass 1: fixed-rate video through WebCodecs, uploaded to promo/out/<name>/. */
  async renderVideo({ fps = 60, every = 0 } = {}) {
    const { width: W, height: H, duration, name } = this.cfg;
    const sheet = every > 0;
    const chunks = [];
    const encoder = sheet ? null : new VideoEncoder({
      output: (chunk) => {
        const buf = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buf);
        chunks.push(buf);
      },
      error: (e) => console.error('[director] encoder', e),
    });
    encoder?.configure({
      codec: 'avc1.640033', width: W, height: H, bitrate: 30e6, framerate: fps,
      avc: { format: 'annexb' }, latencyMode: 'quality', bitrateMode: 'variable',
    });
    this.log = [];
    this.pending = this.cfg.shots.map((shot) => ({ shot, setup: false, fired: new Set() }));
    const total = Math.round(duration * fps);
    const uploads = [];
    for (let f = 0; f < total; f++) {
      const t = f / fps;
      const dt = 1 / fps;
      const { shot, alpha } = this.step(t, dt);
      this.compose(shot, t - shot.at, dt, alpha);
      if (sheet) {
        if (f % every === 0) {
          const blob = await new Promise((r) => this.canvas.toBlob(r, 'image/jpeg', 0.85));
          uploads.push(fetch(`/__save?name=${encodeURIComponent(`${name}-sheet/f_${String(f).padStart(5, '0')}.jpg`)}`, { method: 'POST', body: blob }));
        }
      } else {
        const frame = new VideoFrame(this.canvas, { timestamp: Math.round(f * (1e6 / fps)), duration: Math.round(1e6 / fps) });
        encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
        frame.close();
        while (encoder.encodeQueueSize > 6) await new Promise((r) => encoder.addEventListener('dequeue', r, { once: true }));
      }
      if (f % 30 === 0) {
        this.onStatus(`video ${t.toFixed(1)}s / ${duration}s`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await Promise.all(uploads);
    this.log.push({ t: duration, k: 'end' });
    const folder = sheet ? `${name}-sheet` : name;
    if (!sheet) {
      await encoder.flush();
      encoder.close();
      const res = await fetch(`/__save?name=${encodeURIComponent(`${folder}/video.h264`)}`, { method: 'POST', body: new Blob(chunks) });
      if (!res.ok) throw new Error(`video upload failed ${res.status}`);
    }
    await fetch(`/__save?name=${encodeURIComponent(`${folder}/cues.json`)}`, { method: 'POST', body: JSON.stringify(this.log) });
    return `video done (${total} frames, ${this.log.length} cues)`;
  }

  /** Pass 2: replay the cue log through the real audio engine in real time and record the mix. */
  async renderAudio() {
    const { name, duration } = this.cfg;
    const log = await fetch(`out/${name}/cues.json`, { cache: 'no-store' }).then((r) => r.json());
    const audio = new GameAudio();
    audio.unlock();
    if (!audio.ctx || audio.ctx.state !== 'running') throw new Error('AudioContext not running: click the page first.');
    await audio.loadVoices('voice/');
    // decode every clip up front so nothing lands late
    await Promise.all(log.filter((e) => e.k === 'voice').map((e) => audio._clipBuffer(e.id)));
    audio.setVolumes({ master: 0.9, music: 0.7, sfx: 0.8 });
    const stream = audio.captureStream();
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 256000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const apply = (e) => {
      if (e.k === 'ev') audio.onEvents(e.ev, e.l);
      else if (e.k === 'voice') audio.voice(e.id, '', { priority: true });
      else if (e.k === 'sfx') audio.play(e.name);
      else if (e.k === 'music') audio.music(e.state);
      else if (e.k === 'intensity') audio.setIntensity(e.v);
    };
    rec.start(250);
    const t0 = performance.now();
    await new Promise((resolve) => {
      let i = 0;
      let last = t0;
      const pump = () => {
        const now = performance.now();
        const t = (now - t0) / 1000;
        audio.update((now - last) / 1000);
        last = now;
        while (i < log.length && log[i].t <= t) apply(log[i++]);
        if (i % 20 === 0) this.onStatus(`audio ${t.toFixed(1)}s / ${duration}s`);
        if (t >= duration + 0.3) resolve();
        else setTimeout(pump, 4);
      };
      pump();
    });
    await new Promise((r) => {
      rec.onstop = r;
      rec.stop();
    });
    audio.music(null);
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const res = await fetch(`/__save?name=${encodeURIComponent(`${name}/audio.webm`)}`, { method: 'POST', body: blob });
    return `audio ${res.ok ? 'saved' : 'FAILED'} (${(blob.size / 1024).toFixed(0)} KB)`;
  }
}

export { TEAM_GREEN, TEAM_TAN };
