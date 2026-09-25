// Lines the Federal Playroom Network announcer speaks aloud. Pre-rendered to public/voice/<id>.wav by
// tools/gen-voice.mjs. They are side-neutral ("the enemy"), so one recording serves Green and Tan.
import { TECHS } from './tech.js';

const LANES = ['northern', 'central', 'southern'];

export const VOICE_LINES = {
  start: 'Good morning, citizens! The enemy has crossed the Rug. Build the machine, and the machine will build the heroes!',
  start_bughunt: 'Federal Playroom Network bug watch! Creepy-crawlies from the Backyard want our plastic. Build fast, citizens!',
  first_deploy: 'The first heroes of the day march proudly into the sandbox!',
  casualties_25: 'Twenty-five heroes have given their plastic! Morale has never been higher!',
  casualties_100: 'One hundred brave soldiers recycled! The Reclamation Office thanks them warmly.',
  casualties_250: 'Two hundred and fifty heroes! Production quotas rise to honour them.',
  casualties_500: 'Five hundred heroes have served! Every one of them will serve again.',
  casualties_1000: 'One thousand heroes! The sandbox is now mostly hero. Carry on!',
  casualties_2000: 'Two thousand heroes recycled! The Molding Press has asked for a short holiday. Request denied.',
  casualties_5000: 'Five thousand heroes! Statisticians report the war is going extremely well.',
  hq_hit: 'The Command Toybox is under fire! Stay calm and keep molding.',
  first_tank: 'Wind-up armour rolls out! Twelve turns of freedom!',
  first_plane: 'Our tin biplanes take to the sky! Look up, enemy. Look up.',
  colossus: 'Project Colossus is awake. Please remain calm, and proud.',
  broke: 'Budget advisory: requisition is low. Have you considered producing harder?',
  wave: 'Bug watch! Another wave is crawling in from the Backyard. They want your plastic!',
  queen: 'The Queen has emerged. Do not look her in the eyes. All of them.',
  victory: 'Victory! The playroom is free! Service guarantees bedtime!',
  victory_bugs: 'The Hive is ash! The Backyard is ours! Somebody find the garden hose.',
  defeat: 'The Command Toybox has fallen. The Federation will remember you. Briefly.',
  idle_1: 'Reminder: questioning the Molding Press is a bedtime offence.',
  idle_2: 'Doctors agree: a soldier with no legs can still hold a flag.',
  idle_3: 'Recycling fact: the average soldier serves three point four times before retirement.',
  idle_4: 'Glory is earned by victory. Glory is also earned by dying. Everybody wins!',
  idle_5: 'The Parents\' Council reminds all combatants that the war ends at dinner.',
  idle_6: 'Want to know more? Of course you do. Knowing more is mandatory.',
};

LANES.forEach((lane, i) => {
  VOICE_LINES[`our_breach_${i}`] = `Alert! The enemy has breached the ${lane} gate! Defend your conveyors!`;
  VOICE_LINES[`their_breach_${i}`] = `Victory at the ${lane} gate! Our heroes pour into enemy territory!`;
});

for (const [id, t] of Object.entries(TECHS)) {
  VOICE_LINES[`research_${id}`] = `Citizenship Program approved: ${t.name}! ${t.blurb}`;
}

export const IDLE_VOICE = ['idle_1', 'idle_2', 'idle_3', 'idle_4', 'idle_5', 'idle_6'];

/** Delivery direction per line (sent as speech_metadata.style; it is never spoken). */
export function styleFor(id) {
  if (/^(our_breach|hq_hit|queen|wave)/.test(id)) {
    return 'urgent wartime bulletin, alarmed yet forcedly cheerful, fast and breathless';
  }
  if (id === 'defeat') return 'slow and solemn, with barely concealed indifference';
  if (/^idle|broke/.test(id)) return 'brisk public-service announcement, bright and completely deadpan';
  if (/^(victory|their_breach|colossus)/.test(id)) return 'triumphant, booming, swelling with patriotic pride';
  return 'rapid, booming 1950s newsreel narration, relentlessly upbeat and patriotic';
}
