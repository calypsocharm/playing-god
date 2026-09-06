// The quiet arts. A gift wakes in a villager who sits still long enough, or when the sky touches
// them. Which gift is the Moon's element: the inner life decides what the hands can do.
// Every gift is small, costs the body, and is seen: some who see it are glad and some afraid.

import { ELEMENT } from './chart.js';

export const GIFTS = {
  kindling:  { element: 'fire',  label: 'kindling',       what: 'You can call fire. Cast at the hearth and it burns high without wood; cast on someone and the cold leaves them.',            felt: 'There is heat in your palms that is not the weather.' },
  seeing:    { element: 'water', label: 'seeing',         what: 'You can see into someone. Cast on a person and you know the rule their body wrote, and it loosens.',                       felt: 'When you look at someone long enough, something in them opens like a door left ajar.' },
  greenhand: { element: 'earth', label: 'the green hand', what: 'You can wake the ground. Cast at the field and tomorrow it gives half again as much; cast on someone hurt and the hurt closes.', felt: 'Things grow toward your hands.' },
  farsight:  { element: 'air',   label: 'farsight',       what: 'You can see far. Cast anywhere and you know who is hungry, cold or hurt and where; cast at the edge and you find what is past it.', felt: 'Sometimes you know what is over the hill before you climb it.' },
};

export const giftFor = (chart) => Object.keys(GIFTS).find(k => GIFTS[k].element === ELEMENT[chart.moon]) || 'farsight';
export const COST = 'It costs you strength and breath. More than two in a day burns you.';

// The clairs. Not cast: they are always on. Each is a way of knowing others that the body pays for.
export const SENSES = {
  empath:         { label: 'empath',         long: 'clairsentience', wakes: 'listening: comforting, long talks, long walks',
                    felt: "Other people's weather moves through your own chest. When someone near you is tight, you are tight; when they ease, you ease.",
                    what: 'You feel what the people near you feel, in your own body. Your comfort reaches deeper than anyone else\'s. It costs you: you carry what they carry.' },
  clairaudient:   { label: 'clairaudient',   long: 'clairaudience',  wakes: 'singing: the ones who sing start to hear',
                    felt: 'You hear things from far off: voices at the well when you are in the field, a prayer said under someone\'s breath.',
                    what: 'You hear what is said anywhere in the village, and what people ask of the sky. It costs you: you sleep lightly.' },
  clairvoyant:    { label: 'clairvoyant',    long: 'clairvoyance',   wakes: 'deep stillness, more than a gift takes',
                    felt: "You see tomorrow's sky today, the way you see the back of your own hand.",
                    what: 'You know what the weather will do tomorrow. It costs you: knowing is heavy, and joy runs out of you faster.' },
  claircognizant: { label: 'claircognizant', long: 'claircognizance', wakes: 'a healed wound and stillness',
                    felt: 'You know things about people you were never told: who trusts you, who does not, what old hurt they carry.',
                    what: 'You know how each person near you truly stands toward you, and what runs them. It costs you: it is hard to stay open when you know.' },
};
// Which sense is ready to wake in this person, if any.
export function senseReady(a) {
  const sk = a.skills || {};
  if ((sk.listening || 0) >= 10) return 'empath';
  if ((sk.music || 0) >= 6) return 'clairaudient';
  if (a.scars.length && (sk.stillness || 0) >= 6) return 'claircognizant';
  if ((sk.stillness || 0) >= 14) return 'clairvoyant';
  return null;
}
