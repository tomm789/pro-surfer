import { describe, expect, it } from 'vitest';
import { TUNING, parseTuning } from '@/core/tuning';

describe('tuning data', () => {
  it('validates against the schema', () => {
    expect(TUNING.sim.hz).toBe(60);
    expect(TUNING.clock.runSeconds).toBe(180);
  });
  it('rejects malformed tuning', () => {
    expect(() => parseTuning({ sim: { hz: 'sixty' } })).toThrow();
  });
  it('scoring sanity check from design doc 6.3: five distinct 1,500-base tricks at prox 1.2 ≈ 45,000', () => {
    const base = 1500;
    const prox = 1.2;
    const n = 5;
    const chain = Math.round(n * base * prox * Math.min(n, TUNING.scoring.multiplierCap));
    expect(chain).toBe(45000);
  });
});
