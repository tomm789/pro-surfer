import { describe, expect, it } from 'vitest';
import { clamp, damp, wrapAngle, angleDelta, remap, smoothstep } from '@/core/math';
import { Rng, hashString } from '@/core/rng';
import { createFixedStepper } from '@/core/loop';
import { EventBus } from '@/core/events';

describe('math', () => {
  it('clamps and remaps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(remap(5, 0, 10, 0, 1)).toBeCloseTo(0.5);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
  });
  it('wraps angles', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2);
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6);
  });
  it('damp is frame-rate independent', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 3, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = damp(b, 1, 3, 1 / 30);
    expect(a).toBeCloseTo(b, 5);
  });
});

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });
  it('hashes strings stably', () => {
    expect(hashString('pipeline')).toBe(hashString('pipeline'));
    expect(hashString('pipeline')).not.toBe(hashString('kirra'));
  });
});

describe('fixed stepper', () => {
  it('steps exactly hz times per simulated second', () => {
    const s = createFixedStepper(60);
    let steps = 0;
    for (let i = 0; i < 100; i++) s.advance(0.01, () => steps++);
    expect(steps).toBe(60);
  });
  it('clamps large gaps', () => {
    const s = createFixedStepper(60, 4);
    let steps = 0;
    s.advance(5, () => steps++);
    expect(steps).toBe(4);
  });
});

describe('event bus', () => {
  it('emits and unsubscribes', () => {
    const bus = new EventBus<{ hit: number }>();
    const got: number[] = [];
    const off = bus.on('hit', (n) => got.push(n));
    bus.emit('hit', 1);
    off();
    bus.emit('hit', 2);
    expect(got).toEqual([1]);
  });
});
