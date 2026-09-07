// The second Creator: whoever holds the far fire.
//
// The village has a sky. The people past the pale have one too, and it is somebody else — another
// person at another browser, with their own password, their own attention, and their own eight
// people to keep alive through the winter. They cannot reach into the village and the village's
// Creator cannot reach into them. The two of them only ever meet the way the two fires meet: a
// trader at the edge, food left on a stone, a raid in the dark, a star stood over both.
//
// Attention here is earned on the far fire's terms, not the village's. A raid that takes what they
// needed is worth something to them; a raid driven off is worth nothing and costs them a body.

import * as B from './body.js';
import * as Rv from './rival.js';

export const FIRE_COSTS = { feed: 1, kin: 3, harden: 2, offer: 1, trade: 1, raid: 2, refuse: 1, hold: 0, name: 0 };

const HELP = {
  feed:   'Food at the fire in the morning and nobody asks where from.',
  kin:    'Another set of tracks comes down out of the hills to your fire.',
  harden: 'They sharpen what they have. The village will hear it.',
  offer:  'Your people carry food to the village edge and leave it on a stone.',
  trade:  'A trader walks to the edge in the morning with what you can spare.',
  raid:   'They go tonight, whatever the mood is, and take what they can carry.',
  refuse: 'The star the sky stood over both fires means nothing here.',
  hold:   'Nothing tonight. They stay by their own fire.',
  name:   'What your people call the thing over their fire.',
};

// The far fire's own sky. Smaller than the village's: six, not eight.
export function ensureGod(w) {
  const r = Rv.ensure(w);
  if (!r.god) r.god = { attention: 4, max: 6, acts: [], name: 'the Dark', named: null };
  if (!r.season) r.season = blankSeason();
  return r.god;
}
const blankSeason = () => ({ deaths: 0, born: 0, trades: 0, took: 0, repelled: 0, offered: 0, sent: 0 });
export const season = (w) => (Rv.ensure(w).season = Rv.ensure(w).season || blankSeason());

export function fireAct(w, msg, c) {
  const r = Rv.ensure(w), g = ensureGod(w);
  const cost = FIRE_COSTS[msg.op];
  if (cost == null) return { error: 'unknown op' };
  // Before the two fires have seen each other there is nothing to do across the pale, but you may
  // still feed your own and name yourself.
  const met = r.seen != null;   // day 0 is a real day; never test this for truthiness
  if (!met && !['feed', 'kin', 'harden', 'hold', 'name'].includes(msg.op)) {
    return { error: 'the village has not seen your fire yet. Until they do, there is nothing between you.' };
  }
  // Everything that can fail, fails before anything is spent.
  if (msg.op === 'offer' && Math.floor(r.food) < 1) return { error: 'you have nothing to carry to them' };
  if (msg.op === 'kin' && r.people >= 20) return { error: 'the fire will not feed any more than this' };
  if (msg.op === 'harden' && r.strength >= 8) return { error: 'they are as hard as they are going to get' };
  if (msg.op === 'refuse' && (r.parley == null || r.parley < w.day - 1)) return { error: 'no star has been stood over both fires to refuse' };
  if (msg.op === 'name' && !String(msg.text || '').trim()) return { error: 'say what they call you' };
  if (cost > 0) {
    if (g.attention < cost) return { error: `not enough attention (${g.attention} of ${cost} needed). It is earned when the season is weighed.` };
    g.attention -= cost;
    g.acts.push({ op: msg.op, day: w.day });
    if (g.acts.length > 200) g.acts.shift();
  }
  switch (msg.op) {
    case 'feed': {
      r.food += 6; r.hungryNights = 0;
      Rv.log(w, 'Food at the fire in the morning. Nobody asked where from.');
      return { ok: true, text: `They eat tonight. ${Math.round(r.food)} food at the fire.` };
    }
    case 'kin': {
      r.people += 1; season(w).born += 1;
      Rv.log(w, 'Someone came down out of the hills and stayed.');
      if (met) c.event(`The smoke past the pale stands double for a night. There are more of them at ${r.name} than there were.`, 'info');
      return { ok: true, text: `${r.people} at the fire now.` };
    }
    case 'harden': {
      r.strength += 1;
      Rv.log(w, 'They sharpened what they had.');
      if (met) {
        c.event(`Axes ring somewhere out past the pale, a long way off, for most of the afternoon.`, 'info');
        for (const a of c.alive()) if (Math.random() < 0.5) c.remember(a, `You heard axes out past the pale where ${r.name} are, and they were not cutting wood.`, 0.6);
      }
      return { ok: true, text: `They are ${r.strength} strong now. The village heard it.` };
    }
    case 'offer': {
      const n = Math.max(1, Math.min(4, Math.floor(r.food)));
      r.food -= n; w.store.shelf.food = (w.store.shelf.food || 0) + n;
      r.offered = (r.offered || 0) + n; season(w).offered += n;
      r.mood = B.clamp(r.mood + 0.12, -1, 1);
      c.event(`${cap(r.name)} carry ${n} food to the edge of the village and leave it on a stone, and go back without knocking.`, 'share');
      for (const a of c.alive()) c.remember(a, `${cap(r.name)} left ${n} food at the edge for us. Nobody asked them to. Some say it is kindness and some say it is a way of counting our doors.`, 0.7);
      Rv.log(w, `Carried ${n} food to the village edge.`);
      return { ok: true, text: `${n} food left at their edge. They will argue about what it meant.` };
    }
    case 'trade': {
      r.parley = w.day;
      Rv.log(w, 'A trader was sent to the village.');
      return { ok: true, text: 'A trader walks in the morning. What they get for it depends on what the village has on the shelf.' };
    }
    case 'raid': {
      r.willRaid = true;
      Rv.log(w, 'They were sent at the village.');
      return { ok: true, text: 'They go tonight. If the village is awake and armed you will lose someone for nothing.' };
    }
    case 'refuse': {
      r.parley = null; r.mood = B.clamp(r.mood - 0.35, -1, 1);
      c.event(`The star stood over both fires all night, and the far one went out under it before morning.`, 'god');
      for (const a of c.alive()) { c.remember(a, `The sky stood one star over us and over ${r.name}, and they put their fire out under it rather than stand there with us.`, 0.8); a.faith = B.clamp((a.faith || 0) - 0.02, -1, 1); }
      Rv.log(w, 'Refused the star the sky stood over both fires.');
      return { ok: true, text: `Refused. ${cap(r.name)} are ${Rv.moodWord(r.mood)} toward the village now.` };
    }
    case 'hold': {
      r.willHold = true; r.willRaid = false;
      Rv.log(w, 'They were held at their own fire for the night.');
      return { ok: true, text: 'Nothing tonight. They stay by their own fire.' };
    }
    case 'name': {
      const name = String(msg.text).trim().slice(0, 24);
      g.name = name; g.named = w.day;
      Rv.log(w, `They named the thing over the fire: ${name}.`);
      if (met) for (const a of c.alive()) if (Math.random() < 0.4) c.remember(a, `Word from the edge: ${r.name} have a name for whatever it is that watches them. They call it ${name}.`, 0.5);
      return { ok: true, text: `They call you ${name}.` };
    }
  }
  return { error: 'unknown op' };
}

