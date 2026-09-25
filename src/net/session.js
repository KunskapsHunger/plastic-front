// Peer-to-peer sessions. Star topology: every peer connects to the host's browser, which runs the
// lobby and the lockstep clock. PeerJS's public broker only brokers the WebRTC handshake; tabs in one
// browser talk over a BroadcastChannel instead. Messages are small JSON objects.
import { HASH_INTERVAL, MODE_BUGHUNT, MODE_SKIRMISH, TEAM_GREEN, TEAM_TAN } from '../shared/constants.js';

const PEER_PREFIX = 'plastic-front-';
const CODE_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY34679';
export const HOST_ID = 'host';
const MAX_PLAYERS = 4;
const MAX_NAME = 18;

function PeerCtor() {
  const P = globalThis.peerjs?.Peer;
  if (!P) throw new Error('The peer-to-peer library failed to load.');
  return P;
}

export function makeRoomCode(len = 5) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

const cleanName = (n) => String(n || 'Commander').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, MAX_NAME) || 'Commander';

function describePeerError(err) {
  switch (err?.type) {
    case 'peer-unavailable': return 'No war with that code. Check it, and that the host is still there.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed': return 'Could not reach the matchmaking broker. Check your connection.';
    case 'browser-incompatible': return 'This browser does not support WebRTC.';
    case 'webrtc': return 'The peer-to-peer link failed (a strict firewall may be blocking it).';
    default: return err?.message || 'Unknown network error';
  }
}

// ====================================================================== host

/**
 * Hosts the lobby and the clock. Emits:
 *   onLobby(state)   – lobby changed
 *   onStart(config)  – the war starts (also sent to every peer)
 *   onBundle(b)      – a tick bundle for the host's own game
 *   onDesync()
 */
export class HostSession {
  constructor(name) {
    this.code = makeRoomCode();
    this.peers = new Map(); // id → { send, close, kind }
    this.lobby = {
      mode: MODE_SKIRMISH,
      difficulty: 'normal',
      players: [{ id: HOST_ID, name: cleanName(name), team: TEAM_GREEN }],
    };
    this.started = false;
    this.hashes = new Map();
    this.onLobby = () => {};
    this.onStart = () => {};
    this.onBundle = () => {};
    this.onDesync = () => {};
    this.onStatus = () => {};
    this.nextAi = 1;
    this.openLocal();
  }

  get playerId() {
    return HOST_ID;
  }

  // ------------------------------------------------------------------ transports

