// 9:16 whimsical short (1080×1920, ~23.5 s): the brief, brave life of Kevin.
import { LANE_Y, TEAM_GREEN, loadArt, parade, shell } from './sets.js';
import { drawTitle } from './titles.js';

const T = (text, at, dur, extra = {}) => ({ text, at, dur, y: 0.2, size: 118, ...extra });

let kevin = null;
let lastSeen = [40, LANE_Y[1]];
let made = 0;

/** A name tag that follows Kevin around. */
function tag(ctx, W, H, u, set) {
  if (!kevin || kevin.dead) return;
  lastSeen = [kevin.x, kevin.y];
  const [sx, sy] = set.view.toScreen(kevin.x, kevin.y - 1.6);
  drawTitle(ctx, W, H, { text: 'KEVIN', at: 0, dur: 99, x: sx / W, y: sy / H, size: 70, style: 'label' }, u + 1);
}

export const CONFIG = {
  name: 'plastic-front-short-whimsy-9x16',
  width: 1080,
  height: 1920,
  duration: 23.6,
  art: loadArt,
  sets: {
    stage: { kind: 'stage' },
    war: { kind: 'war', warm: 200 },
  },
  shots: [
    // ---------------------------------------------------------------- meet Kevin
    {
      at: 0, dur: 3.2, set: 'stage', fadeIn: 0.1, fadeOut: 0,
      music: 'game', intensity: 0.2,
      setup: (s) => {
        const g = s.sim.laneEnd(TEAM_GREEN, 1);
        kevin = s.spawn('rifle', TEAM_GREEN, 1, g.x + g.w + 0.4, g.y + 1);
        kevin.spread = 0;
      },
      follow: () => (kevin ? [kevin.x + 0.3, kevin.y - 0.6] : lastSeen),
      zoom: [6.2, 5.4],
      overlay: tag,
      vo: [{ at: 0.3, id: 'sw_1' }],
      titles: [T('THIS IS\nKEVIN.', 0.3, 2.9)],
    },
    {
      at: 3.2, dur: 5.4, set: 'stage', fadeIn: 0, fadeOut: 0,
      follow: () => (kevin ? [kevin.x + 0.6, kevin.y - 0.6] : lastSeen),
      zoom: [5.4, 4.4],
      overlay: tag,
      vo: [{ at: 0.1, id: 'sw_2' }],
      titles: [T('KEVIN IS\nPLASTIC.', 0.2, 2.3), T('KEVIN IS\nVERY BRAVE.', 2.6, 2.8)],
    },
    // ---------------------------------------------------------------- oh no, Kevin
    {
      at: 8.6, dur: 3.8, set: 'stage', fadeIn: 0,
      follow: () => (kevin && !kevin.dead ? [kevin.x + 0.8, kevin.y - 0.6] : [lastSeen[0] + 0.8, lastSeen[1] - 0.6]),
      zoom: [4.4, 3.8],
      overlay: tag,
      events: [{ at: 0.1, do: (s) => shell(s, kevin.x + 0.9, kevin.y, { flight: 0.75 }) }],
      vo: [{ at: 1.2, id: 'sw_3' }],
      titles: [{ text: 'RECYCLED', at: 1.05, dur: 2.7, y: 0.62, size: 150, style: 'stamp' }],
    },
    // ---------------------------------------------------------------- 400 more Kevins
    {
      at: 12.4, dur: 5.2, set: 'war', intensity: 0.8, flash: true,
      cam: (s) => {
        const g = s.sim.laneEnd(TEAM_GREEN, 1);
        return { from: [g.x + 4, g.y + 1, 2.6], to: [g.x + 6, g.y + 1, 2.1] };
      },
      setup: () => {
        made = 0;
      },
      events: Array.from({ length: 40 }, (_, i) => ({
        at: i * 0.1,
        do: (s) => {
          parade(s, TEAM_GREEN, 1, 3);
          made = Math.min(400, made + 10);
        },
      })),
      overlay: (ctx, W, H) => drawTitle(ctx, W, H, {
        text: `KEVINS: ${String(made).padStart(3, '0')}`, at: 0, dur: 99, y: 0.78, size: 96, style: 'banner',
      }, 1),
      vo: [{ at: 0.3, id: 'sw_4' }],
      titles: [T('GOOD NEWS!', 0.2, 2.0), T('WE MADE\n400 MORE KEVINS', 2.1, 3.0, { size: 104 })],
    },
    // ---------------------------------------------------------------- end card
    {
      at: 17.6, dur: 6, fadeOut: 0.5, card: { type: 'end' },
      music: 'victory',
      vo: [{ at: 0.4, id: 'sw_5' }],
    },
  ],
};
