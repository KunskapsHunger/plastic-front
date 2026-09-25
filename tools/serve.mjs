#!/usr/bin/env node
// Zero-dependency static dev server (no bundler needed: the game is native ES modules).
//   node tools/serve.mjs          → serves the project (dev)
//   node tools/serve.mjs dist     → serves a production build
//   node tools/serve.mjs --allow-save --port=5174
//                                 → also accepts POST /__save?name=x.webm from localhost only
//                                   (used by promo/ to write recorded trailers into promo/out/)
import { createServer } from 'node:http';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const ALLOW_SAVE = args.includes('--allow-save');
const portArg = args.find((a) => a.startsWith('--port='));
const BASE = target ? resolve(ROOT, target) : ROOT;
const PORT = Number(portArg?.slice(7)) || Number(process.env.PORT) || 5196;
const SAVE_DIR = join(ROOT, 'promo', 'out');
// optional one-level subfolder (no dots in it, so no traversal), e.g. trailer/f_00001.jpg
const SAVE_NAME = /^([\w-]{1,40}\/)?[\w-][\w.-]{0,63}\.(webm|mp4|png|jpg|json|h264)$/;
const SAVE_LIMIT = 800 * 1024 * 1024;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

async function handleSave(req, res, url) {
  const name = url.searchParams.get('name') || '';
  if (!LOOPBACK.has(req.socket.remoteAddress) || !SAVE_NAME.test(name)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  const file = join(SAVE_DIR, name);
  await mkdir(dirname(file), { recursive: true });
  let size = 0;
  const out = createWriteStream(file);
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > SAVE_LIMIT) {
      req.destroy();
      out.destroy();
    }
  });
  req.pipe(out);
  out.on('finish', () => {
    console.log(`[serve] saved ${file} (${(size / 1048576).toFixed(1)} MB)`);
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('saved');
  });
  out.on('error', (err) => {
    console.error('[serve] save failed', err);
    if (!res.headersSent) res.writeHead(500).end('Save failed');
  });
}

// dev-only mounts so the source tree works without a build step
const MOUNTS = target ? [] : [
  ['/vendor/peerjs.min.js', join(ROOT, 'node_modules', 'peerjs', 'dist', 'peerjs.min.js')],
  ['/voice/', join(ROOT, 'public', 'voice')],
];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wav': 'audio/wav', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.map': 'application/json', '.md': 'text/markdown; charset=utf-8',
};

function resolvePath(urlPath) {
  for (const [prefix, dest] of MOUNTS) {
    if (urlPath === prefix) return dest;
    if (prefix.endsWith('/') && urlPath.startsWith(prefix)) return join(dest, urlPath.slice(prefix.length));
  }
  return join(BASE, urlPath);
}

function inside(file) {
  const allowed = [BASE, ...MOUNTS.map(([, d]) => d)];
  return allowed.some((root) => file === root || file.startsWith(root.endsWith(sep) ? root : root + sep));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (ALLOW_SAVE && req.method === 'POST' && url.pathname === '/__save') {
      await handleSave(req, res, url);
      return;
    }
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(resolvePath(path));
    if (!inside(file) || file.includes(`${sep}node_modules${sep}`) && !file.endsWith('peerjs.min.js')) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(await readFile(file));
  } catch (err) {
    console.error('[serve]', err);
    res.writeHead(500).end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`Plastic Front ${target ? `(${target})` : '(dev)'} → http://localhost:${PORT}`);
});
