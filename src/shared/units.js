// Unit stats. Distances in tiles, times in seconds, speeds in tiles/second.
// attack.kind: 'hitscan' (instant), 'lob' (projectile with flight time, splash), 'cone' (flamer),
// 'melee', 'bomb' (aircraft over a structure), 'heal'.
// `bounty` is the R the killer's team earns; `glory` is the ★ it earns (the loser earns half, heroically).

export const UNITS = {
  rifle: {
    name: 'Rifleman', hp: 60, speed: 1.3, radius: 0.3, bounty: 6, glory: 1,
    attack: { kind: 'hitscan', range: 5, damage: 9, cooldown: 1.1, dtype: 'bullet' },
  },
  mg: {
    name: 'Machine Gunner', hp: 70, speed: 0.9, radius: 0.32, bounty: 12, glory: 2,
    attack: { kind: 'hitscan', range: 6, damage: 4, cooldown: 0.22, dtype: 'bullet' },
  },
  grenadier: {
    name: 'Grenadier', hp: 55, speed: 1.2, radius: 0.3, bounty: 12, glory: 2,
    attack: { kind: 'lob', range: 5.5, damage: 30, splash: 1.3, cooldown: 2.6, flight: 0.6, dtype: 'blast' },
  },
  medic: {
    name: 'Glue Medic', hp: 50, speed: 1.3, radius: 0.3, bounty: 10, glory: 2,
    attack: { kind: 'heal', range: 3, damage: 8, cooldown: 0.5, dtype: 'heal' },
  },
  flamer: {
    name: 'Flamer', hp: 85, speed: 1.15, radius: 0.32, bounty: 14, glory: 3,
    attack: { kind: 'cone', range: 2.6, damage: 5, cooldown: 0.2, dtype: 'fire', burn: 2 },
  },
  mortar: {
    name: 'Mortar Team', hp: 45, speed: 0.9, radius: 0.36, bounty: 16, glory: 3,
    attack: { kind: 'lob', range: 11, minRange: 3, damage: 45, splash: 1.6, cooldown: 4.5, flight: 1.4, dtype: 'blast' },
  },
  tank: {
    name: 'Wind-up Tank', hp: 650, speed: 0.75, radius: 0.7, bounty: 50, glory: 8, armor: 0.7, vehicle: true,
    attack: { kind: 'lob', range: 7, damage: 70, splash: 1.0, cooldown: 3.2, flight: 0.35, dtype: 'blast' },
  },
  plane: {
    name: 'Tin Biplane', hp: 140, speed: 2.2, radius: 0.6, bounty: 40, glory: 6, air: true, vehicle: true,
    attack: { kind: 'bomb', range: 1.2, damage: 90, splash: 1.4, cooldown: 2.5, dtype: 'blast' },
  },
  colossus: {
    name: 'COLOSSUS', hp: 3500, speed: 0.45, radius: 1.3, bounty: 200, glory: 30, armor: 0.5, vehicle: true,
    attack: { kind: 'lob', range: 3.8, damage: 120, splash: 1.8, cooldown: 2.6, flight: 0.25, dtype: 'blast' },
  },

  // --- the Swarm
  ant: {
    name: 'Ant', hp: 38, speed: 1.7, radius: 0.34, bounty: 3, glory: 0.5, bug: true,
    attack: { kind: 'melee', range: 0.45, damage: 7, cooldown: 0.7, dtype: 'melee' },
  },
  spider: {
    name: 'Spider', hp: 110, speed: 2.0, radius: 0.5, bounty: 8, glory: 1.5, bug: true,
    attack: { kind: 'melee', range: 0.5, damage: 16, cooldown: 0.6, dtype: 'melee' },
  },
  beetle: {
    name: 'Beetle', hp: 320, speed: 0.9, radius: 0.62, bounty: 16, glory: 3, bug: true, armor: 0.6,
    attack: { kind: 'melee', range: 0.5, damage: 28, cooldown: 1.2, dtype: 'melee' },
  },
  bombardier: {
    name: 'Bombardier', hp: 90, speed: 1.0, radius: 0.42, bounty: 12, glory: 2, bug: true,
    attack: { kind: 'lob', range: 6, damage: 22, splash: 1.1, cooldown: 2.5, flight: 0.8, dtype: 'acid' },
  },
  wasp: {
    name: 'Wasp', hp: 70, speed: 2.4, radius: 0.4, bounty: 10, glory: 2, bug: true, air: true,
    attack: { kind: 'melee', range: 0.6, damage: 10, cooldown: 0.8, dtype: 'melee' },
  },
  queen: {
    name: 'The Queen', hp: 5000, speed: 0.5, radius: 1.4, bounty: 400, glory: 60, bug: true, armor: 0.4,
    attack: { kind: 'melee', range: 1.4, damage: 70, splash: 1.5, cooldown: 1.6, dtype: 'melee' },
  },
};

/** Fraction of each damage type that armor applies to. Blasts and fire ignore most plating. */
export const ARMOR_APPLIES = { bullet: 1, flak: 1, melee: 0.8, fire: 0.4, blast: 0.3, acid: 0.3 };

/** Can this damage type hit aircraft? */
export const HITS_AIR = { bullet: 0.5, flak: 1, melee: 0, fire: 0, blast: 0, acid: 0 };
