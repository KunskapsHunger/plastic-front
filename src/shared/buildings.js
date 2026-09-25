// Building and recipe definitions. Sizes in tiles; recipe times in seconds; costs in Requisition.
// `tech` names the research that unlocks the building (null = available from the start).

export const RECIPES = {
  figure: { in: { pellets: 2 }, out: { figure: 1 }, time: 1.4 },
  plate: { in: { tin: 1 }, out: { plate: 1 }, time: 1.2 },
  spring: { in: { tin: 1 }, out: { spring: 2 }, time: 1.6, tech: 'tin' },
  caps: { in: { powder: 1 }, out: { caps: 3 }, time: 1.0 },
  firecracker: { in: { powder: 2 }, out: { firecracker: 1 }, time: 2.0, tech: 'fireworks' },

  rifle: { in: { figure: 1, caps: 2 }, out: { crate_rifle: 1 }, time: 3.0 },
  mg: { in: { figure: 1, plate: 1, caps: 4 }, out: { crate_mg: 1 }, time: 5.0, tech: 'tin' },
  grenadier: { in: { figure: 1, firecracker: 2 }, out: { crate_grenadier: 1 }, time: 4.5, tech: 'fireworks' },
  medic: { in: { figure: 1, plate: 1, spring: 1 }, out: { crate_medic: 1 }, time: 5.0, tech: 'glue' },
  flamer: { in: { figure: 1, plate: 1, firecracker: 1 }, out: { crate_flamer: 1 }, time: 5.0, tech: 'kitchen' },
  mortar: { in: { figure: 2, plate: 1, firecracker: 2 }, out: { crate_mortar: 1 }, time: 7.0, tech: 'artillery' },
  tank: { in: { plate: 4, spring: 3, firecracker: 1 }, out: { crate_tank: 1 }, time: 12.0, tech: 'windup' },
  plane: { in: { plate: 3, spring: 2, firecracker: 2 }, out: { crate_plane: 1 }, time: 10.0, tech: 'air' },
  colossus: {
    in: { figure: 6, plate: 10, spring: 6, firecracker: 4 }, out: { crate_colossus: 1 }, time: 30.0, tech: 'colossus',
  },
};

export const BUILDINGS = {
  scoop: {
    name: 'Scoop', w: 2, h: 2, cost: 40, hp: 200, hotkey: '1',
    blurb: 'Digs up whatever it sits on. Faster with more deposit under it.',
  },
  belt: { name: 'Conveyor', w: 1, h: 1, cost: 2, hp: 60, hotkey: '2', blurb: 'The artery of the Federation.' },
  junction: { name: 'Junction', w: 1, h: 1, cost: 6, hp: 60, hotkey: '3', blurb: 'Lets two belts cross.' },
  splitter: {
    name: 'Splitter', w: 1, h: 1, cost: 8, hp: 60, hotkey: '4', blurb: 'Deals items out to the front, left and right.',
  },
  sorter: {
    name: 'Sorter', w: 1, h: 1, cost: 12, hp: 60, hotkey: '5', tech: 'sorting',
    blurb: 'Chosen item goes straight on. Everything else is turned aside.',
  },
  press: {
    name: 'Molding Press', w: 2, h: 2, cost: 80, hp: 300, hotkey: '6', recipes: ['figure'],
    blurb: 'Pellets in, heroes out.',
  },
  tinworks: {
    name: 'Tinworks', w: 2, h: 2, cost: 90, hp: 300, hotkey: '7', recipes: ['plate', 'spring'], tech: 'tin',
    blurb: 'Stamps tin into plates and springs.',
  },
  mill: {
    name: 'Powder Mill', w: 2, h: 2, cost: 80, hp: 280, hotkey: '8', recipes: ['caps', 'firecracker'],
    blurb: 'Grinds bang powder into caps and firecrackers.',
  },
  bench: {
    name: 'Assembly Bench', w: 3, h: 3, cost: 150, hp: 450, hotkey: '9',
    recipes: ['rifle', 'mg', 'grenadier', 'medic', 'flamer', 'mortar', 'tank', 'plane', 'colossus'],
    blurb: 'Where parts become patriots.',
  },
  popgun: {
    name: 'Pop-Gun Nest', w: 1, h: 1, cost: 60, hp: 260, hotkey: 'z', ammo: 'caps', shotsPerAmmo: 3, maxShots: 30,
    attack: { kind: 'hitscan', range: 7, damage: 7, cooldown: 0.35, dtype: 'bullet' },
    blurb: 'Belt caps into it. It does the rest.',
  },
  mortarpit: {
    name: 'Mortar Pit', w: 2, h: 2, cost: 140, hp: 400, hotkey: 'x', tech: 'artillery',
    ammo: 'firecracker', shotsPerAmmo: 2, maxShots: 12,
    attack: { kind: 'lob', range: 15, minRange: 3, damage: 55, splash: 1.8, cooldown: 4, flight: 1.6, dtype: 'blast' },
    blurb: 'Feed it firecrackers. It reaches deep into the sandbox.',
  },
  flak: {
    name: 'Flak Nest', w: 2, h: 2, cost: 120, hp: 350, hotkey: 'c', tech: 'air', ammo: 'caps', shotsPerAmmo: 4,
    maxShots: 40, airOnly: true,
    attack: { kind: 'hitscan', range: 9, damage: 14, cooldown: 0.25, dtype: 'flak' },
    blurb: 'Keeps the sky clean. Eats caps.',
  },
  reclaimer: {
    name: 'Reclaimer', w: 2, h: 2, cost: 100, hp: 300, hotkey: 'v', tech: 'reclaim',
    blurb: 'Today\'s fallen are tomorrow\'s heroes. Outputs pellets from the scrap pool.',
  },

  // fixed structures, never buildable
  gate: {
    name: 'Gate', w: 2, h: 2, cost: 250, hp: 4000, fixed: true,
    attack: { kind: 'hitscan', range: 6, damage: 12, cooldown: 0.5, dtype: 'bullet' },
    blurb: 'Belt unit crates in. Soldiers come out the other side.',
  },
  hq: {
    name: 'Command Toybox', w: 4, h: 6, cost: 0, hp: 10000, fixed: true,
    attack: { kind: 'hitscan', range: 7, damage: 18, cooldown: 0.5, dtype: 'bullet' },
    blurb: 'The heart of the war effort. Anything belted in is sold as War Bonds.',
  },
  burrow: {
    name: 'Burrow', w: 2, h: 2, cost: 0, hp: 5000, fixed: true, blurb: 'They keep coming out of it.',
  },
  hive: { name: 'The Hive', w: 4, h: 6, cost: 0, hp: 12000, fixed: true, blurb: 'Where it all crawls from.' },
};

export const BUILD_ORDER = [
  'scoop', 'belt', 'junction', 'splitter', 'sorter',
  'press', 'tinworks', 'mill', 'bench',
  'popgun', 'mortarpit', 'flak', 'reclaimer',
];

export const BELT_SPEED = 2.2; // tiles per second
export const BELT_SPACING = 0.25; // min distance between items on a belt
export const SCOOP_PERIOD = 1.0; // seconds per item at full coverage (4 deposit tiles)
export const RECLAIM_PERIOD = 0.8;
export const MACHINE_BUFFER = 2; // input buffer holds this many crafts worth
export const OUTPUT_BUFFER = 4;
export const GATE_QUEUE = 4;
export const GATE_DEPLOY_TIME = 0.6;
export const REFUND = 0.75;
export const GATE_REBUILD_SAFE_RADIUS = 8;
