// The fallback brain. Runs when an agent has no owner, or its owner's browser
// is closed or slow. Deliberately simple: needs first, then whatever the wounds
// push toward, then things. It exists so the village never freezes.

import { branch } from './wounds.js';
import * as I from './items.js';
import { artFor } from './arts.js';
import { ELEMENT } from './chart.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// What this person would vote for, from what their own life lacks.
export function preferBuild(a, s) {
  const opts = s.ballot?.options || []; if (!opts.length) return null;
  const has = (k) => opts.includes(k);
  const b = a.body;
  if ((b.food < 0.5 || a.inv.food < 1) && has('granary')) return 'granary';
  if ((b.food < 0.5 || a.inv.food < 1) && has('wellhouse')) return 'wellhouse';
  if (b.warmth < 0.5 && has('hall')) return 'hall';
  if ((s.ill || (s.sickNear || []).length || b.hurt > 0.3) && has('bathhouse')) return 'bathhouse';
  if ((a.children || []).length && has('school')) return 'school';
  if (((a.grief || []).length || (b.joy ?? 0.5) < 0.45 || b.tightness > 0.5) && has('commons')) return 'commons';
  if ((a.inv.coin || 0) >= 10 && has('road')) return 'road';
  if (has('commons') && Math.random() < 0.4) return 'commons';
  return pick(opts);
}

// How likely someone is to walk out into the pale on a given moment. The restless go more often,
// and anyone who has just heard a legend told at the fire goes far more often than that: wonder
// runs 0 to 1 and multiplies the chance by up to four. It wears off in a few days if nobody
// tells it again, so a story has to keep being told to keep sending people out.
export const scoutChance = (a) => (a.traits?.need < 0.5 ? 0.08 : 0.04) * (1 + (a.wonder || 0) * 3);

