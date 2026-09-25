// The research tree, as the Federation's Citizenship Programs. Paid for in Glory (★).

export const TECHS = {
  sorting: {
    name: 'Sorting Efficiency Act', cost: 6, req: [], unlocks: 'Sorter',
    blurb: 'Every item in its place. Every citizen in theirs.',
  },
  tin: {
    name: 'Tinworks Mandate', cost: 12, req: [], unlocks: 'Tinworks, springs, Machine Gunners',
    blurb: 'A plate of tin for every patriot.',
  },
  fireworks: {
    name: 'Festive Munitions', cost: 15, req: [], unlocks: 'Firecrackers, Grenadiers',
    blurb: 'Every day is a holiday on the Front.',
  },
  reclaim: {
    name: 'Heroes Return Program', cost: 15, req: [], unlocks: 'Reclaimer',
    blurb: 'Nobody leaves the Front. Not really.',
  },
  belts2: {
    name: 'Mandatory Overtime', cost: 12, req: [], unlocks: 'Conveyors +50% speed',
    blurb: 'The belts want to go faster. So do you.',
  },
  drills2: {
    name: 'Deep Scoop Initiative', cost: 18, req: [], unlocks: 'Scoops +40% output',
    blurb: 'The floor has plenty more to give.',
  },
  glue: {
    name: 'Glue Corps', cost: 20, req: ['tin'], unlocks: 'Glue Medics',
    blurb: 'A cracked soldier is a soldier who can still serve.',
  },
  kitchen: {
    name: 'Kitchen Chemistry Initiative', cost: 30, req: ['tin', 'fireworks'], unlocks: 'Flamers',
    blurb: 'Plastic melts. The enemy is made of plastic. You do the math.',
  },
  artillery: {
    name: 'The Long Arm of the Law', cost: 35, req: ['fireworks'], unlocks: 'Mortar Teams, Mortar Pits',
    blurb: 'Why meet the enemy when you can visit them from afar?',
  },
  hp1: {
    name: 'Hardened Plastic', cost: 25, req: [], unlocks: 'Units +20% health',
    blurb: 'Thicker molds. Thicker resolve.',
  },
  dmg1: {
    name: 'Sharpened Resolve', cost: 25, req: [], unlocks: 'Units +15% damage',
    blurb: 'Hate is a renewable resource.',
  },
  windup: {
    name: 'Wind-Up Armor', cost: 45, req: ['tin'], unlocks: 'Wind-up Tanks',
    blurb: 'Twelve turns of the key. Unlimited freedom.',
  },
  bench2: {
    name: 'Assembly Quotas', cost: 30, req: [], unlocks: 'Assembly Benches +30% speed',
    blurb: 'Quotas are not goals. Quotas are the minimum.',
  },
  air: {
    name: 'Paper Sky Doctrine', cost: 60, req: ['windup'], unlocks: 'Tin Biplanes, Flak Nests',
    blurb: 'Take the war to their conveyor belts.',
  },
  colossus: {
    name: 'Project COLOSSUS', cost: 110, req: ['windup', 'artillery'], unlocks: 'The COLOSSUS',
    blurb: 'Classified. Enormous. Beloved.',
  },
};

export const TECH_ORDER = Object.keys(TECHS);

export function techAvailable(researched, id) {
  const t = TECHS[id];
  return !!t && !researched.has(id) && t.req.every((r) => researched.has(r));
}
