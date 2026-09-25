// Tiny DOM helpers. Text is always set via textContent, never innerHTML, so names from peers are inert.

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

export function clear(n) {
  while (n.firstChild) n.removeChild(n.firstChild);
  return n;
}

export const fmt = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(Math.floor(n)));