  openOnline() {
    return new Promise((resolve, reject) => {
      const Peer = PeerCtor();
      const peer = new Peer(PEER_PREFIX + this.code, { debug: 1 });
      let settled = false;
      peer.on('open', () => {
        settled = true;
        this.peer = peer;
        resolve(this.code);
      });
      peer.on('error', (err) => {
        if (!settled) {
          settled = true;
          peer.destroy();
          reject(new Error(describePeerError(err)));
          return;
        }
        this.onStatus(describePeerError(err));
      });
      peer.on('disconnected', () => {
        if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500);
      });
      peer.on('connection', (conn) => {
        const id = `p:${conn.peer.slice(0, 12)}:${conn.connectionId.slice(-4)}`;
        conn.on('open', () => this.addPeer(id, 'peer', (m) => conn.open && conn.send(m), () => conn.close()));
        conn.on('data', (m) => this.fromPeer(id, m));
        conn.on('close', () => this.dropPeer(id));
        conn.on('error', () => this.dropPeer(id));
      });
    });
  }

  openLocal() {
    const ch = new BroadcastChannel(`plastic-front-${this.code}`);
    this.channel = ch;
    ch.onmessage = (e) => {
      const m = e.data;
      if (!m || m.to !== HOST_ID) return;
      const id = `tab:${m.from}`;
      if (m.kind === 'hello') {
        this.addPeer(id, 'tab', (msg) => ch.postMessage({ to: m.from, kind: 'msg', msg }), null);
        ch.postMessage({ to: m.from, kind: 'hi' });
      } else if (m.kind === 'msg') this.fromPeer(id, m.msg);
      else if (m.kind === 'bye') this.dropPeer(id);
    };
  }

  addPeer(id, kind, send, close) {
    if (this.started || this.lobby.players.length >= MAX_PLAYERS) {
      send({ t: 'kick', reason: this.started ? 'That war has already started.' : 'The war room is full.' });
      setTimeout(() => close?.(), 300);
      return;
    }
    this.peers.set(id, { kind, send, close });
  }

  dropPeer(id) {
    if (!this.peers.has(id)) return;
    this.peers.delete(id);
    const p = this.lobby.players.find((x) => x.id === id);
    if (!p) return;
    if (this.started) {
      // the deserter's factory is handed to an AI commander, on the same tick for everyone
      this.hostCommand({ c: 'aiTakeover', id });
    } else {
      this.lobby.players = this.lobby.players.filter((x) => x.id !== id);
      this.broadcastLobby();
    }
  }

  send(id, msg) {
    this.peers.get(id)?.send(msg);
  }

  broadcast(msg) {
    for (const p of this.peers.values()) p.send(msg);
  }

  // ------------------------------------------------------------------ lobby

  fromPeer(id, m) {
    if (!m || typeof m !== 'object') return;
    const player = this.lobby.players.find((p) => p.id === id);
    switch (m.t) {
      case 'hello':
        if (player || this.started) return;
        this.lobby.players.push({ id, name: cleanName(m.name), team: this.openTeam() });
        this.broadcastLobby();
        break;
      case 'team':
        if (!player || this.started) return;
        player.team = this.validTeam(m.team);
        this.broadcastLobby();
        break;
      case 'cmd':
        if (player && this.started && m.c && typeof m.c === 'object') this.worker?.postMessage({ type: 'cmd', p: id, c: m.c });
        break;
      case 'hash':
        if (player && Number.isInteger(m.n) && Number.isInteger(m.h)) this.checkHash(m.n, m.h, id);
        break;
      default:
        break;
    }
  }

  validTeam(team) {
    if (this.lobby.mode === MODE_BUGHUNT) return TEAM_GREEN;
    return team === TEAM_TAN ? TEAM_TAN : TEAM_GREEN;
  }

  openTeam() {
    if (this.lobby.mode === MODE_BUGHUNT) return TEAM_GREEN;
    const g = this.lobby.players.filter((p) => p.team === TEAM_GREEN).length;
    const t = this.lobby.players.filter((p) => p.team === TEAM_TAN).length;
    return t < g ? TEAM_TAN : TEAM_GREEN;
  }

  setMode(mode) {
    this.lobby.mode = mode === MODE_BUGHUNT ? MODE_BUGHUNT : MODE_SKIRMISH;
    if (this.lobby.mode === MODE_BUGHUNT) {
      this.lobby.players = this.lobby.players.filter((p) => !p.ai);
      for (const p of this.lobby.players) p.team = TEAM_GREEN;
    }
    this.broadcastLobby();
  }

  setDifficulty(d) {
    this.lobby.difficulty = ['easy', 'normal', 'hard'].includes(d) ? d : 'normal';
    this.broadcastLobby();
  }

  setTeam(id, team) {
    const p = this.lobby.players.find((x) => x.id === id);
    if (p) p.team = this.validTeam(team);
    this.broadcastLobby();
  }

  addAi(team) {
    if (this.lobby.players.length >= MAX_PLAYERS || this.lobby.mode === MODE_BUGHUNT) return;
    const names = ['General Plasticov', 'Marshal Mold', 'Colonel Kickstand', 'Admiral Snap'];
    this.lobby.players.push({ id: `ai${this.nextAi}`, name: names[this.nextAi % names.length], team: this.validTeam(team), ai: this.lobby.difficulty });
    this.nextAi++;
    this.broadcastLobby();
  }

  removePlayer(id) {
    if (id === HOST_ID) return;
    const p = this.lobby.players.find((x) => x.id === id);
    if (!p) return;
    if (!p.ai) {
      this.send(id, { t: 'kick', reason: 'The host removed you from the war room.' });
      this.peers.delete(id);
    }
    this.lobby.players = this.lobby.players.filter((x) => x.id !== id);
    this.broadcastLobby();
  }

  broadcastLobby() {
    for (const [id, p] of this.peers) p.send({ t: 'lobby', lobby: this.lobby, you: id, code: this.code });
    this.onLobby(this.lobby);
  }

  /** Why the war can't start yet, or null. */
  startProblem() {
    const { players, mode } = this.lobby;
    if (mode === MODE_SKIRMISH) {
      if (!players.some((p) => p.team === TEAM_GREEN)) return 'Green needs at least one commander.';
      if (!players.some((p) => p.team === TEAM_TAN)) return 'Tan needs a commander (add an AI).';
    }
    return null;
  }

  start() {
    if (this.started || this.startProblem()) return;
    this.started = true;
    const config = {
      seed: crypto.getRandomValues(new Uint32Array(1))[0] >>> 1,
      mode: this.lobby.mode,
      difficulty: this.lobby.difficulty,
      players: this.lobby.players.map((p) => ({ ...p, ai: p.ai ? this.lobby.difficulty : undefined })),
    };
    this.broadcast({ t: 'start', config });
    this.onStart(config);
    this.worker = new Worker(new URL('./clock.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      const b = e.data;
      const packet = { t: 'b', n: b.n, c: b.c };
      this.broadcast(packet);
      this.onBundle(packet);
    };
    this.worker.postMessage({ type: 'start' });
  }

  // ------------------------------------------------------------------ in game

  /** The host's own commands (same path as everyone else's). */
  sendCommand(c) {
    this.worker?.postMessage({ type: 'cmd', p: HOST_ID, c });
  }

  hostCommand(c) {
    this.worker?.postMessage({ type: 'cmd', p: '__host', c });
  }

  reportHash(n, h) {
    this.checkHash(n, h, HOST_ID);
  }

  /**
   * Compare each peer's state hash with the host's for the same tick. A peer is only declared out
   * of sync after two consecutive mismatches, so one garbled report can't raise a false alarm.
   */
  checkHash(n, h, from) {
    const entry = this.hashes.get(n) || { host: null, peers: new Map() };
    if (from === HOST_ID) entry.host = h;
    else entry.peers.set(from, h);
    this.hashes.set(n, entry);
    if (entry.host !== null) {
      this.strikes ??= new Map();
      for (const [peer, ph] of entry.peers) {
        const strikes = ph === entry.host ? 0 : (this.strikes.get(peer) || 0) + 1;
        this.strikes.set(peer, strikes);
        if (strikes >= 2 && !this.desynced) {
          this.desynced = true;
          this.broadcast({ t: 'desync' });
          this.onDesync();
        }
      }
      entry.peers.clear();
    }
    for (const k of this.hashes.keys()) if (k < n - HASH_INTERVAL * 10) this.hashes.delete(k);
  }

  destroy() {
    this.broadcast({ t: 'kick', reason: 'The host has ended the war.' });
    this.worker?.terminate();
    for (const p of this.peers.values()) p.close?.();
    this.peers.clear();
    this.peer?.destroy();
    this.channel?.close();
  }
}

