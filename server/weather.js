// The player is the weather. These are the only dials the player gets.

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

export function newWeather() {
  return {
    daysPerSeason: 10,
    winterHarshness: 0.6,   // 0 mild .. 1 killing
    harvest: 0.7,           // 0 famine .. 1 plenty
    tickMs: 20000,          // real milliseconds per tick. A day is two minutes, a year is eighty.
    startDay: 0,
  };
}

export function seasonOf(day, w) {
  return SEASONS[Math.floor(day / w.daysPerSeason) % 4];
}

export function dayInSeason(day, w) {
  return day % w.daysPerSeason;
}

// How cold it is outdoors today, 0..1
export function coldToday(day, w) {
  const s = seasonOf(day, w);
  const t = dayInSeason(day, w) / w.daysPerSeason;
  switch (s) {
    case 'summer': return 0;
    case 'spring': return 0.3 * (1 - t);
    case 'autumn': return 0.1 + 0.3 * t;
    case 'winter': {
      // deepest mid-winter
      const depth = 1 - Math.abs(t - 0.5) * 2;
      return 0.35 + 0.65 * w.winterHarshness * (0.5 + 0.5 * depth);
    }
  }
}

// Food gathered per work action at the field today
export function fieldYield(day, w) {
  const s = seasonOf(day, w);
  const base = { spring: 0.35, summer: 0.6, autumn: 0.7, winter: 0.05 }[s];
  return base * (0.3 + 0.7 * w.harvest);
}

export function describe(day, w) {
  const s = seasonOf(day, w);
  const cold = coldToday(day, w);
  let sky;
  if (s === 'winter') sky = cold > 0.75 ? 'a killing cold, snow driving sideways' : cold > 0.5 ? 'snow, bitter wind' : 'grey and cold';
  else if (s === 'summer') sky = w.harvest > 0.5 ? 'warm, the fields full' : 'hot and dry, the fields thin';
  else if (s === 'autumn') sky = 'cool, leaves turning';
  else sky = 'mild, mud and new green';
  return { season: s, cold, sky };
}
