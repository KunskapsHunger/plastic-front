// The Federal Playroom Network. Every line is read from the local team's point of view:
// {us} is your side, {enemy} is theirs, {lane} is a lane name.

export const NETWORK = 'FPN';
export const SLOGAN = 'Service guarantees bedtime.';

export const IDLE_LINES = [
  'Molding quotas exceeded for the ninth consecutive nap time!',
  'Reminder: questioning the Molding Press is a bedtime offence.',
  'Today\'s fallen are tomorrow\'s pellets. Recycle proudly!',
  '{enemy} propaganda claims our soldiers are "just toys". Such lies will be melted.',
  'Service guarantees bedtime.',
  'The Federation thanks the ten thousand volunteers who were molded this morning.',
  'Doctors agree: a soldier with no legs can still hold a flag.',
  'Conveyor belts are the veins of freedom. Keep them flowing!',
  '{enemy} soldiers cannot even stand up straight. Look at their bases.',
  'Want to know more? Of course you do. Knowing more is mandatory.',
  'Sandbox report: the sand is now forty percent hero.',
  'Glory is earned by victory. Glory is also earned by dying. Everybody wins!',
  'Molding Press Safety Board: stand very still, it only hurts once.',
  'Fear is just courage that has not been molded yet.',
  'Recycling fact: the average {us} soldier serves 3.4 times before retirement.',
  'The Parents\' Council reminds all combatants that the war ends at dinner.',
  'Our Glue Corps reattach 98% of heads. The other 2% are promoted.',
  'Is your conveyor idle? An idle belt is a {enemy} belt.',
  'Citizens report the Front is "loud" and "full of legs". Morale is excellent.',
  'This broadcast is brought to you by Bang Powder: it goes bang.',
  'A clean factory is a patriotic factory. A full sandbox is a victorious one.',
  'Remember: the {enemy} want your plastic. Give them caps instead.',
  'Weather on the Front: cloudy with a chance of shrapnel.',
  'The Toybox Federation does not lose wars. It postpones victories.',
];

export const LANE_NAMES = ['northern', 'central', 'southern'];

export const EVENT_LINES = {
  start: [
    'Good morning, {us}! The {enemy} menace has crossed the Rug. Your factory awaits!',
    'The war has begun! Build the machine, and the machine will build the heroes.',
  ],
  startBugs: [
    'FPN BUG WATCH: Creepy-crawlies from the Backyard are coming for our plastic. Build fast, citizens!',
  ],
  firstDeploy: ['The first heroes of the day march proudly into the sandbox!'],
  casualties: [
    '{n} heroes have given their plastic! Morale has never been higher!',
    '{n} brave soldiers have been recycled. The Reclamation Office thanks them warmly.',
    'Casualties pass {n}! Production quotas rise to honour them.',
  ],
  kills: ['{n} {enemy} soldiers melted! Keep up the wonderful work!'],
  ourBreach: [
    'ALERT! The {enemy} have breached the {lane} gate! Defend your conveyors!',
    'The {lane} gate has fallen! This is fine. This is a planned tactical opening.',
  ],
  theirBreach: [
    'VICTORY at the {lane} gate! Our heroes pour into {enemy} territory!',
    'The {enemy} {lane} gate is rubble! Onward to their Toybox!',
  ],
  gateRebuilt: ['The {lane} gate stands again, stronger and more patriotic than before.'],
  hqHit: ['The Command Toybox is under fire! Stay calm and keep molding.'],
  research: ['Citizenship Program approved: {tech}! {blurb}'],
  firstTank: ['Wind-up armour rolls out! Twelve turns of freedom!'],
  firstPlane: ['Our tin biplanes take to the sky! Look up, {enemy}. Look up.'],
  colossus: ['PROJECT COLOSSUS IS AWAKE. Please remain calm and proud.'],
  broke: ['Budget Advisory: requisition is low. Have you considered producing harder?'],
  wave: ['FPN BUG WATCH: Wave {n} is crawling in from the Backyard. They want your plastic!'],
  queen: ['THE QUEEN HAS EMERGED. Do not look her in the eyes. All of them.'],
  victory: [
    'VICTORY! The playroom is free! {n} heroes were recycled to make this moment possible.',
  ],
  defeat: [
    'The Command Toybox has fallen. The Federation will remember you. Briefly.',
  ],
  victoryBugs: ['The Hive is ash! The Backyard is ours! Somebody find the garden hose.'],
};

export const CASUALTY_MILESTONES = [25, 100, 250, 500, 1000, 2000, 5000];
export const KILL_MILESTONES = [50, 200, 500, 1000, 2500];

export function fill(line, vars) {
  return line.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function pickLine(key, vars, rnd = Math.random) {
  const list = EVENT_LINES[key] || IDLE_LINES;
  return fill(list[Math.floor(rnd() * list.length)], vars);
}
