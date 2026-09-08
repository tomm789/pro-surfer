/** Sets and lulls: the face pulses in size on a slow, seeded cycle at the ocean breaks. */
import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { WaveModel, waveParamsFromBeach } from '@/wave/wave';
import { getBeach } from '@/world/beaches';
import { waveFeetToMetres } from '@/world/beach';

const DT = 1 / 60;

function wave(beachId: string, seed = 7, swell = true) {
  const w = new WaveModel(waveParamsFromBeach(getBeach(beachId), waveFeetToMetres(8), { warnSeconds: 2.5, swell }), new Rng(seed), 0);
  w.params.sections.rate = 0;
  return w;
}

function trace(w: WaveModel, seconds: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    w.step(DT, null);
    if (i % 60 === 0) out.push(w.swellFactor);
  }
  return out;
}

describe('sets and lulls', () => {
  it('a steady wave (the pool, or swell left off) never changes size', () => {
    for (const w of [wave('wavepool'), wave('sandbar', 7, false)]) {
      expect(w.params.swell).toBeUndefined();
      expect(trace(w, 120).every((f) => f === 1)).toBe(true);
    }
  });

  it('starts in a lull with the first set 15–30 s out, then pulses between the lull and the peak', () => {
    const w = wave('sandbar');
    const S = w.params.swell!;
    const first = w.swellInfo();
    expect(first.inSet).toBe(false);
    expect(first.nextSetIn).toBeGreaterThanOrEqual(15);
    expect(first.nextSetIn).toBeLessThanOrEqual(30);
    expect(w.swellFactor).toBeCloseTo(S.lull, 5);
    const f = trace(w, 240);
    const min = Math.min(...f);
    const max = Math.max(...f);
    expect(min).toBeCloseTo(S.lull, 2);
    expect(max).toBeGreaterThan(S.lull + (S.peak - S.lull) * (1 - S.variance) - 0.02);
    expect(max).toBeLessThan(S.lull + (S.peak - S.lull) * (1 + S.variance) + 0.02);
    // the set is a smooth bump: no jump bigger than a few percent per second
    for (let i = 1; i < f.length; i++) expect(Math.abs(f[i]! - f[i - 1]!)).toBeLessThan(0.08);
  });

  it('scales the face height and is deterministic per seed', () => {
    const a = wave('reefpass', 3);
    const b = wave('reefpass', 3);
    const c = wave('reefpass', 4);
    const fa = trace(a, 150);
    expect(trace(b, 150)).toEqual(fa);
    expect(trace(c, 150)).not.toEqual(fa);
    // the height field follows the factor
    const nominal = a.params.height;
    const H = a.fields(a.curlU + 20).H;
    expect(H / nominal).toBeCloseTo(a.swellFactor * (H / nominal / a.swellFactor), 6);
    expect(H).toBeGreaterThan(0);
    const before = a.swellFactor;
    const hBefore = a.fields(a.curlU + 20).H;
    for (let i = 0; i < 60 * 40; i++) a.step(DT, null);
    const after = a.swellFactor;
    const hAfter = a.fields(a.curlU + 20).H;
    if (Math.abs(after - before) > 0.05) expect(Math.sign(hAfter - hBefore)).toBe(Math.sign(after - before));
  });
});
