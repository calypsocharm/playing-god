// Things. Some you forage, some you make, some you want, some you need, some just matter.

export const MATERIALS = ['food', 'wood', 'stone', 'fiber', 'herbs', 'berries', 'fish', 'clay', 'coin'];

// Where foraging yields what. Amounts per forage action, scaled by season in world.js.
export const FORAGE = {
  forest: { wood: 2, herbs: 1 },
  meadow: { fiber: 2, berries: 1 },
  quarry: { stone: 2 },
  // Found by scouts. Hidden until someone walks out past the edge and comes back with the news.
  creek:  { fish: 2 },
  grove:  { berries: 3, herbs: 2 },
  claypit:{ clay: 2 },
};

// What lies past the edge, in the order a scout can find it. Each takes luck and a few tries.
export const FRONTIER = [
  { key: 'creek',   label: 'the creek',    x: 4,  y: 22, found: 'a creek running fast and cold over stones, with fish in the shallows' },
  { key: 'grove',   label: 'the grove',    x: 38, y: 1,  found: 'an old grove heavy with berries, herbs thick underfoot' },
  { key: 'claypit', label: 'the clay pit', x: 1,  y: 2,  found: 'a bank of red clay by a spring' },
];

export const ITEMS = {
  rope:    { label: 'rope',    recipe: { fiber: 2 },                        value: 1, need: false, use: 'material for tools and blankets' },
  axe:     { label: 'axe',     recipe: { wood: 2, stone: 1, rope: 1 },      value: 3, need: false, use: 'doubles wood from the forest, wears out', durability: 8 },
  hoe:     { label: 'hoe',     recipe: { wood: 2, stone: 1 },               value: 3, need: false, use: 'half again more food from the field, wears out', durability: 8 },
  blanket: { label: 'blanket', recipe: { fiber: 3, rope: 1 },               value: 4, need: true,  use: 'keeps you warm outdoors and at night' },
  salve:   { label: 'salve',   recipe: { herbs: 2 },                        value: 2, need: true,  use: 'heals hurt, used up' },
  charm:   { label: 'charm',   recipe: { stone: 1, fiber: 1 },              value: 5, need: false, use: 'does nothing, and people want it anyway' },
  bread:   { label: 'bread',   recipe: { food: 1, wood: 1 },                value: 2, need: true,  use: 'the staple. Feeds well, keeps, and breaking it with someone means something' },
  pot:     { label: 'pot',     recipe: { clay: 2, wood: 1 },                value: 3, need: false, use: 'stored food spoils slower; cooked fish feeds better' },
};

// What a Venus sign longs for. Fire wants to be seen, earth wants tools, air wants to be tied to others, water wants warmth.
export const WANTS_BY_ELEMENT = { fire: 'charm', earth: 'axe', air: 'rope', water: 'blanket' };

// Buildings the village raises together. Cost is total materials; anyone can add to it.
export const BUILDS = {
  granary: { label: 'granary', cost: { wood: 40, stone: 16 }, effect: 'stored food no longer spoils and the field gives more', at: 'hearth' },
  hall:    { label: 'hall',    cost: { wood: 64, stone: 30, rope: 8 }, effect: 'a roof over the hearth: warm even when the fire is out, and everyone there counts as sheltered', at: 'hearth' },
  road:    { label: 'road',    cost: { wood: 30, stone: 40 }, effect: 'a laid road from the hearth to the field and the forest: work and foraging tire people less', at: 'hearth' },
  pool:    { label: 'pool',    cost: { stone: 24, clay: 12, coin: 10 }, effect: 'a stone pool at the creek: a summer place, and being there in the heat settles the body', at: 'creek' },
};

