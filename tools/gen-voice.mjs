#!/usr/bin/env node
// Pre-renders the Federal Playroom Network announcer to public/voice/*.wav with Gemini TTS, and writes
// public/voice/manifest.json so the game knows which lines exist. The key comes from the environment
// and is never shipped with the game.
//
//   GEMINI_API_KEY=... node tools/gen-voice.mjs            (only missing lines)
//   GEMINI_API_KEY=... node tools/gen-voice.mjs --force    (regenerate all)
//   GEMINI_API_KEY=... node tools/gen-voice.mjs start wave (specific lines)

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESIGNED = JSON.parse(await readFile(join(ROOT_DIR, 'tools', 'voice.json'), 'utf8').catch(() => '{}'));
// The designed announcer (tools/design-voice.mjs) unless TTS_VOICE names another (e.g. 'Puck').
const MODEL = process.env.TTS_MODEL || DESIGNED.model || 'gemini-3.8-flash-tts';
const VOICE = process.env.TTS_VOICE || DESIGNED.id || 'Puck';
const SAMPLE_RATE = 24000;
const MIN_SPACING_MS = 7000; // quota is 10 requests / minute / model (and ~100 / day)
const MAX_RETRIES = 6;

// Text is spoken verbatim; delivery goes in speech_metadata.style (never spoken), per line.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.env.VOICE_OUT ? join(ROOT, process.env.VOICE_OUT) : join(ROOT, 'public', 'voice');
// VOICE_LINES_MODULE (relative to the repo root) swaps in another script, e.g. promo/voicelines.js.
const LINES_MODULE = process.env.VOICE_LINES_MODULE
  ? new URL(`../${process.env.VOICE_LINES_MODULE}`, import.meta.url).href : '../src/shared/voicelines.js';
const { VOICE_LINES, styleFor } = await import(LINES_MODULE);

class QuotaError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pcmToWav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function parseRate(mime) {
  const m = /rate=(\d+)/.exec(mime || '');
  return m ? Number(m[1]) : SAMPLE_RATE;
}

/** The first base64 audio payload anywhere in the response (the interactions API nests it in steps). */
function findAudio(node) {
  if (!node || typeof node !== 'object') return null;
  const mime = node.mime_type || node.mimeType || '';
  if (typeof node.data === 'string' && (/audio/.test(mime) || node.type === 'audio')) return { data: node.data, mime };
  for (const v of Object.values(node)) {
    const hit = findAudio(v);
    if (hit) return hit;
  }
  return null;
}

async function synth(apiKey, text, style) {
  const body = {
    model: MODEL,
    input: [{
      type: 'user_input',
      content: [{ type: 'text', text, annotations: style ? [{ type: 'speech_metadata', style }] : [] }],
    }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: VOICE }] },
  };
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      const found = findAudio(json);
      if (!found) throw new Error(`No audio in response: ${JSON.stringify(json).slice(0, 300)}`);
      const audio = Buffer.from(found.data, 'base64');
      const isWav = audio.subarray(0, 4).toString() === 'RIFF';
      return isWav ? audio : pcmToWav(audio, parseRate(found.mime));
    }
    const message = json?.error?.message || '';
    if (/per_day/.test(message)) throw new QuotaError(`Daily quota exhausted for ${MODEL}.`);
    const retryable = res.status === 429 || res.status >= 500;
    const delay = /retry in ([\d.]+)s/i.exec(message);
    const waitMs = delay ? Math.ceil(Number(delay[1]) * 1000) + 1000 : 15000 * attempt;
    console.warn(`  ${res.status} ${json?.error?.status || ''} (attempt ${attempt}/${MAX_RETRIES})`);
    if (!retryable || attempt === MAX_RETRIES) {
      throw new Error(`TTS failed: ${res.status} ${message.slice(0, 200)}`);
    }
    await sleep(waitMs);
  }
  throw new Error('unreachable');
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Set GEMINI_API_KEY in the environment.');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const only = args.filter((a) => !a.startsWith('--'));
  const unknown = only.filter((n) => !VOICE_LINES[n]);
  if (unknown.length) {
    console.error(`Unknown line(s): ${unknown.join(', ')}`);
    process.exit(1);
  }
  await mkdir(OUT_DIR, { recursive: true });

  const names = only.length ? only : Object.keys(VOICE_LINES);
  let last = 0;
  let failed = 0;
  for (const name of names) {
    const file = join(OUT_DIR, `${name}.wav`);
    if (!force && !only.length && (await exists(file))) continue;
    const wait = last + MIN_SPACING_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    process.stdout.write(`- ${name}: "${VOICE_LINES[name]}" ... `);
    try {
      const wav = await synth(apiKey, VOICE_LINES[name], styleFor(name));
      await writeFile(file, wav);
      console.log(`ok (${(wav.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      failed++;
      console.log(`FAILED: ${err.message}`);
      if (err instanceof QuotaError) break;
    }
  }
  const have = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.wav')).map((f) => f.slice(0, -4));
  await writeFile(join(OUT_DIR, 'manifest.json'), JSON.stringify(have.filter((n) => VOICE_LINES[n]).sort()));
  console.log(failed ? `Done with ${failed} failure(s).` : 'Done.');
  process.exit(failed ? 2 : 0);
}

main();
