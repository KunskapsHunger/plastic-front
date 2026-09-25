// 16:9 YouTube trailer (1920×1080, ~68 s): a Federal Playroom Network recruitment film.
import { LANE_Y, TEAM_GREEN, battle, find, loadArt, many, parade, reclaimerLine } from './sets.js';

const SWARM = 2;

const C = (text, at, dur, extra = {}) => ({ text, at, dur, y: 0.8, size: 92, ...extra });
const B = (text, at, dur, extra = {}) => ({ text, at, dur, y: 0.14, size: 70, style: 'banner', ...extra });

let colossus = null;

export const CONFIG = {
  name: 'plastic-front-trailer-16x9',
  width: 1920,
  height: 1080,
  duration: 68.2,
  zoomScale: 1.9,
  art: loadArt,
  sets: {
    war: { kind: 'war', warm: 230, init: (s) => { s.researchAll(); reclaimerLine(s); } },
    bugs: { kind: 'bugs', warm: 95 },
  },
  shots: [
    // ---------------------------------------------------------------- newsreel bumper
    {
      at: 0, dur: 5.8, fadeIn: 0.3, card: { type: 'fpn', sub: 'PRESENTS A RECRUITMENT FILM' },
      music: 'game', intensity: 0.3,
      sfx: [{ at: 0.1, name: 'ticker' }],
      vo: [{ at: 0.4, id: 'tr_1' }],
    },
    // ---------------------------------------------------------------- the factory
    {
      at: 5.8, dur: 6.8, set: 'war',
      cam: (s) => {
        const [px, py] = find(s, 'scoop');
        return { from: [px - 4, py + 1, 1.35], to: [px + 6, py + 3, 1.6] };
      },
      vo: [{ at: 0.2, id: 'tr_2' }],
      titles: [B('BUILD THE MACHINE', 3.2, 3.5)],
    },
    {
      at: 12.6, dur: 6.2, set: 'war',
      cam: (s) => {
        const [bx, by] = find(s, 'bench');
        return { from: [bx - 1, by, 2.1], to: [bx + 4, by, 1.6] };
      },
      setup: (s) => parade(s, TEAM_GREEN, 1, 8),
      vo: [{ at: 0.2, id: 'tr_3' }],
      titles: [C('PARTS IN. PATRIOTS OUT.', 2.6, 3.5)],
    },
    // ---------------------------------------------------------------- off to the sandbox
    {
      at: 18.8, dur: 6.4, set: 'war', intensity: 0.5,
      cam: { from: [38, LANE_Y[0] + 1, 1.3], to: [45, LANE_Y[0] + 1, 1.15] },
      setup: (s) => {
        parade(s, TEAM_GREEN, 0, 24);
        for (const u of s.sim.units) if (u.team === TEAM_GREEN && u.lane === 0 && u.x < 44) u.x -= 0.5;
      },
      vo: [{ at: 0.2, id: 'tr_4' }],
      titles: [B('FEED THE FRONT', 3.4, 2.8)],
    },
    // ---------------------------------------------------------------- the meat grinder
    {
      at: 25.2, dur: 6.8, set: 'war', intensity: 1, flash: true,
      cam: { from: [66, LANE_Y[1], 1.2], to: [68, LANE_Y[1], 1.45] },
      setup: (s) => battle(s, 1, 67,
        ['tank', ...many('rifle', 8), 'flamer', 'flamer', 'grenadier', 'grenadier', 'mg', 'mortar', 'mortar', 'tank'],
        ['tank', ...many('rifle', 9), 'flamer', 'grenadier', 'grenadier', 'mg', 'mg', 'mortar', 'tank'], 1.1),
      vo: [{ at: 0.3, id: 'tr_5' }],
      titles: [C('WIND-UP TANKS · FLAMERS · FIRECRACKERS', 1.2, 5.2, { size: 70 })],
    },
    // ---------------------------------------------------------------- the aftermath
    {
      at: 32, dur: 6.2, set: 'war', intensity: 0.35, speed: 0.6,
      cam: { from: [60, LANE_Y[1] + 1, 1.15], to: [72, LANE_Y[1], 1.05] },
      vo: [{ at: 0.3, id: 'tr_6' }],
      titles: [C('Glory from every sacrifice.', 1.0, 5.0, { size: 64, font: 'head', shadow: null })],
    },
    {
      at: 38.2, dur: 5.4, set: 'war', intensity: 0.35,
      cam: (s) => {
        const [x, y] = find(s, 'reclaimer');
        return { from: [x + 1, y, 2.1], to: [x + 2, y, 1.8] };
      },
      titles: [B('RECYCLE THE FALLEN', 0.5, 4.6)],
    },
    // ---------------------------------------------------------------- Bug Hunt
    {
      at: 43.6, dur: 8.4, set: 'bugs', intensity: 0.9, flash: true,
      cam: { from: [62, LANE_Y[1], 1.1], to: [56, LANE_Y[1], 1.35] },
      setup: (s) => {
        s.researchAll();
        battle(s, 1, 58,
          [...many('rifle', 14), 'flamer', 'flamer', 'flamer', 'mg', 'mg', 'tank'],
          [...many('ant', 26), 'beetle', 'beetle', 'beetle', 'spider', 'spider', 'bombardier', 'bombardier', 'queen'], 1.3, SWARM);
      },
      vo: [{ at: 0.3, id: 'tr_7' }],
      titles: [B('CO-OP BUG HUNT', 0.4, 3.2), C('Up to 4 friends · peer-to-peer', 4.2, 3.8, { size: 64, font: 'head', shadow: null })],
    },
    // ---------------------------------------------------------------- the COLOSSUS
    {
      at: 52, dur: 8.2, set: 'war', intensity: 1,
      follow: (s) => (colossus ? [colossus.x + 2.5, colossus.y - 1.6] : [60, LANE_Y[2]]),
      zoom: [1.7, 1.35],
      setup: (s) => {
        colossus = s.spawn('colossus', TEAM_GREEN, 2, 56, LANE_Y[2]);
        colossus.hp = colossus.maxHp = 1e6;
        battle(s, 2, 66, many('rifle', 8), [...many('rifle', 20), 'tank', 'tank', 'mg'], 1.2);
      },
      vo: [{ at: 0.4, id: 'tr_8' }],
      titles: [B('BUILD THE MACHINE.\nTHE MACHINE BUILDS THE ARMY.', 4.2, 3.9, { size: 60 })],
    },
    // ---------------------------------------------------------------- end card
    {
      at: 60.2, dur: 8, fadeOut: 0.6, card: { type: 'end' },
      music: 'victory',
      vo: [{ at: 0.6, id: 'tr_9' }],
    },
  ],
};