// ---------- coin and the store ----------
// Coin is how surplus becomes something you can keep and spend. The store is the village's
// shared shelf: it buys what you bring and sells what it holds, and prices move with the shelf.
export const STORE_PRICES = { food: 2, bread: 4, wood: 1, stone: 1, fiber: 1, herbs: 2, berries: 1, fish: 2, clay: 1, rope: 3, axe: 8, hoe: 8, blanket: 10, salve: 5, charm: 12, pot: 7 };
export function newStore() {
  return { shelf: { food: 6, bread: 2, wood: 8, stone: 4, fiber: 4, rope: 2, blanket: 1, salve: 1 }, coin: 200, day: 0, ledger: [], loans: {}, project: null, wagesPaid: 0 };
}
// Buying costs more when the shelf is bare; selling pays less when it is full.
export function buyPrice(store, item) {
  const base = STORE_PRICES[item]; if (base == null) return null;
  const have = store.shelf[item] || 0;
  return Math.max(1, Math.round(base * (have <= 0 ? 1.8 : have < 3 ? 1.4 : have > 10 ? 0.8 : 1)));
}
export function sellPrice(store, item) {
  const base = STORE_PRICES[item]; if (base == null) return null;
  const have = store.shelf[item] || 0;
  return Math.max(0, Math.round(base * (have > 10 ? 0.3 : have > 5 ? 0.5 : 0.7)));
}
export function describeStore(store) {
  return Object.entries(store.shelf).filter(([, n]) => n >= 1).map(([k, n]) => `${k} ${Math.floor(n)} (buy ${buyPrice(store, k)}, sells for ${sellPrice(store, k)})`).join(', ') || 'an empty shelf';
}

// Things you build for your own house, with coin and materials.
export const UPGRADES = {
  garden:   { label: 'garden',      cost: { coin: 6, wood: 2, fiber: 2 },  effect: 'a garden by the house: a little food every night from spring to autumn, and herbs' },
  bighouse: { label: 'bigger house', cost: { coin: 15, wood: 10, stone: 4 }, effect: 'room for a family: warmer nights, and everyone under the roof rests better' },
  fence:    { label: 'fence',       cost: { coin: 4, wood: 8 },           effect: 'a fence around the garden and yard' },
};

export function newInventory() {
  const inv = {};
  for (const m of MATERIALS) inv[m] = 0;
  for (const k of Object.keys(ITEMS)) inv[k] = 0;
  inv.food = 1;
  inv.coin = 3;
  return inv;
}

export function canCraft(inv, item) {
  const r = ITEMS[item]?.recipe; if (!r) return false;
  return Object.entries(r).every(([k, n]) => (inv[k] || 0) >= n);
}
export function craft(inv, item) {
  if (!canCraft(inv, item)) return false;
  for (const [k, n] of Object.entries(ITEMS[item].recipe)) inv[k] -= n;
  inv[item] = (inv[item] || 0) + 1;
  return true;
}
export function craftable(inv) { return Object.keys(ITEMS).filter(k => canCraft(inv, k)); }

// Tools wear. Returns true if the tool broke.
export function wear(a, tool) {
  a.wear = a.wear || {};
  a.wear[tool] = (a.wear[tool] || 0) + 1;
  if (a.wear[tool] >= ITEMS[tool].durability) { a.wear[tool] = 0; a.inv[tool] -= 1; return true; }
  return false;
}

export function describeInventory(inv) {
  const parts = [];
  for (const m of MATERIALS) if (inv[m] >= 0.5) parts.push(`${m === 'food' ? inv.food.toFixed(1) : Math.floor(inv[m])} ${m}`);
  for (const k of Object.keys(ITEMS)) if (inv[k] > 0) parts.push(`${inv[k]} ${ITEMS[k].label}${inv[k] > 1 ? 's' : ''}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

export function describeBuilds(builds) {
  return Object.entries(BUILDS).map(([k, b]) => {
    const s = builds[k];
    if (s?.done) return `the ${b.label} stands`;
    const have = Object.entries(b.cost).map(([m, n]) => `${Math.floor(s?.have?.[m] || 0)}/${n} ${m}`).join(', ');
    return `the ${b.label} is unbuilt (${have})`;
  });
}
