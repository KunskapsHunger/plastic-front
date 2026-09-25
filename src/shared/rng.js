// Deterministic PRNG (mulberry32). Integer-only state, so every peer draws identical sequences.

export class Rng {
  constructor(seed = 1) {
    this.state = seed >>> 0 || 1;
  }

  /** Uniform in [0, 1). */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a, b) {
    return a + (b - a) * this.next();
  }

  int(n) {
    return Math.floor(this.next() * n);
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[this.int(arr.length)];
  }
}

/** Stable 32-bit hash mixer for building state checksums. */
export function mix(h, v) {
  h = Math.imul(h ^ (v | 0), 0x01000193);
  return (h ^ (h >>> 13)) | 0;
}
