// The recruitment poster: name, mode, difficulty, and the doors to solo play, hosting and joining.
import { MODE_BUGHUNT, MODE_SKIRMISH, TEAM_GREEN, TEAM_TAN } from '../shared/constants.js';
import { el } from './dom.js';
import { showLobby } from './lobby.js';

const NAME_KEY = 'plastic-front:name';

function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

function saveName(n) {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* private mode: fine */
  }
}

/** A saluting green army man for the poster, drawn as inline SVG. */
function posterArt() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 300 420');
  svg.setAttribute('class', 'poster-art');
  const add = (tag, attrs) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    svg.append(n);
    return n;
  };
  add('circle', { cx: 150, cy: 170, r: 140, fill: '#c8352b', stroke: '#2a2420', 'stroke-width': 8 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    add('path', {
      d: `M150 170 L${150 + Math.cos(a) * 140} ${170 + Math.sin(a) * 140} L${150 + Math.cos(a + 0.2) * 140} ${170 + Math.sin(a + 0.2) * 140}Z`,
      fill: '#e0463a',
    });
  }
  const g = '#5e9c3c';
  const d = '#3b6b22';
  const o = '#27491a';
  add('ellipse', { cx: 150, cy: 385, rx: 80, ry: 20, fill: d, stroke: o, 'stroke-width': 5 });
  add('path', { d: 'M120 380 L128 270 L150 270 L146 380Z', fill: g, stroke: o, 'stroke-width': 5 });
  add('path', { d: 'M180 380 L172 270 L150 270 L156 380Z', fill: d, stroke: o, 'stroke-width': 5 });
  add('path', { d: 'M112 280 L118 160 L184 160 L190 280Z', fill: g, stroke: o, 'stroke-width': 5 });
  add('rect', { x: 112, y: 262, width: 78, height: 12, fill: d });
  add('path', { d: 'M184 170 L230 120 L242 132 L196 190Z', fill: g, stroke: o, 'stroke-width': 5 });
  add('path', { d: 'M118 175 L92 255 L108 262 L130 190Z', fill: g, stroke: o, 'stroke-width': 5 });
  add('path', { d: 'M88 250 L60 110 L70 106 L100 250Z', fill: d, stroke: o, 'stroke-width': 4 });
  add('circle', { cx: 152, cy: 128, r: 30, fill: g, stroke: o, 'stroke-width': 5 });
  add('path', { d: 'M112 124 Q152 60 192 124 L200 130 L104 130Z', fill: '#8cc463', stroke: o, 'stroke-width': 5 });
  add('path', { d: 'M232 118 L246 104', stroke: o, 'stroke-width': 8, 'stroke-linecap': 'round' });
  add('rect', { x: 20, y: 300, width: 260, height: 60, rx: 10, fill: '#f3e6c8', stroke: '#2a2420', 'stroke-width': 6, transform: 'rotate(-6 150 330)' });
  const t = add('text', {
    x: 150, y: 342, 'text-anchor': 'middle', 'font-family': 'Bangers, Impact, sans-serif', 'font-size': 38,
    fill: '#c8352b', transform: 'rotate(-6 150 330)', 'letter-spacing': 2,
  });
  t.textContent = 'I MOLDED. DID YOU?';
  return svg;
}

export function showTitle({ audio, slogan, onSolo, onStartNet, invite, error = '' }) {
  const back = (message = '') => showTitle({ audio, slogan, onSolo, onStartNet, error: message });
  const root = document.getElementById('screens');
  const name = el('input', { maxlength: 18, placeholder: 'Commander', value: loadName() });
  const difficulty = el('select', {}, [
    el('option', { value: 'easy', text: 'Recruit (easy)' }),
    el('option', { value: 'normal', text: 'Veteran (normal)', selected: true }),
    el('option', { value: 'hard', text: 'Warlord (hard)' }),
  ]);
  const side = el('select', {}, [
    el('option', { value: String(TEAM_GREEN), text: 'Green Army' }),
    el('option', { value: String(TEAM_TAN), text: 'Tan Army' }),
  ]);
  const code = el('input', { maxlength: 8, placeholder: 'CODE', value: invite || '', style: { textTransform: 'uppercase', letterSpacing: '4px' } });
  const err = el('div', { class: 'err', text: error });
  const commander = () => {
    const n = name.value.trim().slice(0, 18) || 'Commander';
    saveName(n);
    audio.unlock();
    return n;
  };
  const card = el('div', { class: 'title-card' }, [
    el('div', { class: 'kicker', text: 'THE TOYBOX FEDERATION PRESENTS' }),
    el('h1', { text: 'PLASTIC FRONT' }),
    el('div', { class: 'slogan', text: slogan }),
    el('p', { text: 'You do not command the army. You build the machine that makes it. Pellets go in. Heroes come out. The sandbox takes care of the rest.' }),
    el('label', { text: 'YOUR NAME, COMMANDER' }), name,
    el('div', { class: 'row' }, [
      el('div', {}, [el('label', { text: 'ENEMY COMMAND' }), difficulty]),
      el('div', {}, [el('label', { text: 'ENLIST WITH' }), side]),
    ]),
    el('div', { class: 'grid' }, [
      el('button', {
        class: 'chip',
        onclick: () => onSolo({ name: commander(), mode: MODE_SKIRMISH, difficulty: difficulty.value, team: Number(side.value) }),
      }, ['SKIRMISH', el('small', { text: 'you vs the AI commander' })]),
      el('button', {
        class: 'chip navy',
        onclick: () => onSolo({ name: commander(), mode: MODE_BUGHUNT, difficulty: difficulty.value, team: TEAM_GREEN }),
      }, ['BUG HUNT', el('small', { text: 'survive the Backyard, burn the Hive' })]),
      el('button', {
        class: 'chip navy',
        onclick: () => showLobby({ host: true, name: commander(), audio, onStart: onStartNet, onBack: () => back(), onError: back }),
      }, ['HOST A WAR', el('small', { text: 'versus or co-op with friends' })]),
      el('div', { style: { display: 'flex', gap: '6px' } }, [
        code,
        el('button', {
          class: 'chip',
          onclick: () => {
            const c = code.value.trim().toUpperCase();
            if (!c) {
              err.textContent = 'Enter the code your host gave you.';
              return;
            }
            showLobby({ host: false, code: c, name: commander(), audio, onStart: onStartNet, onBack: () => back(), onError: back });
          },
        }, 'JOIN'),
      ]),
    ]),
    err,
    el('div', { class: 'fine', text: 'Peer-to-peer: the host\'s browser keeps the clock; everyone simulates the same war. Two tabs in one browser can join each other for testing.' }),
  ]);
  root.replaceChildren(el('div', { class: 'title-screen' }, [posterArt(), card]));
  if (invite) code.focus();
  else name.focus();
}
