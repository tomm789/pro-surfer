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

describe('saved replays', () => {
  const rec = (n: number) => ({ v: 1 as const, hz: 60, seed: 1, params: '', frames: n, highlight: null, keys: Array.from({ length: n }, (_, i) => [i, 0, 0, 0, 0, 0, 0, 0, 0]) });
  it('keeps the best per beach and lists them biggest first', () => {
    const s = new CareerSave(memory());
    expect(s.recordReplay({ beach: 'sandbar', rider: 'kai', points: 500, when: 1, rec: rec(10) })).toBe(true);
    expect(s.recordReplay({ beach: 'sandbar', rider: 'kai', points: 300, when: 2, rec: rec(10) })).toBe(false);
    expect(s.recordReplay({ beach: 'wavepool', rider: 'kai', points: 900, when: 3, rec: rec(10) })).toBe(true);
    expect(s.savedReplays().map((r) => r.beach)).toEqual(['wavepool', 'sandbar']);
    // and they survive a reload through the same storage
    const store = memory();
    const a = new CareerSave(store);
    a.recordReplay({ beach: 'reefpass', rider: 'kai', points: 100, when: 4, rec: rec(5) });
    expect(new CareerSave(store).savedReplays()[0]?.beach).toBe('reefpass');
  });

  it('drops the smallest older replays when the budget is exceeded', () => {
    const s = new CareerSave(memory());
    // ~22 bytes per key: 50k keys is about 1.1 MB each, so three are over the 3 MB budget and two are not
    s.recordReplay({ beach: 'sandbar', rider: 'kai', points: 100, when: 1, rec: rec(50000) });
    s.recordReplay({ beach: 'reefpass', rider: 'kai', points: 200, when: 2, rec: rec(50000) });
    s.recordReplay({ beach: 'wavepool', rider: 'kai', points: 300, when: 3, rec: rec(50000) });
    expect(s.savedReplays().map((r) => r.beach)).toEqual(['wavepool', 'reefpass']);
  });
});
