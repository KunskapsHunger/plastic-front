// The host's metronome. Runs in a Web Worker so it keeps ticking while the host's tab is in the
// background. Every tick it seals the commands that arrived into one bundle; every peer (including
// the host) executes bundles in order, which is all lockstep needs.
const TICK_MS = 50;
// The host's own commands arrive instantly; holding them this many ticks keeps the host from having
// a reaction-time edge over players whose commands have to cross the network.
const HOST_DELAY = 3;

let tick = 0;
let pending = [];
let delayed = []; // host commands waiting for their tick
let timer = null;
let last = 0;
let acc = 0;

function pump() {
  const now = performance.now();
  acc += Math.min(1000, now - last);
  last = now;
  while (acc >= TICK_MS) {
    acc -= TICK_MS;
    const due = delayed.filter((d) => d.at <= tick).map((d) => d.cmd);
    delayed = delayed.filter((d) => d.at > tick);
    self.postMessage({ t: 'b', n: tick++, c: [...due, ...pending] });
    pending = [];
  }
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'start' && !timer) {
    last = performance.now();
    timer = setInterval(pump, TICK_MS / 2);
  } else if (m.type === 'cmd') {
    if (m.p === 'host') delayed.push({ at: tick + HOST_DELAY, cmd: { p: m.p, c: m.c } });
    else pending.push({ p: m.p, c: m.c });
  } else if (m.type === 'stop') {
    clearInterval(timer);
    timer = null;
  }
};
