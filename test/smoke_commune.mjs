// The higher self's conversation. What a villager is actually handed when the voice speaks, and
// whether it tells them the one thing that decides their tone: how they feel about the voice.
// Pass a name to print the whole prompt: `node test/smoke_commune.mjs Mira`
import { readFileSync } from 'node:fs';
import * as World from '../server/world.js';
import { communePrompt, COMMUNE_SYSTEM } from '../client/prompt.js';

const acts = new Map();
let fails = 0;
const ok = (label, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' · ' + extra : ''}`); if (!cond) fails++; };

const w = World.createWorld(null); w.weather.daysPerSeason = 6;
for (let i = 0; i < 3 * World.TICKS_PER_DAY; i++) World.step(w, acts);
const [believer, doubter] = World.alive(w);

// ---- the view carries what the conversation needs ----
believer.faith = 1;
let v = World.viewFor(believer, w);
ok('the view says how they feel about the voice', typeof v.towardTheVoice === 'string' && v.towardTheVoice.length > 10);
ok('a believer is told they are glad of it', /glad of it/.test(v.towardTheVoice), v.towardTheVoice.slice(0, 60));
ok('the view carries the sky', Array.isArray(v.sky));
ok('the view carries ordinary days as well as the worst', Array.isArray(v.recent));

doubter.faith = -0.8;
const vd = World.viewFor(doubter, w);
ok('a doubter is told they have reasons', /can earn it|not sure anything is listening/.test(vd.towardTheVoice), vd.towardTheVoice.slice(0, 60));

// ---- the prompt actually contains it ----
const p = communePrompt({ ...v, _since: [] }, 'How are you, really?', '');
ok('the prompt tells them how they feel about the voice', p.includes(v.towardTheVoice));
ok('the prompt carries the sky, which it never used to', /The sky, to you:/.test(p) || !v.sky.length);
ok('the prompt no longer leads with "argue, or refuse"', !/You may agree, argue, ask it something, or refuse/.test(p));
ok('warmth is available to a believer', /warmly, gladly, and at your ease/.test(p));
ok('refusal is still available', /free to argue, to ask it something back, or to refuse/.test(p));
ok('a hard answer must be earned', /has to be earned by something that actually happened/.test(p));
ok('the system line stops it playing a gruff stranger', /not a gruff stranger/.test(COMMUNE_SYSTEM));

const pd = communePrompt({ ...vd, _since: [] }, 'How are you, really?', '');
ok('the doubter gets their own framing', pd.includes(vd.towardTheVoice) && !pd.includes(v.towardTheVoice));

// ---- a standing intention is remembered in conversation ----
believer.guidance = 'look after the ones who cannot ask';
const pg = communePrompt({ ...World.viewFor(believer, w), _since: [] }, 'Still there?', '');
ok('what you told them to carry comes up', /carried ever since: "look after the ones who cannot ask"/.test(pg));

// ---- the astrology no longer floods their memory ----
const w2 = World.createWorld(null); w2.weather.daysPerSeason = 6;
for (let i = 0; i < 20 * World.TICKS_PER_DAY; i++) World.step(w2, acts);
// Ordinary days repeat, and should - you really do forage the same meadow twice. What must not
// repeat is a transit: it is a mood that lasts a season, and re-learning it daily buried everything
// that actually happened under astrology.
const transitDupes = World.alive(w2).map(a => {
  const counts = {};
  for (const m of a.memories) if (/Saturn|Mars/.test(m.text)) counts[m.text] = (counts[m.text] || 0) + 1;
  return Math.max(0, ...Object.values(counts));
});
ok('the astrology is not re-learned every morning', Math.max(0, ...transitDupes) <= 1, `worst transit repeat ${Math.max(0, ...transitDupes)}`);
const anyTransit = World.alive(w2).some(a => a.memories.some(m => /Saturn|Mars/.test(m.text)));
ok('and transits are still remembered at all', anyTransit);

// ---- and it survives the real world ----
const saved = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url), 'utf8'));
const s = World.createWorld(saved);
const who = process.argv[2];
const target = World.alive(s).find(a => a.name === who) || World.alive(s)[0];
const vs = World.viewFor(target, s);
ok('a real villager gets a real framing', typeof vs.towardTheVoice === 'string', `${target.name} (faith ${vs.faith}): ${vs.towardTheVoice.slice(0, 70)}`);

if (who) {
  console.log('\n---------- what ' + target.name + ' is handed ----------\n');
  console.log(communePrompt({ ...vs, _since: [] }, 'What has happened to you since we last spoke? How are you, really?', ''));
}

console.log(fails ? `\nSMOKE FAILED: ${fails}` : '\nSMOKE DONE: all ok');
process.exit(fails ? 1 : 0);