export function scriptedDecide(a, s) {
  const b = a.body;
  const br = branch(a);
  const isDay = s.tick >= 1 && s.tick <= 3;
  const inv = a.inv;
  const winterComing = s.weather.season === 'autumn' || s.weather.season === 'winter';

  // Survival first.
  if (b.warmth < 0.3) return s.hearthWood > 0 || s.builds?.hall?.done ? { type: 'go', to: 'hearth', thought: 'Cold. The fire.' } : { type: 'withdraw', thought: 'Cold. Home.' };
  if (b.food < 0.5 && inv.food < 0.5) {
    // Coin buys food in any season; deer are meat in any season; the creek gives fish under the ice.
    const price = s.store?.prices?.food?.buy || 2;
    if (isDay && (inv.coin || 0) < price && (s.bank?.savings || 0) >= 1 && (s.bank?.coin || 0) >= 1) return { type: 'draw', n: Math.min(6, s.bank.savings), thought: 'What I put by, for now.' };
    if (isDay && (inv.coin || 0) >= price && (s.store?.shelf?.food || 0) >= 1) return { type: 'buy', item: 'food', n: Math.max(1, Math.min(5, Math.floor((inv.coin || 0) / price), Math.floor(s.store.shelf.food))), thought: 'Coin is no good in the belly.' };
    if (isDay && (s.deer || 0) > 0 && b.energy > 0.4 && b.warmth > 0.35) return { type: 'hunt', to: 'forest', thought: 'Deer. Meat.' };
    if (isDay && s.found?.creek && b.warmth > 0.4) return { type: 'forage', to: 'creek', thought: 'Fish, even now.' };
    if (s.yieldToday > 0.1 && isDay) return { type: 'work', to: 'field', thought: 'Hungry. Work.' };
    if (isDay && s.weather.season !== 'winter') return { type: 'forage', to: 'meadow', thought: 'Berries, at least.' };
    const giver = s.near.find(n => n.trust > 0.2);
    if (giver && br !== 'inward') return { type: 'talk', target: giver.id, say: 'I have nothing to eat.', thought: 'Ask.' };
  }
  if (b.energy < 0.25) return { type: 'rest', thought: 'Spent.' };
  // The old rest more and go to the hearth rather than the field.
  const age = s.age ?? 40;
  if (age >= 80 && b.energy < 0.5) return { type: 'rest', thought: 'These bones.' };
  if (age >= 80 && isDay && Math.random() < 0.5) return s.near.length ? { type: 'talk', target: pick(s.near).id, say: pick(OLD_TALK), thought: 'Company, while there is time.' } : { type: 'go', to: 'hearth', thought: 'The fire, and faces.' };
  if (b.hurt > 0.3 && inv.salve <= 0 && I.canCraft(inv, 'salve')) return { type: 'craft', item: 'salve', thought: 'Salve for this.' };
  if (s.hearthWood < 2 && s.weather.cold > 0.3 && isDay && Math.random() < 0.4) return { type: 'work', to: 'forest', thought: 'Wood before the cold.' };

  const believes = a.belief ?? 0;
  // Someone near is in a bad way.
  const suffering = s.near.find(n => n.overwhelmed || n.tightness > 0.5);
  if (suffering) {
    if (br === 'healed' || (br === 'open' && b.openness > 0.45) || (believes > 0.4 && br !== 'outward' && Math.random() < 0.5)) return { type: 'comfort', target: suffering.id, thought: believes > 0.4 ? 'It will come right. Sit with them.' : 'I know that look.' };
    if (believes < -0.4 && Math.random() < 0.5) return { type: 'withdraw', thought: 'Not my trouble. It never ends well.' };
    if (br === 'outward' && b.tightness > 0.4 && suffering.trust < 0.3) return { type: 'strike', target: suffering.id, thought: 'Weak. Get it away from me.' };
    if (br === 'inward') return { type: 'withdraw', thought: 'Too much.' };
  }
  const hungry = s.near.find(n => n.hungry);
  if (hungry && inv.food >= 0.6 && (br === 'healed' || br === 'open')) return { type: 'share', target: hungry.id, thought: 'They need it more.' };

  // Wound-driven defaults.
  if (br === 'inward' && b.tightness > 0.4) return { type: 'withdraw', thought: 'Alone is safer.' };
  const temper = a.traits?.temper ?? 0.5;
  if (br === 'outward' && b.tightness > 0.75 - temper * 0.4) {
    const victim = s.near.find(n => n.trust < 0.2);
    if (victim) return { type: 'strike', target: victim.id, thought: 'Before they do.' };
  }
  // An outward, tight, tempered person near someone who has what they want may just take it.
  if (br === 'outward' && temper > 0.6 && b.tightness > 0.5 && a.wants && inv[a.wants] <= 0) {
    const mark = s.near.find(n => n.trust < 0.1 && n.carries?.[a.wants] > 0);
    if (mark) return { type: 'take', target: mark.id, item: a.wants, thought: 'Mine now.' };
  }

  // Family first. A child of yours in front of you who is hungry or crying gets tended, if you are able.
  const myChild = s.near.find(n => n.isChild && (a.children || []).includes(n.id) && (n.hungry || n.overwhelmed || n.tightness > 0.5));
  if (myChild && br !== 'inward' && br !== 'outward') return { type: 'tend', target: myChild.id, thought: 'Mine.' };
  if (myChild && br === 'outward' && b.tightness > 0.6) return { type: 'withdraw', thought: 'Stop that noise.' };
  const anyChild = s.near.find(n => n.isChild && (n.hungry || n.overwhelmed));
  if (anyChild && (br === 'healed' || br === 'open') && inv.food >= 1) return { type: 'tend', target: anyChild.id, thought: 'Someone has to.' };
  // Someone hurt your child. Attached parents do not let that stand.
  if (a.avenge) { const who = s.near.find(n => n.id === a.avenge); if (who && br !== 'inward') { a.avenge = null; return { type: 'strike', target: who.id, thought: 'Never again. Not my child.' }; } }
  // Ask someone you trust to stay. The open and the healed dare; the wounded rarely do.
  if (!a.partner && (br === 'open' || br === 'healed') && age >= 18 && age <= 60 && Math.random() < 0.08) {
    const beloved = s.near.find(n => n.trust > 0.6 && !n.isChild && !n.partner);
    if (beloved) return { type: 'bond', target: beloved.id, thought: 'Stay.' };
  }
  // A thin bond and a short fuse, and someone walks out.
  if (a.partner && (a.bondStrength ?? 1) < 0.2 && br === 'outward' && Math.random() < 0.1) return { type: 'leave', thought: 'Done with this.' };

  // In need, some people talk to the sky.
  if ((b.food < 0.3 || b.warmth < 0.3 || a.grief?.length) && (a.faith ?? 0) > -0.5 && Math.random() < 0.04) {
    const ask = b.food < 0.3 ? 'Let the field give something.' : b.warmth < 0.3 ? 'Let the cold ease, just for tonight.' : `Keep ${a.grief[0].name} somewhere warm.`;
    return { type: 'pray', say: ask, thought: 'Someone might be listening.' };
  }

  // Grief looks for company. Two grievers together share it; the open comfort the grieving.
  if (a.grief?.length) {
    const fellow = s.near.find(n => n.grieving);
    if (fellow) return { type: 'talk', target: fellow.id, say: `I keep thinking about ${a.grief[0].name}.`, thought: 'They knew them too.' };
    if (b.openness > 0.35 && isDay && Math.random() < 0.3) return { type: 'go', to: 'hearth', thought: 'I do not want to be alone with it.' };
  }
  const griever = s.near.find(n => n.grieving && !a.grief?.length);
  if (griever && (br === 'healed' || br === 'open') && Math.random() < 0.5) return { type: 'comfort', target: griever.id, thought: 'Sit with them.' };

  // What the village learned the hard way.
  const lessons = (s.lessons || []).map(l => l.kind);
  const foodFloor = lessons.includes('hunger') ? 2.5 : 1.5;
  if (lessons.includes('cold') && inv.blanket <= 0 && isDay) {
    if (I.canCraft(inv, 'blanket')) return { type: 'craft', item: 'blanket', thought: 'Not like them.' };
    if (inv.fiber < 5) return { type: 'forage', to: 'meadow', thought: 'Fiber. Not like them.' };
  }

  // Something is coming, and they know it. Those with the strength get ready.
  if (s.threat && isDay && b.energy > 0.35 && Math.random() < 0.5) {
    const t = s.threat.kind, days = s.threat.days;
    if (t === 'cold') { if (inv.blanket <= 0 && I.canCraft(inv, 'blanket')) return { type: 'craft', item: 'blanket', thought: 'Before the cold.' }; if (inv.blanket <= 0 && inv.fiber < 3) return { type: 'forage', to: 'meadow', thought: 'Fiber for a blanket.' }; if (s.hearthWood < 12) return { type: 'work', to: 'forest', thought: `Wood. ${days} days.` }; }
    if (t === 'wolves') { if (a.location.startsWith('wild:') || a.location === 'edge') return { type: 'withdraw', thought: 'Not out here. Not now.' }; if (s.pets?.length && a.location !== 'home' && days <= 2) return { type: 'withdraw', thought: 'Bring them in. Bar the door.' }; }
    if (t === 'sickness') { if (inv.salve <= 0 && I.canCraft(inv, 'salve')) return { type: 'craft', item: 'salve', thought: 'Salve, before it comes.' }; if (inv.herbs < 3) return { type: 'forage', to: 'forest', thought: 'Herbs. Everyone will need them.' }; }
    if (t === 'drought' || t === 'frost' || t === 'flood') { const price = s.store?.prices?.food?.buy || 2; if (inv.food < 4 && (inv.coin || 0) >= price && (s.store?.shelf?.food || 0) >= 1) return { type: 'buy', item: 'food', n: Math.max(1, Math.min(4, Math.floor((inv.coin || 0) / price), Math.floor(s.store.shelf.food))), thought: 'Lay it by.' }; if (s.yieldToday > 0.1 && inv.food < 6) return { type: 'work', to: 'field', thought: 'Bring it in while it gives.' }; }
    if (t === 'raiders') { if (inv.axe <= 0 && I.canCraft(inv, 'axe')) return { type: 'craft', item: 'axe', thought: 'Something in my hands when they come.' }; if (inv.axe <= 0 && inv.wood < 3) return { type: 'forage', to: 'forest', thought: 'Wood for an axe.' }; if (days <= 2 && a.location !== 'hearth') return { type: 'go', to: 'hearth', thought: 'Together, at the fire.' }; }
    if (t === 'fire') { if (inv.stone < 3) return { type: 'forage', to: 'quarry', thought: 'Stone. Stone does not burn.' }; }
  }

  // The arts. Sadness wants a shape; the grieving and the low make something of it, and makers show what they made.
  const grieving = (a.grief || []).some(g => g.intensity > 0.3);
  if ((grieving || (b.joy ?? 0.5) < 0.4) && inv.food >= 0.5 && b.energy > 0.35 && Math.random() < 0.22) {
    const mine = a.art || (a.art = artFor(a.chart, ELEMENT));
    const canPaint = (inv.berries || 0) >= 1 || (inv.clay || 0) >= 1;
    const art = mine === 'pottery' && (inv.clay || 0) < 2 ? (canPaint ? 'painting' : 'poem') : mine;
    return { type: 'make', art, thought: grieving ? 'Put it somewhere outside me.' : 'Make something.' };
  }
  if ((s.works || 0) > 0 && s.near.length && a.location === 'hearth' && Math.random() < 0.08) return { type: 'show', thought: 'Let them hear it.' };
  // Sickness: the sick rest and dose themselves; the well treat the sick beside them if they carry medicine.
  if (s.ill) { if ((inv.salve || 0) > 0 || (inv.herbs || 0) >= 1 || (inv.tonic || 0) > 0) { if (Math.random() < 0.5) return { type: 'treat', thought: 'Something for it.' }; } if (a.location !== 'home' || Math.random() < 0.7) return { type: 'rest', thought: 'Bed. Everything aches.' }; }
  if ((s.sickNear || []).length && ((inv.salve || 0) > 0 || (inv.herbs || 0) >= 1 || (inv.tonic || 0) > 0) && Math.random() < 0.6) { const who = s.near.find(n => n.ill); if (who) return { type: 'treat', target: who.id, thought: `${who.name} is burning up.` }; }
  if ((s.sickNear || []).length && (inv.herbs || 0) < 1 && isDay && b.energy > 0.5 && Math.random() < 0.3) return { type: 'forage', to: 'forest', thought: 'Herbs. Someone is sick.' };
  // A holiday: everyone who is not starving goes to the fire, dances, and sings the song.
  if (s.holiday && isDay && b.food > 0.3 && !s.ill && Math.random() < 0.75) return { type: 'celebrate', say: Math.random() < 0.4 ? pick(SONG_LINES) : '', thought: `${s.holiday.name}.` };
  // Babies. One parent stays unless someone else is minding; a neighbour goes to a baby crying alone.
  if (isDay && (s.infants || []).length) {
    const baby = s.infants[0];
    const other = baby.otherParent;
    const someoneElse = baby.minder && baby.minder !== a.id;
    if (!someoneElse) {
      const myTurn = !other || (s.day % 2 === 0) === (a.id < other);
      if (myTurn || inv.food < 0.8 && Math.random() < 0.3) return { type: 'tend', target: baby.id, thought: `${baby.name}. Someone has to stay.` };
    }
  }
  if (isDay && (s.infantsAlone || []).length && b.openness > 0.5 && !(s.infants || []).length && Math.random() < 0.35) return { type: 'mind', target: s.infantsAlone[0].id, thought: 'That baby is alone. I can hear it.' };
  // Animals: take in a stray when the heart is low; sit with your animal; hunt when the larder is thin.
  if (s.strays?.length && (b.joy ?? 0.5) < 0.55 && inv.food >= 1 && Math.random() < 0.5) return { type: 'adopt', thought: 'It keeps looking at me.' };
  if (s.pets?.length && (b.joy ?? 0.5) < 0.5 && Math.random() < 0.2) return { type: 'pet', animal: s.pets[0].name, thought: `${s.pets[0].name}.` };
  if (isDay && inv.food < 1.5 && (s.deer || 0) > 0 && b.energy > 0.5 && ['meadow', 'forest'].includes(a.location) && Math.random() < 0.3) return { type: 'hunt', to: a.location, thought: 'Deer.' };
  if (a.location === 'store' && (inv.coin || 0) >= 8 && (s.store?.shelf?.hen || 0) > 0 && !(s.pets || []).some(p => p.kind === 'hen') && inv.food >= 2 && Math.random() < 0.15) return { type: 'buy', item: 'hen', thought: 'Eggs every morning.' };
  // A gift, used when it plainly fits and the body can pay for it.
  if (a.gift && b.energy > 0.7 && (a.castsToday || 0) < 1 && Math.random() < 0.25) {
    const k = a.gift.kind;
    const hurt = s.near.find(n => n.visible?.includes('injured'));
    const cold = s.near.find(n => n.visible?.includes('shivering'));
    const wounded = s.near.find(n => n.tightness > 0.5 && n.trust > 0);
    if (k === 'kindling' && (cold || (s.hearthWood ?? 9) < 3)) return cold ? { type: 'cast', target: cold.id, thought: 'Warm them.' } : { type: 'cast', to: 'hearth', thought: 'The fire is low. I can fix that.' };
    if (k === 'greenhand' && hurt) return { type: 'cast', target: hurt.id, thought: 'Let it close.' };
    if (k === 'greenhand' && !hurt && inv.food < 1.5 && isDay && a.location === 'field') return { type: 'cast', to: 'field', thought: 'Wake the ground.' };
    if (k === 'seeing' && wounded) return { type: 'cast', target: wounded.id, thought: 'Let me see what runs you.' };
    if (k === 'farsight' && s.frontierLeft > 0 && ['edge', 'road'].includes(a.location)) return { type: 'cast', to: 'edge', thought: 'I can see what is out there.' };
  }
  // Something that is not work. When the larder allows and the body is dry, joy comes first.
  const joy = b.joy ?? 0.5;
  if (isDay && inv.food >= 1 && b.food > 0.4 && (joy < 0.35 || (joy < 0.6 && Math.random() < 0.25))) {
    const friend = s.near.find(n => n.trust > 0.4 && !n.isChild);
    const roll = Math.random();
    if (friend && roll < 0.3) return { type: 'walk', target: friend.id, say: pick(WALK_TALK), thought: 'A long walk with someone.' };
    if (s.near.length >= 2 && a.location === 'hearth' && roll < 0.45) return { type: 'sing', say: pick(SONG_LINES), thought: 'A song.' };
    if (roll < 0.55) { const mine = a.hobby || (a.hobby = pick(Object.keys(I.HOBBIES))); return { type: 'hobby', what: mine, thought: `${mine}. For me.` }; }
    if (roll < 0.8) return { type: 'sit', to: s.found?.creek ? 'creek' : s.found?.grove ? 'grove' : 'meadow', thought: 'Sit by the water.' };
    return { type: 'walk', to: s.found?.creek ? 'creek' : 'meadow', thought: 'Walk it off.' };
  }
  if (isDay && a.hobby && (a.skills?.[a.hobby] || 0) >= 8 && Math.random() < 0.12 && I.canCraft(inv, I.HOBBIES[a.hobby].item)) return { type: 'hobby', what: a.hobby, thought: 'The hands want to work.' };
  // Share a pie with someone you like; give a toy to a child.
  if ((inv.pie || 0) >= 1) { const f = s.near.find(n => n.trust > 0.3 && !n.isChild); if (f) return { type: 'share', target: f.id, thought: 'Pie.' }; }
  if ((inv.toy || 0) >= 1) { const c = s.near.find(n => n.isChild); if (c) return { type: 'give', target: c.id, item: 'toy', thought: 'For the little one.' }; }

  // Bread before things. Nobody forages for a charm on an empty larder.
  if (isDay && inv.food < foodFloor && s.yieldToday > 0.1) return { type: 'work', to: 'field', thought: lessons.includes('hunger') ? 'Never again.' : 'Food first.' };

  // Things. Make what you can; want what you want.
  if (inv.blanket <= 0 && winterComing) {
    if (I.canCraft(inv, 'blanket')) return { type: 'craft', item: 'blanket', thought: 'Winter is coming.' };
    if (I.canCraft(inv, 'rope') && inv.fiber >= 5) return { type: 'craft', item: 'rope', thought: 'Rope first.' };
    if (isDay && inv.fiber < 5) return { type: 'forage', to: 'meadow', thought: 'Fiber for a blanket.' };
  }
  if (a.wants && inv[a.wants] <= 0) {
    if (I.canCraft(inv, a.wants)) return { type: 'craft', item: a.wants, thought: 'At last.' };
    const need = missing(inv, a.wants);
    if (need && isDay && Math.random() < 0.5) return { type: 'forage', to: sourceOf(need), thought: `I need ${need}.` };
  }
  // Generous people give what a friend longs for.
  if (br === 'healed' || br === 'open') {
    const friend = s.near.find(n => n.trust > 0.4 && n.wants && n.carries?.[n.wants] <= 0 && inv[n.wants] > 1);
    if (friend) return { type: 'give', target: friend.id, item: friend.wants, thought: 'They have wanted this a long time.' };
  }
  // Barter first, with someone near you trust: your surplus for what you lack.
  if (s.near.length && Math.random() < 0.35) {
    const wantFor = a.wants && inv[a.wants] <= 0 ? missing(inv, a.wants) : (winterComing && inv.blanket <= 0 ? missing(inv, 'blanket') : null);
    if (wantFor && (inv[wantFor] || 0) < 2) {
      const mine = ['wood', 'stone', 'fiber', 'fish', 'berries', 'clay', 'herbs'].filter(x => x !== wantFor && (inv[x] || 0) >= 4).sort((x, y) => (inv[y] || 0) - (inv[x] || 0))[0];
      const partner = s.near.find(n => n.trust > 0.1 && (n.carries?.[wantFor] || 0) >= 3);
      if (mine && partner) return { type: 'trade', target: partner.id, give: mine, n: 2, want: wantFor, m: 2, thought: `My ${mine} for their ${wantFor}.` };
    }
  }

  // Coin. Sell what piles up, buy what you lack, build for the house when you can.
  const store = s.store;
  // Paid work: when the store posts wages, bring the project what it still lacks, not what it has.
  if (store?.project && isDay) {
    const spec = I.BUILDS[store.project]; const have = s.builds?.[store.project]?.have || {};
    const lacking = spec ? Object.entries(spec.cost).filter(([m, n]) => m !== 'coin' && (have[m] || 0) < n).map(([m]) => m) : [];
    const carry = lacking.find(m => (inv[m] || 0) >= 3);
    if (carry && Math.random() < 0.6) return { type: 'build', what: store.project, thought: `${carry} for the ${store.project}. It pays.` };
    // Rope is made, not found: twist fiber into it, or go get fiber.
    if (lacking.includes('rope')) {
      if (I.canCraft(inv, 'rope')) return { type: 'craft', item: 'rope', thought: `Rope for the ${store.project}.` };
      if ((inv.fiber || 0) < 2 && Math.random() < 0.4) return { type: 'forage', to: 'meadow', thought: `Fiber for rope for the ${store.project}.` };
    }
    const need = lacking.find(m => Object.values(I.FORAGE).some(t => t[m]) && (!['creek', 'grove', 'claypit'].includes(sourceOf(m)) || s.found?.[sourceOf(m)]));
    if (need && Math.random() < 0.35) return { type: 'forage', to: sourceOf(need), thought: `${need} for the ${store.project}. It pays.` };
    if (lacking.includes('wood') && Math.random() < 0.3) return { type: 'work', to: 'forest', thought: `Wood for the ${store.project}.` };
  }
  // Borrow when hungry and broke; pay back when flush.
  if (s.bank && isDay && b.food < 0.35 && inv.food < 0.3 && (inv.coin || 0) < 2 && !s.bank.owed && !s.bank.defaulted) return { type: 'borrow', n: 6, thought: 'I will pay it back.' };
  if (s.bank && isDay && (inv.coin || 0) >= 8 && s.bank.owed > 0) return { type: 'repay', n: 4, thought: 'Owe less.' };
  // The vote. Everyone with a stake goes to the meeting house once while a ballot is open.
  if (s.ballot && !s.ballot.voted && isDay && Math.random() < 0.45) return { type: 'vote', for: preferBuild(a, s), thought: 'My hand, for what we need.' };
  // The other fire. The open and the healed, with food to spare, go and leave some at the edge when things are cold between the fires.
  if (s.rival && s.rival.mood !== 'friendly' && s.rival.mood !== 'warm' && inv.food >= 4 && (br === 'open' || br === 'healed') && isDay && Math.random() < 0.05) return { type: 'send', n: 2, thought: 'Better a friend out there than an enemy.' };
  // Savings: coin in the bank cannot be taken, and grows.
  if (s.bank && isDay && (inv.coin || 0) >= 15 && inv.food >= 1.5 && !s.bank.owed && Math.random() < 0.12) return { type: 'deposit', n: Math.floor((inv.coin || 0) / 2), thought: 'Where no one can take it.' };
  if (store && isDay) {
    if (b.food < 0.4 && inv.food < 0.3 && (inv.coin || 0) >= (store.prices?.food?.buy || 2) && (store.shelf.food || 0) >= 1) return { type: 'buy', item: 'food', n: 2, thought: 'Buy something to eat.' };
    if (winterComing && inv.blanket <= 0 && (inv.coin || 0) >= (store.prices?.blanket?.buy || 10) && (store.shelf.blanket || 0) >= 1) return { type: 'buy', item: 'blanket', n: 1, thought: 'A blanket before the snow.' };
    const surplus = ['wood', 'stone', 'fiber', 'fish', 'berries', 'clay'].find(m => (inv[m] || 0) >= 8 && (store.prices?.[m]?.sell || 0) > 0);
    if (surplus && Math.random() < 0.4) return { type: 'sell', item: surplus, n: 4, thought: 'Turn some of this into coin.' };
    if (inv.food >= 4 && (store.prices?.food?.sell || 0) > 0 && Math.random() < 0.3) return { type: 'sell', item: 'food', n: 2, thought: 'More than I can eat.' };
  }
  if (a.location === 'home' || Math.random() < 0.15) {
    const ups = a.upgrades || {};
    for (const [k, u] of Object.entries(I.UPGRADES)) {
      if (ups[k]) continue;
      if (Object.entries(u.cost).every(([m, n]) => (inv[m] || 0) >= n)) return { type: 'upgrade', what: k, thought: `A ${u.label}. Ours.` };
    }
  }

  // Bread when the larder allows; the open break it with friends.
  if (inv.food >= 2.5 && inv.wood >= 1 && inv.bread < 2 && Math.random() < 0.3) return { type: 'craft', item: 'bread', thought: 'Bread.' };
  if (inv.bread >= 1 && (br === 'open' || br === 'healed')) { const friend = s.near.find(n => n.trust > 0.3 && n.hungry); if (friend) return { type: 'share', target: friend.id, thought: 'Break bread.' }; }
  // The young and the restless walk out past the edge when the village can spare them.
  if (s.exploring && isDay && b.energy > 0.3 && b.warmth > 0.3) return { type: 'scout', thought: 'Keep walking. The land is not done.' };
  if (((s.frontierLeft || 0) > 0 || (s.unexplored || 0) > 0.05) && isDay && age < 45 && b.energy > 0.6 && inv.food >= 1.5 && s.weather.season !== 'winter' && (br === 'open' || br === 'healed') && Math.random() < scoutChance(a)) return { type: 'scout', thought: (a.wonder || 0) > 0.3 ? 'They told it at the fire. I want to see it myself.' : 'What is out there?' };
  // Fish, if there is a creek and the field is thin.
  if (s.found?.creek && isDay && inv.food < 1.5 && Math.random() < 0.4) return { type: 'forage', to: 'creek', thought: 'The creek.' };
  // Build when carrying a surplus.
  // The old shared builds anyone may start; what the council raises is chosen at the meeting house first.
  const unbuilt = s.council?.project || Object.keys(I.BUILDS).find(k => !I.BUILDS[k].civic && !s.builds?.[k]?.done);
  if (unbuilt && ((inv.wood >= 4) || (inv.stone >= 3)) && Math.random() < 0.5) return { type: 'build', what: unbuilt, thought: `The ${I.BUILDS[unbuilt].label}.` };
  if (isDay && Math.random() < 0.2) return { type: 'forage', to: pick(['forest', 'quarry', 'meadow']), thought: 'See what there is.' };

  // Ordinary day.
  if (isDay && (inv.food < 1.2 || Math.random() < 0.35)) return { type: 'work', to: 'field', thought: 'The field.' };
  if (s.near.length && b.openness > 0.4) {
    const o = pick(s.near);
    return { type: 'talk', target: o.id, say: pick(SMALL_TALK), thought: 'Company.' };
  }
  if (b.openness > 0.45) return { type: 'go', to: pick(['hearth', 'well', 'hearth']), thought: 'Where people are.' };
  return { type: 'withdraw', thought: 'Home.' };
}

