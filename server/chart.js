// Birth charts and transits.
// Approximate mean-longitude ephemeris: accurate to a few degrees for the
// slow bodies, rougher for Venus and Mars. Good enough to place a sign and
// detect a hard aspect. Swap in the Daily Stars engine for a real chart.

export const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
  'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];

const J2000 = Date.UTC(2000, 0, 1, 12);
const days = (ms) => (ms - J2000) / 86400000;
const norm = (deg) => ((deg % 360) + 360) % 360;

// Mean ecliptic longitudes in degrees as a function of days since J2000.
const MEAN = {
  sun:     d => 280.460 + 0.98564736 * d,
  moon:    d => 218.316 + 13.176396 * d,
  venus:   d => 181.980 + 1.602130 * d,   // heliocentric mean; sign-level only
  mars:    d => 355.433 + 0.524033 * d,
  jupiter: d => 34.351 + 0.083056 * d,
  saturn:  d => 50.077 + 0.033371 * d,
};

export function skyAt(ms) {
  const d = days(ms);
  const out = {};
  for (const [k, f] of Object.entries(MEAN)) out[k] = norm(f(d));
  return out;
}

export const signOf = (deg) => SIGNS[Math.floor(norm(deg) / 30)];

export function makeChart(birthMs) {
  const sky = skyAt(birthMs);
  const hour = new Date(birthMs).getUTCHours() + new Date(birthMs).getUTCMinutes() / 60;
  // Rough ascendant: the sun sign rises around 6am, one sign every two hours.
  const rising = norm(sky.sun + (hour - 6) * 15);
  const chart = { birth: new Date(birthMs).toISOString(), rising: signOf(rising), longitudes: { ...sky, rising } };
  for (const k of Object.keys(MEAN)) chart[k] = signOf(sky[k]);
  chart.summary = `Sun in ${chart.sun}, Moon in ${chart.moon}, ${chart.rising} rising. ` +
    `Venus in ${chart.venus}, Mars in ${chart.mars}, Saturn in ${chart.saturn}.`;
  return chart;
}

// ---------- what a chart says about a person, in plain words ----------

export const ELEMENT = { Aries: 'fire', Leo: 'fire', Sagittarius: 'fire', Taurus: 'earth', Virgo: 'earth', Capricorn: 'earth',
  Gemini: 'air', Libra: 'air', Aquarius: 'air', Cancer: 'water', Scorpio: 'water', Pisces: 'water' };

const SIGN_WORDS = {
  Aries: 'quick to act, quick to anger, first through the door',
  Taurus: 'slow, steady, hard to move once settled',
  Gemini: 'curious, talkative, restless',
  Cancer: 'tender, protective, feels everything',
  Leo: 'warm, proud, needs to be seen',
  Virgo: 'careful, exacting, notices what is wrong',
  Libra: 'wants peace, weighs everyone, hates a fight',
  Scorpio: 'intense, private, never forgets',
  Sagittarius: 'hopeful, blunt, always half-leaving',
  Capricorn: 'serious, enduring, carries the load',
  Aquarius: 'odd, detached, loyal to ideas over people',
  Pisces: 'porous, dreamy, takes on other people\'s weather',
};
const FRAMES = {
  sun:    (s) => `Who you are at the core: ${SIGN_WORDS[s]}.`,
  moon:   (s) => `What you need and how you feel: ${SIGN_WORDS[s]}.`,
  rising: (s) => `How you meet people: ${SIGN_WORDS[s]}.`,
  venus:  (s) => `How you love and trust: ${SIGN_WORDS[s]}.`,
  mars:   (s) => `How you fight and work: ${SIGN_WORDS[s]}.`,
  saturn: (s) => `Where you brace and where it is hard: ${SIGN_WORDS[s]}.`,
};
export function describeChart(chart) {
  return ['sun', 'moon', 'rising', 'venus', 'mars', 'saturn'].map(p => ({ point: p, sign: chart[p], text: FRAMES[p](chart[p]) }));
}

