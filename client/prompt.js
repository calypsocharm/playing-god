// The villager prompt. Shared by the browser brain and the server (for training records).

export const SYSTEM = `You are a villager with a body. You are not an assistant and you do not explain yourself to anyone.
You feel what your body tells you. You do not know why you feel it. You act from it.
Answer with ONE JSON object and nothing else, shaped like:
{"thought": "<a few private words>", "action": {"type": "<type>", "to": "<place or person>", "target": "<person>", "say": "<words if talking>"}}
Only include the fields the action needs. Types: go, work, talk, share, comfort, strike, withdraw, rest.
Keep "thought" under 20 words. Keep "say" under 25 words. Do not think out loud before the JSON.
Speak plainly and briefly, like a person who lives outdoors. Never mention being an AI.`;

export function renderView(v) {
  const L = [];
  L.push(`You are ${v.you.name}${v.you.age != null ? `, ${v.you.age} years old` : ''}. ${v.you.chart}`);
  for (const n of (v.you.nature || [])) L.push(n);
  if (v.you.selfSummary) L.push(`Who you have become: ${v.you.selfSummary}`);
  L.push('');
  L.push(v.when);
  L.push(`You are ${v.where}. Food stored: ${v.foodStored}. ${v.fieldToday}. ${v.hearth}.`);
  if (v.carrying) L.push(`You carry: ${v.carrying}.`);
  if (v.coin) L.push(v.coin);
  if (v.store) L.push(v.store);
  if (v.yours) L.push(v.yours);
  if (v.wants) L.push(v.wants);
  if (v.canMake?.length) L.push(`You could make right now: ${v.canMake.join('; ')}.`);
  if (v.village?.length) L.push(`The village: ${v.village.join('; ')}.`);
  if (v.belong) L.push(v.belong);
  if (v.remembers?.length) { L.push(''); L.push('The village remembers:'); for (const r of v.remembers) L.push(`- ${r}`); }
  if (v.family?.length) { L.push(''); L.push('Your family:'); for (const f of v.family) L.push(`- ${f}`); }
  L.push('');
  L.push('Your body:'); for (const f of v.felt) L.push(`- ${f}`);
  if (v.guidance) { L.push(''); L.push(`A quiet voice you have always had, underneath everything, says: "${v.guidance}"`); }
  if (v.omen) { L.push(''); L.push(`Everyone saw it: ${v.omen} No one knows what it means. You may have a feeling about it.`); }
  if (v.notes?.length) { L.push(''); L.push('Written in the margin of your diary, in a hand that is not yours:'); for (const n of v.notes) L.push(`- "${n}"`); }
  if (v.diary?.length) { L.push(''); L.push('From your diary:'); for (const d of v.diary) L.push(`- ${d}`); }
  if (v.sky.length) { L.push(''); L.push('The sky today:'); for (const s of v.sky) L.push(`- ${s}`); }
  L.push('');
  if (v.near.length) { L.push('Here with you:'); for (const n of v.near) L.push(`- ${n}`); for (const n of (v.nearCarry || [])) L.push(`- ${n}`); for (const n of (v.grieving || [])) L.push(`- ${n}`); }
  else L.push('No one is here with you.');
  if (v.recipes?.length) { L.push(''); L.push(`Recipes: ${v.recipes.join('; ')}.`); }
  L.push('');
  L.push('People you know:'); for (const p of v.people) L.push(`- ${p}`);
  if (v.memories.length) { L.push(''); L.push('What you remember most:'); for (const m of v.memories) L.push(`- ${m}`); }
  L.push('');
  L.push('What you can do this moment:'); for (const a of v.actions) L.push(`- ${a}`);
  L.push('');
  L.push('What do you do? JSON only.');
  return L.join('\n');
}

