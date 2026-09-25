#!/usr/bin/env node
// Designs the Federal Playroom Network announcer with Gemini 3.8 TTS voice design and stores the
// resulting voice id in tools/voice.json (gen-voice.mjs reads it). A preview WAV is written too.
//
//   GEMINI_API_KEY=... node tools/design-voice.mjs [preview.wav]
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL = process.env.TTS_MODEL || 'gemini-3.8-flash-tts';
const DESCRIPTION = process.env.VOICE_PROMPT
  || 'A booming, relentlessly cheerful 1950s wartime newsreel announcer in his forties with a crisp '
  + 'Mid-Atlantic accent, fast punchy delivery and a bright, slightly nasal old-radio timbre.';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Set GEMINI_API_KEY in the environment.');
    process.exit(1);
  }
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/voices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      store: true,
      voice: {
        model: MODEL,
        type: 'prompted',
        display_name: 'FPN Newsreel Announcer',
        gender: 'male',
        language_code: 'en-US',
        prompted: { input: DESCRIPTION },
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.id) {
    console.error(`Voice design failed: ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
    process.exit(2);
  }
  await writeFile(join(ROOT, 'tools', 'voice.json'), `${JSON.stringify({ id: json.id, model: MODEL, prompt: DESCRIPTION }, null, 2)}\n`);
  const preview = process.argv[2];
  if (preview && json.sample_audio?.data) await writeFile(preview, Buffer.from(json.sample_audio.data, 'base64'));
  console.log(`Designed voice ${json.id}${preview ? ` (preview → ${preview})` : ''}`);
}

main();
