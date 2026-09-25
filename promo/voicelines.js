// Voiceover for the promo films, read by the same designed FPN announcer as the game.
//   VOICE_LINES_MODULE=promo/voicelines.js VOICE_OUT=promo/voice GEMINI_API_KEY=... node tools/gen-voice.mjs

export const VOICE_LINES = {
  // YouTube recruitment film
  tr_1: 'Citizens of the Playroom! The Federation needs you!',
  tr_2: 'Every hero starts as a humble pellet. Scooped, belted, and pressed with love.',
  tr_3: 'Our assembly benches turn parts into patriots. One every three seconds!',
  tr_4: 'Then they march bravely into the sandbox, where they will be <short pause> extremely brave.',
  tr_5: 'Wind-up tanks! Flamethrowers! Firecrackers! Everything a growing army needs!',
  tr_6: 'Every sacrifice earns glory. Every broken hero is recycled into a new one. Nothing is wasted. <short pause> Nothing.',
  tr_7: 'And when the Backyard sends its creepy-crawlies, you and your friends will hold the line. Together.',
  tr_8: 'Build the machine. The machine builds the army.',
  tr_9: 'Plastic Front. Free to play in your browser, with your friends. Service guarantees bedtime!',
  // whimsical short
  sw_1: 'This is Kevin.',
  sw_2: 'Kevin is made of plastic. Kevin is very brave.',
  sw_3: 'Kevin has been recycled!',
  sw_4: 'Good news! We made four hundred more Kevins.',
  sw_5: 'Plastic Front. Build the machine. Service guarantees bedtime!',
  // explanatory short
  se_1: 'How to win a toy war, in four easy steps!',
  se_2: 'Step one: scoop plastic, tin, and bang powder off the playroom floor.',
  se_3: 'Step two: belt it all into presses, mills, and assembly benches.',
  se_4: 'Step three: feed the crates into a gate. The soldiers march out on their own. You just build the machine.',
  se_5: 'Step four: do not look too closely at the sandbox. <short pause> It\'s fine. Everything is fine.',
  se_6: 'Play solo, fight bugs with friends, or wage war on each other. Right in your browser.',
  se_7: 'Plastic Front. Service guarantees bedtime!',
};

const STYLES = {
  tr_1: 'rousing wartime recruitment call, booming and thrilled',
  tr_6: 'warm, proud and sincere, then suddenly flat and ominous on the last word',
  tr_7: 'stirring and heroic, building to a crescendo',
  tr_8: 'slow, grand and weighty, like a monument being unveiled',
  sw_1: 'warm and proud, like introducing a beloved family pet',
  sw_2: 'tender and admiring',
  sw_3: 'delighted, as if announcing a promotion',
  sw_4: 'triumphant and very pleased with itself',
  se_1: 'excited game-show host energy, snappy',
  se_5: 'cheerful but increasingly nervous, speeding up',
};

export function styleFor(id) {
  return STYLES[id] || 'rapid, booming 1950s newsreel narration, relentlessly upbeat and patriotic';
}
