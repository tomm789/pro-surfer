import { describe, expect, it } from 'vitest';
import { PushDivider, timeAttackSeconds } from '@/modes/push';
import { KEYMAP_P1, KEYMAP_P2, keymapHint } from '@/input/keymaps';

describe('push divider', () => {
  it('moves toward the player scoring less and declares a winner at the edge', () => {
    const d = new PushDivider({ fullScreenPoints: 50000, winShare: 0.92, minShare: 0.05 });
    d.onBank(1, 10000);
    for (let i = 0; i < 120; i++) d.step(1 / 60);
    expect(d.share).toBeGreaterThan(0.65);
    expect(d.winner).toBeNull();
    d.onBank(2, 5000);
    for (let i = 0; i < 120; i++) d.step(1 / 60);
    expect(d.share).toBeCloseTo(0.6, 1);
    d.onBank(1, 40000);
    for (let i = 0; i < 240; i++) d.step(1 / 60);
    expect(d.winner).toBe(1);
    expect(d.decide()).toBe(1);
  });
  it('decides by share at time-out', () => {
    const d = new PushDivider({ fullScreenPoints: 50000, winShare: 0.92, minShare: 0.05 });
    expect(d.decide()).toBeNull();
    d.onBank(2, 3000);
    for (let i = 0; i < 120; i++) d.step(1 / 60);
    expect(d.decide()).toBe(2);
  });
});

describe('time attack', () => {
  it('reduces the next run by the opponent score with a floor', () => {
    expect(timeAttackSeconds(120, 0, 1 / 1000, 30)).toBe(120);
    expect(timeAttackSeconds(120, 50000, 1 / 1000, 30)).toBe(70);
    expect(timeAttackSeconds(120, 500000, 1 / 1000, 30)).toBe(30);
  });
});

describe('keymaps', () => {
  it('players do not share keys', () => {
    const all = (m: typeof KEYMAP_P1) => Object.entries(m).filter(([k]) => k !== 'pause').flatMap(([, v]) => v);
    const p1 = new Set(all(KEYMAP_P1));
    for (const k of all(KEYMAP_P2)) expect(p1.has(k)).toBe(false);
    expect(keymapHint(KEYMAP_P2)).toContain('W/S/A/D');
  });
});
