import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { EventBus } from '@/core/events';
import { TUNING } from '@/core/tuning';
import { WaveModel, waveParamsFromBeach } from '@/wave/wave';
import { getBeach } from '@/world/beaches';
import { RiderSim, type RiderEvents } from '@/rider/rider';
import { NEUTRAL_INPUT, type RiderInput } from '@/rider/input';

const DT = 1 / 60;
const MID = { spin: 0.5, speed: 0.5, air: 0.5, balance: 0.5 };

function rig(beachId: string, ft: number, seed = 5, startAhead = 6) {
  const beach = getBeach(beachId);
  const wave = new WaveModel(waveParamsFromBeach(beach, ft * 0.3048 * 1.35, { warnSeconds: 2.5 }), new Rng(seed), 0);
  // no scheduled sections in these tests unless we add them
  wave.params.sections.rate = 0;
  const events = new EventBus<RiderEvents>();
  const rider = new RiderSim(wave, TUNING, MID, events, { state: 'face', u: startAhead, v: 0.35 }, new Rng(seed));
  const log: string[] = [];
  events.on('wipeout', (e) => log.push(`wipeout:${e.reason}`));
  events.on('tubeEnter', (e) => log.push(`tubeEnter:${e.passive ? 'passive' : 'stall'}`));
  events.on('tubeExit', (e) => log.push(`tubeExit:${e.seconds.toFixed(1)}:${e.spit ? 'spit' : 'clean'}`));
  events.on('floaterStart', () => log.push('floaterStart'));
  events.on('floaterEnd', (e) => log.push(`floaterEnd:${e.overSection ? 'section' : 'face'}`));
  const step = (inp: Partial<RiderInput>) => {
    wave.step(DT, rider.u);
    rider.step(DT, { ...NEUTRAL_INPUT, ...inp });
  };
  return { wave, rider, log, step };
}

describe('tube', () => {
  it('stalling in the pocket of a hollow wave drops you into the barrel', () => {
    const { rider, log, step } = rig('reefpass', 9);
    for (let i = 0; i < 60 * 6 && rider.state !== 'tube'; i++) step({ stickY: -1 });
    expect(rider.state).toBe('tube');
    expect(log.some((l) => l.startsWith('tubeEnter'))).toBe(true);
  });

  it('a mellow beach at the same size does not barrel', () => {
    const { rider, log, step } = rig('sandbar', 9);
    for (let i = 0; i < 60 * 6; i++) step({ stickY: -0.6 });
    expect(log.some((l) => l.startsWith('tubeEnter'))).toBe(false);
  });

  it('can be held 6+ seconds with active balancing and exited clean', () => {
    const { rider, log, step } = rig('reefpass', 9);
    for (let i = 0; i < 60 * 6 && rider.state !== 'tube'; i++) step({ stickY: -1 });
    expect(rider.state).toBe('tube');
    // hold depth around 0.5 with the stick, correct the balance marker by tapping against it
    let t = 0;
    let tapFrame = 0;
    while (rider.state === 'tube' && t < 6.5) {
      const b = rider.tube.balance;
      const stickX = Math.abs(b) > 0.08 && tapFrame % 6 < 3 ? Math.sign(b) : 0;
      const stickY = rider.tube.depth < 0.45 ? -0.5 : rider.tube.depth > 0.6 ? 0.5 : 0;
      step({ stickX, stickY });
      tapFrame++;
      t += DT;
    }
    expect(rider.state).toBe('tube');
    expect(rider.tube.seconds).toBeGreaterThan(6);
    for (let i = 0; i < 60 * 4 && rider.state === 'tube'; i++) {
      const b = rider.tube.balance;
      step({ jump: true, stickY: 1, stickX: Math.abs(b) > 0.1 && i % 6 < 3 ? Math.sign(b) : 0 });
    }
    expect(rider.state).toBe('face');
    expect(log.some((l) => l.startsWith('tubeExit'))).toBe(true);
    expect(log.filter((l) => l.startsWith('wipeout'))).toEqual([]);
  });

  it('without balancing you fall within a few seconds', () => {
    const { rider, log, step } = rig('reefpass', 9);
    for (let i = 0; i < 60 * 6 && rider.state !== 'tube'; i++) step({ stickY: -1 });
    for (let i = 0; i < 60 * 8 && rider.state === 'tube'; i++) step({ stickY: 0 });
    expect(log).toContain('wipeout:tube-balance');
  });

  it('rail grab halves the drift', () => {
    const a = rig('reefpass', 9, 9);
    const b = rig('reefpass', 9, 9);
    for (const r of [a, b]) for (let i = 0; i < 60 * 6 && r.rider.state !== 'tube'; i++) r.step({ stickY: -1 });
    for (let i = 0; i < 60; i++) {
      a.step({ stickY: -0.2 });
      b.step({ stickY: -0.2, grab: true });
    }
    expect(Math.abs(b.rider.tube.balance)).toBeLessThan(Math.abs(a.rider.tube.balance));
  });
});

describe('floater', () => {
  it('carries you over a close-out section; without it the section wipes you out', () => {
    const make = () => {
      const r = rig('sandbar', 8, 3, 14);
      // build speed first
      for (let i = 0; i < 60 * 2; i++) r.step({ stickY: 1 });
      // a section breaking just ahead
      r.wave.sections.push({ id: 99, u: r.rider.u + 14, halfWidth: 0, spread: 3, breakTime: r.wave.time, warnTime: r.wave.time, jack: 0.1 });
      return r;
    };
    // A: climb to the lip and float with slide held
    const A = make();
    const dir = A.wave.params.direction;
    for (let i = 0; i < 60 * 3 && A.rider.state !== 'floater'; i++) A.step({ stickX: dir, stickY: 0.3, slide: A.rider.v > 0.7 });
    expect(A.rider.state).toBe('floater');
    for (let i = 0; i < 60 * 3 && A.rider.state === 'floater'; i++) {
      const past = A.wave.distanceToBreak(A.rider.u + 2);
      A.step({ slide: past.inside || past.ahead < 3 });
    }
    expect(A.log.some((l) => l === 'floaterEnd:face')).toBe(true);
    expect(A.log.filter((l) => l.startsWith('wipeout'))).toEqual([]);
    expect(A.rider.state).toBe('face');

    // B: just trim into the section
    const B = make();
    for (let i = 0; i < 60 * 5 && B.rider.state === 'face'; i++) B.step({ stickY: 0.3 });
    expect(B.log.some((l) => l === 'wipeout:closeout' || l === 'wipeout:curl')).toBe(true);
  });
});