// The far fire is weighed at the season's turn too, on its own terms, and only after the two fires
// know of each other. Nothing of this reaches the village; it goes in their own log.
export function weighFire(w) {
  const r = Rv.ensure(w), g = ensureGod(w);
  if (r.seen == null) return null;
  const s = season(w);
  let earned = 2; const why = ['2 for the season turning'];
  if (!s.deaths) { earned += 1; why.push('1 for no one lost at the fire'); }
  else { earned -= s.deaths; why.push(`-${s.deaths} for ${s.deaths} lost at the fire`); }
  if (r.food >= 6) { earned += 1; why.push('1 for a fire that is fed'); }
  if (s.trades) { earned += Math.min(2, s.trades); why.push(`${Math.min(2, s.trades)} for trading with the village`); }
  if (s.offered) { earned += 1; why.push('1 for what you carried to their edge'); }
  if (s.took) { earned += Math.min(2, s.took); why.push(`${Math.min(2, s.took)} for taking what your people needed`); }
  if (s.repelled) { earned -= s.repelled; why.push(`-${s.repelled} for going at them and being driven back`); }
  earned = Math.max(-2, Math.min(5, earned));
  g.attention = Math.max(0, Math.min(g.max, g.attention + earned));
  const report = { day: w.day, people: r.people, food: Math.round(r.food), strength: r.strength, mood: Rv.moodWord(r.mood), earned, why };
  r.reports = r.reports || []; r.reports.push(report); if (r.reports.length > 24) r.reports.shift();
  Rv.log(w, `The season is weighed at the fire: ${earned >= 0 ? '+' : ''}${earned} attention.`);
  r.season = blankSeason();
  return report;
}

// What the far fire's Creator is shown. Their own people, and only what the village has done where
// they could see it. Both Creators can see how much attention the other has left; that is on purpose.
export function publicState(w) {
  const r = w.rival; if (!r) return null;
  const g = r.god || { attention: 0, max: 6, acts: [], name: 'the Dark', named: null };
  const met = r.seen != null;
  return {
    god: { attention: g.attention, max: g.max, name: g.name, named: g.named, costs: FIRE_COSTS, help: HELP, recentActs: (g.acts || []).slice(-10) },
    people: r.people, food: Math.round(r.food), wood: Math.round(r.wood || 0), strength: r.strength,
    mood: Rv.moodWord(r.mood), moodN: +(r.mood || 0).toFixed(2), hungryNights: r.hungryNights || 0,
    seen: r.seen, name: r.name, leader: r.leader,
    sentToUs: r.sent || 0, offered: r.offered || 0, trades: r.trades || 0,
    met, parleyOpen: r.parley != null && r.parley >= w.day - 1, willRaid: !!r.willRaid, willHold: !!r.willHold,
    raids: (r.raids || []).slice(-6), log: (r.log || []).slice(-10), reports: (r.reports || []).slice(-4),
    season: r.season || blankSeason(),
  };
}

const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
