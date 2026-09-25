#!/usr/bin/env node
// Produces a static, host-anywhere build in dist/ (GitHub Pages, Netlify, Vercel, itch.io…).
// No bundling required: the game ships as native ES modules.
import { cp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');

await rm(DIST, { recursive: true, force: true });
await mkdir(join(DIST, 'vendor'), { recursive: true });
await cp(join(ROOT, 'index.html'), join(DIST, 'index.html'));
await cp(join(ROOT, 'src'), join(DIST, 'src'), { recursive: true });
await cp(join(ROOT, 'public'), DIST, { recursive: true });
await cp(join(ROOT, 'node_modules', 'peerjs', 'dist', 'peerjs.min.js'), join(DIST, 'vendor', 'peerjs.min.js'));
console.log(`Built → ${DIST}`);
