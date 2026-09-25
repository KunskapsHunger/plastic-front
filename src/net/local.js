// Solo play: a local clock that stamps your commands into one bundle per tick, exactly like the
// network host does, so single-player runs the very same lockstep path. It can pause and speed up.
import { TICK_RATE } from '../shared/constants.js';

export class LocalSession {
  constructor(playerId) {
    this.playerId = playerId;
    this.pending = [];
    this.tick = 0;
    this.paused = false;
    this.speed = 1;
    this.onBundle = () => {};
    this.last = performance.now();
    this.acc = 0;
    this.timer = setInterval(() => this.pump(), 1000 / TICK_RATE / 2);
  }

  send(c) {
    this.pending.push({ p: this.playerId, c });
  }

  setPaused(p) {
    this.paused = p;
  }

  setSpeed(s) {
    this.speed = s;
  }

  pump() {
    const now = performance.now();
    const dt = Math.min(200, now - this.last);
    this.last = now;
    if (this.paused) return;
    this.acc += dt * this.speed;
    const tickMs = 1000 / TICK_RATE;
    while (this.acc >= tickMs) {
      this.acc -= tickMs;
      this.onBundle({ t: this.tick++, c: this.pending.splice(0) });
    }
  }

  destroy() {
    clearInterval(this.timer);
  }
}
