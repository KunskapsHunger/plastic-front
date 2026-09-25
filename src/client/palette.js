// Colours for the playroom. The factory is cheerful primary plastic; the sandbox is where it all ends.

export const TP = 40; // world texture pixels per tile

export const TEAM_COLORS = [
  { base: '#5e9c3c', light: '#8cc463', dark: '#3b6b22', deep: '#27491a', name: 'GREEN' },
  { base: '#c9a36a', light: '#e8c992', dark: '#977543', deep: '#6a5130', name: 'TAN' },
  { base: '#4a3a2e', light: '#7a6a52', dark: '#2a1f18', deep: '#170f0b', name: 'SWARM' },
];

export const TOY = {
  red: '#e0463a',
  redDark: '#a82d25',
  yellow: '#f5c542',
  yellowDark: '#c7962a',
  blue: '#3b82d6',
  blueDark: '#265b9e',
  orange: '#f08a2c',
  purple: '#8d5cc9',
  white: '#fbf7ee',
  steel: '#b8c3cc',
  steelDark: '#7d8a95',
  ink: '#2a2420',
};

export const BLOCK_COLORS = ['#e0463a', '#f5c542', '#3b82d6', '#56b04e', '#f08a2c', '#8d5cc9', '#e86aa6'];

export const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (f >= 0) {
    r += (255 - r) * f;
    g += (255 - g) * f;
    b += (255 - b) * f;
  } else {
    r *= 1 + f;
    g *= 1 + f;
    b *= 1 + f;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
};