/** Adapter the Game uses on the host's own screen. */
export class HostGameSession {
  constructor(host) {
    this.host = host;
    this.onBundle = () => {};
    this.onDesync = () => {};
    host.onBundle = (b) => this.onBundle({ t: b.n, c: b.c });
    host.onDesync = () => this.onDesync();
  }

  send(c) {
    this.host.sendCommand(c);
  }

  reportHash(n, h) {
    this.host.reportHash(n, h);
  }

  destroy() {
    this.host.destroy();
  }
}

// ====================================================================== client

/**
 * A joined peer. Emits onLobby(lobby, you), onStart(config), onBundle(b), onDesync(), onClose(reason).
 */
export class ClientSession {
  constructor() {
    this.onLobby = () => {};
    this.onStart = () => {};
    this.onBundle = () => {};
    this.onDesync = () => {};
    this.onClose = () => {};
    this.you = null;
    this.closed = false;
  }

  get playerId() {
    return this.you;
  }

  /** Try a tab in this browser first (instant), then the internet. */
  async join(code, name) {
    code = normalizeCode(code);
    const forceOnline = new URLSearchParams(location.search).get('net') === 'online';
    if (!forceOnline) {
      try {
        await this.joinLocal(code);
      } catch {
        await this.joinOnline(code);
      }
    } else await this.joinOnline(code);
    this.raw({ t: 'hello', name: cleanName(name) });
  }

