# PLASTIC FRONT

*Service guarantees bedtime.*

**Plastic Front** is a peer-to-peer factory war for 1–4 players. You don't command the army. You build the machine
that makes it. Scoop plastic pellets, tin and bang powder off the playroom floor, belt them through molding presses,
tinworks and powder mills, and assemble soldiers, wind-up tanks and tin biplanes. Belt the crates into your gates and
the soldiers hop out into the sandbox on their own.

The factory is bright, cheerful plastic. The sandbox is where the soldiers go to break. Every shard, melted puddle
and snapped-off leg stays on the battlefield for the rest of the war. The Federal Playroom Network narrates all of
it and is delighted.

## Play

```bash
npm install
npm run dev          # → http://localhost:5196
```

- **Skirmish** is you against an AI general, at Recruit, Veteran or Warlord difficulty.
- **Bug Hunt** is co-op against the Swarm. Survive the waves coming out of the Backyard, collapse the three burrows,
  then burn the Hive (and the Queen).
- **Host a War** gives you a 5-letter code and an invite link. There can be up to 4 commanders, in any mix of Green,
  Tan and AI seats. Teammates share one factory floor, one purse and one research tree.
- **Join** takes a code. Other tabs in the same browser connect instantly; everyone else connects over WebRTC.
  Add `?net=online` to force WebRTC when testing on one machine.

| Input | Action |
|---|---|
| WASD / arrows / middle-drag / Space+drag | move the camera |
| mouse wheel | zoom |
| 1–9, Z X C V | pick a building (see the build bar) |
| left click / drag | place (drag to lay a conveyor line) |
| R / Shift+R | rotate |
| right click / right-drag | cancel the tool, or scrap buildings (75% refund) |
| Q | copy the building under the cursor |
| T | Citizenship Programs (research) |
| F1–F3 | toggle a lane between ADVANCE and HOLD |
| H / G | look at home / at the front |
| P | ping the map for your team |
| M, Esc | mute, menu |

## How the war works

| | |
|---|---|
| **Raw materials** | Scoops dig whatever deposit they sit on: **Pellets** (pastel beads), **Tin** (bottle caps and cans) and **Bang Powder**. Deposits never run out. |
| **Parts** | The Molding Press turns pellets into figures. The Tinworks makes plates or springs. The Powder Mill makes caps or firecrackers. |
| **Soldiers** | The Assembly Bench combines parts into unit crates: Riflemen, Machine Gunners, Grenadiers, Glue Medics, Flamers, Mortar Teams, Wind-up Tanks, Tin Biplanes and the COLOSSUS. |
| **Supply lines** | Machines take items from belts pointing into them and push output out of their front edge. Junctions cross belts, splitters deal items out, and sorters filter them. Turrets fire only while you belt ammo into them. |
| **The Front** | Each lane ends at a gate. Crates belted into a gate become soldiers who march their lane and fight whatever is nearest. Your only orders are per lane: **ADVANCE** or **HOLD**. |
| **Breaches** | A fallen gate lets the enemy into the factory, where they wreck machines on their way to the Command Toybox. Destroy the enemy's Toybox to win. |
| **Economy** | Requisition builds things. It comes from the Federal Allowance, from kill bounties, and from War Bonds (belt spare items into your HQ). Glory buys research: it comes from kills and, as the Federation puts it, from heroic sacrifice. Your fallen become Scrap, and a Reclaimer turns scrap back into pellets. |

## Architecture

```
index.html ── src/main.js ── ui/menu.js, ui/lobby.js ── client/game.js
                                                          ├─ client/renderer.js  terrain, belts, buildings, units, fx
                                                          ├─ client/input.js     tools → commands
                                                          ├─ ui/hud.js, panels.js, minimap.js
                                                          └─ audio/audio.js      procedural SFX + march, announcer
src/sim/   world.js (Sim)  transport.js  production.js  army.js  combat.js  commands.js
           ai.js + router.js (AI generals: siting + A* belt routing)   swarm.js (Bug Hunt waves)
src/net/   session.js (PeerJS / BroadcastChannel star)   clock.worker.js (host clock)   local.js (solo)
src/shared/ constants, map, items, buildings, units, tech, propaganda, voicelines, rng
```

- **Deterministic lockstep.** Every peer runs the same simulation. Commands go to the host, whose clock runs in a
  Web Worker (so it keeps going when the tab is in the background). Each tick the clock seals the commands it has
  received into one bundle and broadcasts it, and every peer executes the bundles in order. AI generals and bug
  waves run inside the simulation, so they cost no bandwidth. Peers exchange a state hash every 2 seconds, and a
  mismatch shows a warning.
- **Determinism rules** (`src/sim`, `src/shared`): a seeded RNG, no clocks, and only `+ − × ÷` and `Math.sqrt` on
  floats. Iteration is over arrays in id order.
- **Solo play** uses the same bundle path as multiplayer, through a local clock that can also pause and fast-forward.
- If a player disconnects mid-war, the host issues an `aiTakeover` command and an AI general runs their factory
  from that tick on every screen.

There is no bundler. The game is native ES modules plus a vendored `peerjs.min.js`, and there are no native npm
dependencies.

## The announcer

The FPN announcer is a custom voice designed with Gemini 3.8 TTS voice design. The prompt was *"a booming,
relentlessly cheerful 1950s wartime newsreel announcer…"*, and each line gets its own delivery style (breezy,
urgent-but-cheerful, deadpan PSA, solemn defeat). The lines are pre-rendered to `public/voice/`. In game they play
through a band-limited "old radio" filter and duck the music. A line without a clip only appears on the ticker.

```bash
GEMINI_API_KEY=... node tools/design-voice.mjs preview.wav   # design a new announcer → tools/voice.json
GEMINI_API_KEY=... node tools/gen-voice.mjs                  # render missing lines (--force: all)
```

## Promo films

`promo/` stages scripted scenes on live simulations and records them. The YouTube recruitment film and the two
9:16 shorts share the same pipeline: the video renders frame by frame (WebCodecs H.264), then the logged sound
cues are replayed through the real audio engine.

```bash
node tools/serve.mjs --allow-save --port=5198   # then open /promo/?format=trailer|whimsy|explainer
# click ① Render video, then ② Render audio, then:
bash promo/mux.sh plastic-front-trailer-16x9
```

## Development

```bash
npm test                         # simulation, AI and determinism tests (node --test)
node tools/tune.mjs 4 40 normal hard   # headless AI-vs-AI wars for balancing
npm run build                    # static build in dist/ (GitHub Pages, itch.io, …)
```

For development, `?quick=skirmish` or `?quick=bughunt` skips the title screen, `&ai=easy|normal|hard` sets the
opponent, and `&auto=normal` hands your own factory to an AI so you can watch.
