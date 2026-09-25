# PLASTIC FRONT — design

*Service guarantees bedtime.*

You don't command the army. You build the machine that makes it. The factory floor is cheerful, bright and
clean. The Front is not. Green and Tan plastic soldiers roll off your conveyor belts, hop out of the gates and
break into pieces in the sandbox. The Federal Playroom Network tells you this is going wonderfully.

## Pillars

1. **The factory is the strategy.** Players never micro units. What you produce, in which mix, and which lane
   your belts feed decides the war. The only direct army controls are per-lane orders: ADVANCE or HOLD.
2. **Supply lines matter.** Units, turrets and artillery emplacements are only as good as the belts feeding them.
   Breached gates let the enemy into your factory, where they wreck the machine.
3. **Toy story on top, meat grinder underneath.** Colourful, bright and warm everywhere except the battlefield,
   which slowly fills with shards, melted puddles and scorch marks that never go away.
4. **Propaganda satire.** An upbeat newsreel voice celebrates casualties, recycling of the fallen, and quotas.
   The humour stays implicit: nobody winks at the player.

## Modes

| Mode | Teams | Win |
|---|---|---|
| **Skirmish** | Green vs Tan, 1–2 per side, any seat can be AI | destroy the enemy HQ |
| **Bug Hunt** (co-op) | 1–4 players on Green vs the Swarm | destroy all three burrows and the Hive |

Teammates share one factory floor, one purse and one research tree.

## Map (tiles)

```
x: 0 ............ 35 | 36 ............................ 99 | 100 .......... 135
   GREEN FACTORY     |      THE SANDBOX (3 lanes)          |   TAN FACTORY
   HQ at back        |  lane 0: y 1–12                     |   (mirrored)
   gates at x 34–35  |  lane 1: y 16–27                    |
                     |  lane 2: y 31–42                    |
```

Lanes are separated by walls of alphabet blocks and books. Each lane ends in a **gate** (2×2 bunker) at the edge
of each factory. Gates both deploy units and block the lane. When a gate falls, enemies pour into the factory,
attack buildings in reach, and head for the HQ. A fallen gate can be rebuilt once no enemy is nearby.

## Economy

- **Requisition (R)** builds things. Sources: starting 400 R, the Federal Allowance (+4 R/s), bounties for enemy
  kills, and War Bonds (any item belted into the HQ is sold).
- **Glory (★)** buys research. It comes from enemy kills and, per the Federation, from your own heroic losses.
- **Scrap**: every fallen soldier's plastic goes to the team's reclamation pool. A Reclaimer turns it back into
  pellets. ("Today's fallen are tomorrow's heroes.")

Raw deposits are infinite: **Pellets**, **Tin** and **Bang Powder**.

## Buildings

| Building | Size | What it does |
|---|---|---|
| Scoop | 2×2 | mines the deposit tiles under it and outputs forward |
| Conveyor | 1×1 | moves items; side-loading merges |
| Junction | 1×1 | lets two belts cross |
| Splitter | 1×1 | round-robin to front/left/right |
| Sorter | 1×1 | filtered item goes forward, others to the sides |
| Molding Press | 2×2 | pellets → figures |
| Tinworks | 2×2 | tin → plates or springs |
| Powder Mill | 2×2 | powder → caps or firecrackers |
| Assembly Bench | 3×3 | parts → unit crates (recipe per bench) |
| Pop-Gun Nest | 1×1 | turret, eats caps |
| Mortar Pit | 2×2 | long-range turret, eats firecrackers |
| Flak Nest | 2×2 | anti-air, eats caps |
| Reclaimer | 2×2 | scrap pool → pellets |
| Gate | 2×2 | fixed; unit crates in, soldiers out |
| HQ | 4×6 | fixed; sells items for R |

Machines take input from belts on any side and output from their front edge.

## Units

Riflemen, Machine Gunners, Grenadiers, Medics ("glue corps"), Flamers, Mortar Teams, Wind-up Tanks, Tin Biplanes,
and the Colossus. Bugs: Ants, Beetles, Spiders, Bombardiers, Wasps, the Queen.

## Netcode

Deterministic lockstep with a host relay. Every peer runs the same simulation. Clients send commands to the host.
The host's clock (a Web Worker, so it survives background tabs) seals the commands received during each tick into
one bundle and broadcasts it. The host's own commands are held back 3 ticks so the host has no latency edge. Peers step only when they hold the bundle for the next tick. AI commanders and
bug waves live inside the simulation, so they cost no bandwidth.

Determinism rules for `src/sim/**`: no `Math.random`, no wall-clock, only `+ − × ÷` and `Math.sqrt` on floats
(no trig, `pow` or `hypot`), stable iteration orders (arrays by id), and a seeded RNG. Peers compare a state hash
every 2 seconds.
