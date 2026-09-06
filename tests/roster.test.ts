import { describe, expect, it } from 'vitest';
import { listRiders, listBoards, getRider, getBoard, effectiveStats, statBar } from '@/world/roster';
import { TRICKS } from '@/tricks/catalogue';
import { getBeach } from '@/world/beaches';
import { TUNING } from '@/core/tuning';

describe('roster data', () => {
  it('has eight public riders plus a secret, valid homes and special tricks', () => {
    const riders = listRiders();
    expect(riders.filter((r) => !r.secret).length).toBe(8);
    expect(riders.some((r) => r.secret)).toBe(true);
    for (const r of riders) {
      expect(() => getBeach(r.home)).not.toThrow();
      for (const s of r.specials) expect(TRICKS.get(s).special).toBe(true);
      for (const [base, max] of Object.values(r.stats)) expect(max).toBeGreaterThanOrEqual(base);
    }
  });
  it('boards: thruster is neutral and unlocked at start; others unlock through rewards', () => {
    const boards = listBoards();
    expect(getBoard('thruster').unlock).toBe('start');
    expect(Object.values(getBoard('thruster').mods).every((m) => m === 0)).toBe(true);
    expect(boards.filter((b) => b.unlock.startsWith('board:')).length).toBeGreaterThanOrEqual(6);
  });
  it('effective stats blend rider and board and respect the max', () => {
    const lena = getRider('lena');
    const w = TUNING.stats;
    const base = effectiveStats(lena, getBoard('thruster'), { spin: 0, speed: 0, air: 0, balance: 0 }, w);
    expect(base.air).toBeCloseTo(0.7, 2);
    const boosted = effectiveStats(lena, getBoard('thruster'), { spin: 0, speed: 0, air: 1, balance: 0 }, w);
    expect(boosted.air).toBeCloseTo(1.0, 2);
    const twin = effectiveStats(lena, getBoard('twin'), { spin: 0, speed: 0, air: 0, balance: 0 }, w);
    expect(twin.spin).toBeGreaterThan(base.spin);
    expect(twin.balance).toBeLessThan(base.balance);
    expect(statBar(0.7)).toBe('■■■■■■■□□□');
  });
});