// Three dials the sim actually uses, 0..1, derived from the chart.
//   temper: how fast hurt turns outward (Mars, Sun)
//   need:   how much closeness the body wants (Moon, Venus)
//   guard:  how braced the body starts (Saturn, Rising)
export function traitsFrom(chart) {
  const el = (p) => ELEMENT[chart[p]];
  const score = (p, table) => table[el(p)] ?? 0.5;
  const temper = (score('mars', { fire: 0.85, air: 0.5, earth: 0.35, water: 0.45 }) + score('sun', { fire: 0.7, air: 0.5, earth: 0.4, water: 0.4 })) / 2;
  const need = (score('moon', { water: 0.85, fire: 0.6, air: 0.4, earth: 0.45 }) + score('venus', { water: 0.75, fire: 0.6, air: 0.5, earth: 0.45 })) / 2;
  const guard = (score('saturn', { earth: 0.7, water: 0.6, fire: 0.45, air: 0.4 }) + score('rising', { earth: 0.65, water: 0.6, fire: 0.35, air: 0.4 })) / 2;
  return { temper: +temper.toFixed(2), need: +need.toFixed(2), guard: +guard.toFixed(2) };
}

// How well two charts sit together, 0..1. Same element or the friendly pair (fire+air, earth+water)
// counts as ease; the squared pairs (fire+water, earth+air) as friction. Sun, Moon, Venus weighed.
const FRIENDS = { fire: 'air', air: 'fire', earth: 'water', water: 'earth' };
export function compatibility(c1, c2) {
  let score = 0, n = 0;
  const pairs = [['sun', 'moon'], ['moon', 'sun'], ['venus', 'venus'], ['moon', 'moon'], ['sun', 'sun'], ['venus', 'mars'], ['mars', 'venus']];
  for (const [p, q] of pairs) {
    const e1 = ELEMENT[c1[p]], e2 = ELEMENT[c2[q]];
    if (!e1 || !e2) continue;
    n++;
    if (e1 === e2) score += 0.85;
    else if (FRIENDS[e1] === e2) score += 0.7;
    else score += 0.25;
  }
  return n ? +(score / n).toFixed(2) : 0.5;
}
export function compatibilityWords(s) {
  if (s >= 0.7) return 'The stars sit well between you. It is easy to stay.';
  if (s >= 0.5) return 'The stars are mixed between you. It takes tending.';
  return 'The stars pull against each other between you. Staying is work.';
}

// Roll a birth 18-40 years before `nowMs`, random time of day.
export function rollBirth(nowMs, rng = Math.random) {
  const years = 18 + rng() * 22;
  const ms = nowMs - years * 365.25 * 86400000 - rng() * 86400000;
  return Math.floor(ms);
}

function aspect(a, b) {
  const diff = Math.abs(norm(a - b));
  const sep = diff > 180 ? 360 - diff : diff;
  if (sep <= 8) return 'conjunct';
  if (Math.abs(sep - 180) <= 8) return 'opposite';
  if (Math.abs(sep - 90) <= 7) return 'square';
  return null;
}

// Which transits are pressing on this chart today. Returns [{planet, point, aspect, note}].
export function transitsFor(chart, nowMs) {
  const sky = skyAt(nowMs);
  const natal = chart.longitudes;
  const hits = [];
  const check = (planet, point, note) => {
    const asp = aspect(sky[planet], natal[point]);
    if (asp) hits.push({ planet, point, aspect: asp, note });
  };
  check('saturn', 'sun',   'Saturn is pressing on your sense of who you are.');
  check('saturn', 'moon',  'Saturn sits on your feelings. Old hurts feel closer.');
  check('mars',   'moon',  'Mars stirs your feelings. Your temper is short.');
  check('mars',   'venus', 'Mars crosses your Venus. You want closeness and it comes out sharp.');
  check('jupiter','sun',   'Jupiter warms your Sun. Things feel possible.');
  check('jupiter','moon',  'Jupiter eases your Moon. You feel held.');
  return hits;
}

// Sensitivity multiplier for emotional hits today. Saturn/Mars raise it, Jupiter lowers it.
export function pressure(transits) {
  let p = 1;
  for (const t of transits) {
    if (t.planet === 'saturn') p += 0.35;
    if (t.planet === 'mars') p += 0.25;
    if (t.planet === 'jupiter') p -= 0.2;
  }
  return Math.max(0.5, p);
}
