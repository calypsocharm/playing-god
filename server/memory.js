// Long-term memory lives here, on the machine that hosts the world.
// Each agent's life is a file. The hash of that file is what an NFT would point at.

import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const WORLD = path.join(DATA, 'world.json');
const AGENTS = path.join(DATA, 'agents');

export async function load() {
  try {
    const txt = await fs.readFile(WORLD, 'utf8');
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

export async function save(world) {
  await fs.mkdir(AGENTS, { recursive: true });
  const tmp = WORLD + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(world));
  await fs.rename(tmp, WORLD);
  // One file per agent: the record a token could point at.
  for (const a of world.agents) {
    const life = {
      id: a.id, name: a.name, chart: a.chart, upbringing: a.upbringing, bornDay: a.bornDay, diedDay: a.diedDay ?? null,
      wounds: a.wounds, scars: a.scars, trust: a.trust, selfSummary: a.selfSummary, memories: a.memories,
      inv: a.inv, wants: a.wants, diary: a.diary, notes: a.notes, commune: a.commune || [],
    };
    const txt = JSON.stringify(life, null, 1);
    a.record.hash = 'sha256:' + createHash('sha256').update(txt).digest('hex');
    await fs.writeFile(path.join(AGENTS, `${a.id}.json`), txt);
  }
}
