// Entry point: the recruitment poster (title), the lobby, and handing off to a Game.
import { MODE_BUGHUNT, MODE_SKIRMISH, TEAM_GREEN, TEAM_TAN } from './shared/constants.js';
import { SLOGAN } from './shared/propaganda.js';
import { Game } from './client/game.js';
import { LocalSession } from './net/local.js';
import { showTitle } from './ui/menu.js';

class SilentAudio {
  constructor() {
    this.muted = false;
  }

  unlock() {}
  toggleMute() {
    this.muted = !this.muted;
  }

  setMuted(m) {
    this.muted = m;
  }

  setVolumes() {}
  play() {}
  onEvents() {}
  music() {}
  setIntensity() {}
  announce() {}
  voice() {}
  update() {}
}

async function loadAudio() {
  try {
    const { GameAudio } = await import('./audio/audio.js');
    return new GameAudio();
  } catch (err) {
    console.warn('[audio] unavailable, running silent', err);
    return new SilentAudio();
  }
}

const audio = await loadAudio();
await audio.loadVoices?.('voice/');
const params = new URLSearchParams(location.search);
let game = null;

function startSolo({ name, mode, difficulty, team = TEAM_GREEN, autopilot = null }) {
  const me = { id: 'me', name, team, ai: autopilot };
  const players = [me];
  if (mode === MODE_SKIRMISH) players.push({ id: 'ai', name: 'General Plasticov', team: team === TEAM_GREEN ? TEAM_TAN : TEAM_GREEN, ai: difficulty });
  const config = { seed: (Math.random() * 2 ** 31) | 0, mode, players, difficulty };
  startGame({ config, session: new LocalSession(me.id), playerId: me.id, solo: true });
}

export function startGame({ config, session, playerId, solo }) {
  document.getElementById('screens').replaceChildren();
  game = new Game({
    config, session, playerId, solo, audio,
    onQuit: () => {
      game = null;
      document.getElementById('desync').hidden = true;
      title();
    },
  });
  window.__game = game; // handy for debugging from the console
}

function title() {
  audio.music('menu');
  showTitle({ audio, slogan: SLOGAN, onSolo: startSolo, onStartNet: startGame, invite: params.get('join') });
}

// ?quick=skirmish|bughunt skips the poster (development convenience)
const quick = params.get('quick');
if (quick) {
  startSolo({
    name: 'Commander', mode: quick === 'bughunt' ? MODE_BUGHUNT : MODE_SKIRMISH, difficulty: params.get('ai') || 'normal',
    autopilot: params.get('auto'), // ?auto=normal lets an AI run your factory (for watching)
  });
}
else title();
