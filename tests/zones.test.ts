import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { TUNING } from '@/core/tuning';
import { WaveModel, waveParamsFromBeach } from '@/wave/wave';
import { getBeach } from '@/world/beaches';
import { waveFeetToMetres } from '@/world/beach';

function model(beachId: string, ft = 8) {
  const wave = new WaveModel(waveParamsFromBeach(getBeach(beachId), waveFeetToMetres(ft), { warnSeconds: 2.5 }), new Rng(1), 0);
  wave.params.sections.rate = 0;
  return wave;
}

describe('venue zones', () => {
  it('the pool cycles between a barrel section, a wall and a ramp', () => {
    const wave = model('wavepool');
    const wl = wave.params.zones!.wavelength;
    const names = new Set<string>();
    for (let u = 0; u < wl * 2; u += 2) names.add(wave.zoneAt(u));
    expect([...names].sort()).toEqual(['barrel', 'ramp', 'wall']);
    // The zone names have to match what the wave physically does there. A rideable roof only exists
    // just ahead of the curl, so walk the curl to each zone and sample the throwing lip in front of it.
    const tubeIn = (name: string) => {
      let best = 0;
      for (let u = 0; u < wl; u += 1) {
        if (wave.zoneAt(u) !== name) continue;
        wave.curlU = u;
        best = Math.max(best, wave.fields(u + 2).tube);
      }
      return best;
    };
    expect(tubeIn('barrel')).toBeGreaterThan(0.3);
    expect(tubeIn('barrel')).toBeGreaterThan(tubeIn('ramp') + 0.1);
  });

  it('leaves ocean breaks alone', () => {
    for (const id of ['sandbar', 'pointbreak', 'reefpass', 'cove', 'slab', 'outer']) {
      const wave = model(id);
      expect(wave.params.zones).toBeUndefined();
      expect(wave.zoneAt(0)).toBe('wall');
      expect(wave.zoneAt(500)).toBe('wall');
      // height is unmodulated apart from the existing wobble
      const a = wave.fields(0).H;
      const b = wave.fields(140).H;
      expect(Math.abs(a - b) / a).toBeLessThan(0.2);
    }
  });

  it('the pool still never schedules a close-out, so the ride is limited only by the clock', () => {
    const beach = getBeach('wavepool');
    expect(beach.sections.rate).toBe(0);
    const wave = model('wavepool');
    for (let i = 0; i < 60 * 120; i++) wave.step(1 / 60, wave.curlU + 20);
    expect(wave.sections.length).toBe(0);
  });
});
