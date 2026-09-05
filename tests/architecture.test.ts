import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SIM_DIRS = ['src/core', 'src/wave', 'src/rider', 'src/tricks', 'src/scoring', 'src/goals', 'src/world', 'src/save'];
const FORBIDDEN = [/from\s+['"]three['"]/, /from\s+['"]three\//, /\bdocument\./, /\bwindow\./, /requestAnimationFrame/];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('architecture: simulation modules are renderer-free', () => {
  for (const dir of SIM_DIRS) {
    for (const file of walk(dir)) {
      it(`${file} has no three/DOM imports`, () => {
        const src = readFileSync(file, 'utf8');
        for (const re of FORBIDDEN) expect(src, `${file} matches ${re}`).not.toMatch(re);
      });
    }
  }
  it('covers at least the core dir', () => {
    expect(walk('src/core').length).toBeGreaterThan(0);
  });
});