// First material missing for an item, following sub-recipes one level.
function missing(inv, item) {
  for (const [m, n] of Object.entries(I.ITEMS[item]?.recipe || {})) {
    if ((inv[m] || 0) >= n) continue;
    if (I.ITEMS[m]) { const sub = missing(inv, m); return sub || null; }
    return m;
  }
  return null;
}
function sourceOf(material) {
  for (const [place, table] of Object.entries(I.FORAGE)) if (table[material]) return place;
  return 'meadow';
}

const OLD_TALK = [
  'I remember when the field gave twice this.', 'You young ones work too hard.', 'Sit. Tell me something.',
  'My hands are no good in the cold anymore.', 'I have buried better people than me.', 'Winter was worse when I was young. Or I was.',
];
const WALK_TALK = ['Come walk with me. I need to get out of here for a while.', 'Walk with me to the water?', 'I do not want to talk. Just walk.', 'Show me the grove again.'];
const SONG_LINES = ['Oh the winter is long and the fire is low', 'Down by the creek where the cold water runs', 'My mother sang this when the snow came', 'Carry me home when the field is done'];
const SMALL_TALK = [
  'Cold one.', 'The field was thin today.', 'You look tired.', 'Sit a while.', 'Did you sleep?',
  'There is wood left.', 'I saw you at the well.', 'Long day.', 'Stay by the fire.', 'I found stone at the quarry.',
];

export function scriptedSummary(a) {
  const br = branch(a);
  const raised = { warm: 'raised warm', cold: 'raised cold', inconsistent: 'raised never knowing' }[a.upbringing];
  const shape = {
    open: 'I am mostly at ease with people.',
    healed: 'I have been hurt and it has let go. I notice when others hurt.',
    outward: 'I do not let anyone get the better of me.',
    inward: 'I keep to myself. It is safer.',
  }[br];
  return `${a.name}, ${raised}. ${shape}`;
}
