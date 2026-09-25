// 9:16 explanatory short (1080×1920, ~43 s): how to win a toy war in four easy steps.
import { LANE_Y, TEAM_GREEN, TEAM_TAN, battle, find, loadArt, many, parade } from './sets.js';

const STEP = (text, at, dur) => ({ text, at, dur, y: 0.12, size: 92, style: 'banner' });
const C = (text, at, dur, extra = {}) => ({ text, at, dur, y: 0.8, size: 88, ...extra });
const SWARM = 2;

export const CONFIG = {
  name: 'plastic-front-short-explainer-9x16',
  width: 1080,
  height: 1920,
  duration: 43.2,
  zoomScale: 1.5,
  art: loadArt,
  sets: {
    war: { kind: 'war', warm: 230, init: (s) => s.researchAll() },
    bugs: { kind: 'bugs', warm: 95 },
  },
  shots: [
    // ---------------------------------------------------------------- hook
    {
      at: 0, dur: 4.4, set: 'war', fadeIn: 0.1, flash: true, music: 'game', intensity: 0.9,
      cam: { from: [67, LANE_Y[1], 1.55], to: [67, LANE_Y[1], 1.75] },
      setup: (s) => battle(s, 1, 67,
        ['tank', ...many('rifle', 7), 'flamer', 'grenadier', 'grenadier', 'mortar'],
        ['tank', ...many('rifle', 8), 'flamer', 'grenadier', 'mg'], 0.9),
      vo: [{ at: 0.2, id: 'se_1' }],
      titles: [C('HOW TO WIN\nA TOY WAR', 0.1, 4.2, { y: 0.22, size: 124 }), C('IN 4 EASY STEPS', 1.4, 2.9, { size: 96, color: '#e8b93a' })],
    },
    // ---------------------------------------------------------------- 1: scoop
    {
      at: 4.4, dur: 6, set: 'war', intensity: 0.3,
      cam: (s) => {
        const [x, y] = find(s, 'scoop', TEAM_GREEN, [17, 21], (b) => b.kinds.includes('powder'));
        return { from: [x - 1, y, 2.6], to: [x + 1, y + 1, 2.1] };
      },
      vo: [{ at: 0.2, id: 'se_2' }],
      titles: [STEP('STEP 1: SCOOP', 0.2, 5.6), C('PELLETS · TIN · BANG POWDER', 2.2, 3.6, { size: 72 })],
    },
    // ---------------------------------------------------------------- 2: belt it
    {
      at: 10.4, dur: 5.6, set: 'war',
      cam: (s) => {
        const [mx, my] = find(s, 'mill');
        const [bx, by] = find(s, 'bench');
        return { from: [mx, my, 2.3], to: [bx, by, 1.8] };
      },
      vo: [{ at: 0.2, id: 'se_3' }],
      titles: [STEP('STEP 2: BELT IT', 0.2, 5.2), C('PRESS · MILL · BENCH', 2.4, 3.0, { size: 76 })],
    },
    // ---------------------------------------------------------------- 3: feed the gate
    {
      at: 16, dur: 7.8, set: 'war', intensity: 0.5,
      cam: (s) => {
        const g = s.sim.laneEnd(TEAM_GREEN, 1);
        return { from: [g.x - 1, g.y + 1, 2.0], to: [g.x + 7, g.y + 1, 1.6] };
      },
      events: Array.from({ length: 12 }, (_, i) => ({ at: 0.5 + i * 0.45, do: (s) => parade(s, TEAM_GREEN, 1, 2) })),
      vo: [{ at: 0.2, id: 'se_4' }],
      titles: [STEP('STEP 3: FEED THE GATE', 0.2, 7.4), C('THEY MARCH\nON THEIR OWN', 3.2, 4.2, { size: 84 })],
    },
    // ---------------------------------------------------------------- 4: don't look too closely
    {
      at: 23.8, dur: 7.6, set: 'war', intensity: 1, flash: true,
      cam: { from: [66, LANE_Y[2] - 2.5, 1.6], to: [68, LANE_Y[2] - 2.5, 1.9] },
      setup: (s) => battle(s, 2, 67,
        ['tank', ...many('rifle', 9), 'flamer', 'flamer', 'grenadier', 'grenadier', 'mortar', 'mg'],
        ['tank', ...many('rifle', 10), 'flamer', 'grenadier', 'grenadier', 'mortar', 'mg'], 0.9),
      vo: [{ at: 0.2, id: 'se_5' }],
      titles: [
        STEP('STEP 4: DON\'T LOOK\nTOO CLOSELY', 0.2, 7.2),
        { text: 'IT\'S FINE', at: 4.6, dur: 2.8, y: 0.66, size: 150, style: 'stamp' },
      ],
    },
    // ---------------------------------------------------------------- the modes
    {
      at: 31.4, dur: 3.3, set: 'bugs', intensity: 0.9, flash: true,
      cam: { from: [60, LANE_Y[1], 1.5], to: [57, LANE_Y[1], 1.7] },
      setup: (s) => {
        s.researchAll();
        battle(s, 1, 58, [...many('rifle', 12), 'flamer', 'flamer', 'mg'],
          [...many('ant', 22), 'beetle', 'beetle', 'spider', 'bombardier', 'queen'], 1.1, SWARM);
      },
      vo: [{ at: 0.2, id: 'se_6' }],
      titles: [C('CO-OP\nBUG HUNT', 0.1, 3.2, { y: 0.2, size: 120 })],
    },
    {
      at: 34.7, dur: 3.3, set: 'war', flash: true,
      cam: { from: [70, LANE_Y[0] + 2.5, 1.5], to: [66, LANE_Y[0] + 2.5, 1.7] },
      setup: (s) => battle(s, 0, 68, [...many('rifle', 10), 'tank', 'grenadier'], [...many('rifle', 10), 'tank', 'flamer'], 0.9),
      titles: [C('VERSUS\nFRIENDS', 0.1, 3.2, { y: 0.2, size: 120 }), C('PEER-TO-PEER\nIN YOUR BROWSER', 0.6, 2.6, { size: 72, color: '#e8b93a' })],
    },
    // ---------------------------------------------------------------- end card
    {
      at: 38, dur: 5.2, fadeOut: 0.5, card: { type: 'end' },
      music: 'victory',
      vo: [{ at: 0.4, id: 'se_7' }],
    },
  ],
};

export { TEAM_TAN };
