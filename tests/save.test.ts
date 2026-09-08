import { describe, expect, it } from 'vitest';
import { CareerSave, defaultCareer } from '@/save/career';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('career export and import', () => {
  it('round-trips a save through JSON and keeps the options', () => {
    const a = new CareerSave(memory());
    a.data.unlockedLevels.push('sandbar-2');
    a.data.options.feet = 'left-front';
    a.data.options.reducedMotion = true;
    a.save();
    const blob = a.exportJson();
    const b = new CareerSave(memory());
    expect(b.importJson(blob)).toBe(true);
    expect(b.data.unlockedLevels).toContain('sandbar-2');
    expect(b.data.options.feet).toBe('left-front');
    expect(b.data.options.reducedMotion).toBe(true);
    // and it was persisted
    expect(new CareerSave({ getItem: () => b.exportJson(), setItem: () => undefined }).data.options.feet).toBe('left-front');
  });

  it('rejects junk and other versions without touching the current save', () => {
    const s = new CareerSave(memory());
    s.data.unlockedLevels.push('reefpass-1');
    for (const bad of ['', 'not json', '{"version":2,"unlockedLevels":[]}', '{"version":1}', '[]', 'null']) {
      expect(s.importJson(bad)).toBe(false);
      expect(s.data.unlockedLevels).toContain('reefpass-1');
    }
  });

  it('fills missing fields of an older export with the defaults', () => {
    const s = new CareerSave(memory());
    const old = { version: 1, unlockedLevels: ['sandbar-1'], options: { controls: 'classic' } };
    expect(s.importJson(JSON.stringify(old))).toBe(true);
    expect(s.data.options.controls).toBe('classic');
    expect(s.data.options.press).toBe(defaultCareer().options.press);
    expect(s.data.records.bestScore).toBe(0);
  });
});
