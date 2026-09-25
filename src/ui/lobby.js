// The war room: host a match or join one, pick sides, add AI generals, start the war.
import { MODE_BUGHUNT, MODE_SKIRMISH, TEAM_GREEN, TEAM_TAN } from '../shared/constants.js';
import { ClientSession, HOST_ID, HostGameSession, HostSession } from '../net/session.js';
import { clear, el } from './dom.js';

const SIDES = [
  { team: TEAM_GREEN, name: 'GREEN ARMY', cls: 'green' },
  { team: TEAM_TAN, name: 'TAN ARMY', cls: 'tan' },
];

export function showLobby({ host, code, name, audio, onStart, onBack, onError }) {
  const root = document.getElementById('screens');
  const card = el('div', { class: 'title-card' });
  root.replaceChildren(el('div', { class: 'lobby' }, card));
  let session;
  let you = HOST_ID;
  let lobby = null;
  let status = host ? 'Opening the war room…' : 'Reaching the host…';
  let started = false;

  const leave = () => {
    session?.destroy();
    onBack();
  };

  const seatRow = (p, bug) => {
    const label = `${p.ai ? '🤖 ' : ''}${p.name}${p.id === HOST_ID ? ' ★' : ''}${p.id === you ? ' (you)' : ''}`;
    const seat = el('div', { class: `seat${p.id === you ? ' me' : ''}` }, [el('span', { text: label })]);
    if (host && !bug) {
      seat.append(el('button', {
        title: 'Switch side', text: '⇄',
        onclick: () => session.setTeam(p.id, p.team === TEAM_GREEN ? TEAM_TAN : TEAM_GREEN),
      }));
    }
    if (host && p.id !== HOST_ID) seat.append(el('button', { title: 'Remove', text: '✕', onclick: () => session.removePlayer(p.id) }));
    return seat;
  };

  const options = (bug) => {
    const opts = el('div', { class: 'opts' });
    if (host) {
      const mode = el('select', { onchange: () => session.setMode(mode.value) }, [
        el('option', { value: MODE_SKIRMISH, text: 'Skirmish (Green vs Tan)', selected: !bug }),
        el('option', { value: MODE_BUGHUNT, text: 'Bug Hunt (everyone vs the Swarm)', selected: bug }),
      ]);
      const diff = el('select', { onchange: () => session.setDifficulty(diff.value) },
        ['easy', 'normal', 'hard'].map((d) => el('option', { value: d, text: d, selected: lobby.difficulty === d })));
      opts.append(
        el('div', {}, [el('label', { text: 'MODE' }), mode]),
        el('div', {}, [el('label', { text: bug ? 'SWARM FEROCITY' : 'AI SKILL' }), diff]),
      );
    } else {
      opts.append(
        el('div', {}, [el('label', { text: 'MODE' }), el('div', { text: bug ? 'Bug Hunt' : 'Skirmish' })]),
        el('div', {}, [el('label', { text: 'DIFFICULTY' }), el('div', { text: lobby.difficulty })]),
      );
    }
    return opts;
  };

  const seats = (bug) => {
    const wrap = el('div', { class: 'seats' });
    const sides = bug ? [SIDES[0], { team: -1, name: 'THE SWARM', cls: 'swarm' }] : SIDES;
    for (const side of sides) {
      const head = el('h4', {}, [side.name]);
      if (side.team >= 0 && host && !bug && lobby.players.length < 4) {
        head.append(el('button', { class: 'chip navy', text: '+ AI', onclick: () => session.addAi(side.team) }));
      }
      const me = lobby.players.find((p) => p.id === you);
      if (side.team >= 0 && !host && !bug && me && me.team !== side.team) {
        head.append(el('button', { class: 'chip navy', text: 'JOIN', onclick: () => session.setTeam(side.team) }));
      }
      const box = el('div', { class: `side ${side.cls}` }, head);
      if (side.team < 0) box.append(el('p', { text: 'Ants, spiders, beetles, wasps and, eventually, the Queen. They want your plastic.' }));
      for (const p of lobby.players.filter((x) => x.team === side.team)) box.append(seatRow(p, bug));
      wrap.append(box);
    }
    return wrap;
  };

  const render = () => {
    clear(card);
    const roomCode = host ? session.code : code;
    const link = `${location.origin}${location.pathname}?join=${roomCode}`;
    const linkInput = el('input', { value: link, readonly: true });
    card.append(
      el('div', { class: 'kicker', text: host ? 'YOU ARE HOSTING' : 'YOU ARE ENLISTED' }),
      el('h1', { text: 'WAR ROOM', style: { fontSize: '56px' } }),
      el('div', { class: 'code', text: roomCode }),
      el('div', { class: 'invite' }, [
        linkInput,
        el('button', {
          class: 'chip navy',
          text: 'COPY',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(link);
            } catch {
              linkInput.select();
            }
            audio.play('click');
          },
        }),
      ]),
      el('div', { class: 'fine', text: status }),
    );
    if (!lobby) {
      card.append(el('div', { class: 'menu-buttons' }, el('button', { class: 'chip ghost', text: 'Back', onclick: leave })));
      return;
    }
    const bug = lobby.mode === MODE_BUGHUNT;
    card.append(options(bug), seats(bug));
    const problem = host ? session.startProblem() : null;
    const buttons = el('div', { class: 'menu-buttons' });
    if (host) {
      buttons.append(el('button', {
        class: 'chip',
        text: 'START THE WAR',
        disabled: !!problem,
        onclick: () => {
          audio.unlock();
          session.start();
        },
      }));
      if (problem) buttons.append(el('div', { class: 'err', text: problem }));
    } else {
      buttons.append(el('div', { class: 'fine', text: 'Waiting for the host to start the war…' }));
    }
    buttons.append(el('button', { class: 'chip ghost', text: 'Leave', onclick: leave }));
    card.append(buttons);
  };

  if (host) {
    session = new HostSession(name);
    lobby = session.lobby;
    session.onLobby = (l) => {
      lobby = l;
      if (!started) render();
    };
    session.onStart = (config) => {
      started = true;
      onStart({ config, session: new HostGameSession(session), playerId: HOST_ID, solo: false });
    };
    session.onStatus = (s) => {
      status = s;
    };
    render();
    session.openOnline().then(() => {
      status = 'Online. Friends join with the code or the link; tabs in this browser can join too.';
      if (!started) render();
    }).catch((err) => {
      status = `Internet play unavailable (${err.message}). Tabs in this browser can still join.`;
      if (!started) render();
    });
    return;
  }

  session = new ClientSession();
  session.onLobby = (l, me) => {
    lobby = l;
    you = me;
    status = 'Connected. Pick a side.';
    if (!started) render();
  };
  session.onStart = (config) => {
    started = true;
    onStart({ config, session, playerId: you, solo: false });
  };
  session.onClose = (reason) => {
    if (!reason) return;
    if (started) {
      const bar = document.getElementById('desync');
      bar.textContent = `Connection lost: ${reason}`;
      bar.hidden = false;
    } else {
      onBack();
      onError(reason);
    }
  };
  render();
  session.join(code, name).catch((err) => {
    onBack();
    onError(err.message);
  });
}
