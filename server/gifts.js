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