  joinLocal(code) {
    return new Promise((resolve, reject) => {
      const me = makeRoomCode(8);
      const ch = new BroadcastChannel(`plastic-front-${code}`);
      const timer = setTimeout(() => {
        ch.close();
        reject(new Error('no local host'));
      }, 1200);
      ch.onmessage = (e) => {
        const m = e.data;
        if (!m || m.to !== me) return;
        if (m.kind === 'hi') {
          clearTimeout(timer);
          this.raw = (msg) => ch.postMessage({ to: HOST_ID, from: me, kind: 'msg', msg });
          this.closeImpl = () => {
            ch.postMessage({ to: HOST_ID, from: me, kind: 'bye' });
            ch.close();
          };
          addEventListener('beforeunload', () => this.closeImpl?.());
          resolve();
        } else if (m.kind === 'msg') this.handle(m.msg);
      };
      ch.postMessage({ to: HOST_ID, from: me, kind: 'hello' });
    });
  }

  joinOnline(code) {
    return new Promise((resolve, reject) => {
      const Peer = PeerCtor();
      const peer = new Peer({ debug: 1 });
      let settled = false;
      const fail = (msg) => {
        if (settled) return;
        settled = true;
        peer.destroy();
        reject(new Error(msg));
      };
      const timer = setTimeout(() => fail('Timed out reaching the host.'), 15000);
      peer.on('open', () => {
        const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          clearTimeout(timer);
          settled = true;
          this.raw = (msg) => conn.open && conn.send(msg);
          this.closeImpl = () => peer.destroy();
          resolve();
        });
        conn.on('data', (m) => this.handle(m));
        conn.on('close', () => this.close('The host has left the war.'));
        conn.on('error', (err) => this.close(describePeerError(err)));
      });
      peer.on('error', (err) => {
        clearTimeout(timer);
        if (!settled) fail(describePeerError(err));
        else this.close(describePeerError(err));
      });
    });
  }

  handle(m) {
    if (!m || typeof m !== 'object' || this.closed) return;
    switch (m.t) {
      case 'lobby':
        this.you = m.you;
        this.onLobby(m.lobby, m.you);
        break;
      case 'start':
        this.onStart(m.config);
        break;
      case 'b':
        this.onBundle({ t: m.n, c: Array.isArray(m.c) ? m.c : [] });
        break;
      case 'desync':
        this.onDesync();
        break;
      case 'kick':
        this.close(m.reason || 'Disconnected.');
        break;
      default:
        break;
    }
  }

  setTeam(team) {
    this.raw?.({ t: 'team', team });
  }

  send(c) {
    this.raw?.({ t: 'cmd', c });
  }

  reportHash(n, h) {
    this.raw?.({ t: 'hash', n, h });
  }

  close(reason) {
    if (this.closed) return;
    this.closed = true;
    this.closeImpl?.();
    this.onClose(reason);
  }

  destroy() {
    this.close(null);
  }
}
