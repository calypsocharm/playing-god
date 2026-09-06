// Wounds are rules the body wrote. The agent cannot read them. It only feels them.
// A rule weakens each time its trigger happens and pain does not follow.
// When it reaches zero it becomes a scar: the sensitivity stays, the defence goes.

const RULES = {
  struck:    { trigger: 'weakness',  belief: 'weakness gets punished' },
  betrayed:  { trigger: 'closeness', belief: 'closeness leads to pain' },
  rebuffed:  { trigger: 'closeness', belief: 'reaching out gets you hurt' },
  abandoned: { trigger: 'asking',    belief: 'needing someone means being left' },
  loss:      { trigger: 'closeness', belief: 'the people you love disappear' },
};

let nextId = 1;

// event: { kind, by, trustBefore (-1..1), severity (0..1), day }
// Returns the rule written or reinforced, or null.
export function maybeWriteWound(agent, event) {
  const spec = RULES[event.kind];
  if (!spec) return null;
  // Hurt from someone you trusted cuts deeper. Hurt while already tight cuts deeper.
  const depth = event.severity * (0.6 + Math.max(0, event.trustBefore)) * (0.7 + agent.body.tightness * 0.6);
  if (depth < 0.4) return null;

  let rule = agent.wounds.find(w => w.trigger === spec.trigger);
  if (rule) {
    rule.strength = Math.min(1, rule.strength + 0.3);
    rule.reinforced = (rule.reinforced || 0) + 1;
    rule.lastDay = event.day;
    return rule;
  }
  rule = {
    id: nextId++,
    trigger: spec.trigger,
    belief: spec.belief,
    strength: Math.min(1, depth),
    from: event.by,
    kind: event.kind,
    day: event.day,
    lastDay: event.day,
    contradictions: 0,
    reinforced: 0,
  };
  agent.wounds.push(rule);
  return rule;
}

// Called at day end. `exposures` is a map trigger -> { happened: bool, painFollowed: bool }.
// Returns the list of rules that healed today.
export function processExposures(agent, exposures, day) {
  const healed = [];
  for (const rule of [...agent.wounds]) {
    const ex = exposures[rule.trigger];
    if (!ex || !ex.happened) continue;
    if (ex.painFollowed) {
      rule.strength = Math.min(1, rule.strength + 0.1);
      continue;
    }
    // Safe exposure. Open bodies heal faster. Fresh wounds resist.
    const age = Math.max(1, day - rule.day);
    const rate = (0.03 + agent.body.openness * 0.04 + Math.min(0.03, age * 0.002)) * (0.7 + (agent.body.joy ?? 0.5) * 0.6);
    rule.strength -= rate;
    rule.contradictions += 1;
    if (rule.strength <= 0) {
      agent.wounds = agent.wounds.filter(w => w !== rule);
      agent.scars.push({ trigger: rule.trigger, belief: rule.belief, healedDay: day, woundedDay: rule.day });
      healed.push(rule);
    }
  }
  return healed;
}

// Felt sense of the rules. Sensations only, never the belief in words.
export function woundFeltSense(agent, nearbyNames) {
  const s = [];
  for (const w of agent.wounds) {
    const strong = w.strength > 0.6;
    if (w.trigger === 'closeness' && nearbyNames.length)
      s.push(strong ? 'Your chest clamps when anyone comes near.' : 'You tense a little when someone comes close.');
    if (w.trigger === 'weakness')
      s.push(strong ? 'Showing hurt feels dangerous. Something in you wants to strike first.' : 'You dislike being seen weak.');
    if (w.trigger === 'asking')
      s.push(strong ? 'Asking for anything makes your throat close.' : 'You would rather not ask.');
  }
  for (const sc of agent.scars) {
    if (sc.trigger === 'closeness') s.push('You know what a locked chest feels like. You notice it in others.');
    if (sc.trigger === 'weakness') s.push('You remember being hurt when small. You notice fear in others.');
    if (sc.trigger === 'asking') s.push('You remember needing someone. You notice when someone needs.');
  }
  return s;
}

// A coarse label for the inspector and the scripted brain.
export function branch(agent) {
  const total = agent.wounds.reduce((a, w) => a + w.strength, 0);
  if (total < 0.3) return agent.scars.length ? 'healed' : 'open';
  // Energy and a weakness-rule push outward. Low energy and closeness-rules pull inward.
  const outward = agent.wounds.some(w => w.trigger === 'weakness') && agent.body.energy > 0.4;
  return outward ? 'outward' : 'inward';
}
