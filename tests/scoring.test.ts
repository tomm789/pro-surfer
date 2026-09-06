import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events';
import { TUNING } from '@/core/tuning';
import type { RiderEvents, TubeState } from '@/rider/rider';
import type { TrickEvents } from '@/tricks/executor';
import { TRICKS } from '@/tricks/catalogue';
import { SpecialMeter } from '@/scoring/meter';
import { RunController, type RunRider } from '@/scoring/run';
import { spinTrick } from '@/tricks/executor';

const DT = 1 / 60;

function rig(opts: { seconds?: number; untimed?: boolean } = {}) {
  const riderEvents = new EventBus<RiderEvents>();
  const trickEvents = new EventBus<TrickEvents>();
  const tube: TubeState = { offset: 3, depth: 0.5, balance: 0, driftDir: 1, driftTimer: 1, seconds: 0, maxDepth: 0 };
  const rider: RunRider & { state: RunRider['state'] } = { state: 'face', tube, aheadOfCurl: 4 };
  const tricks = { canDoSpecial: () => true };
  const run = new RunController(TUNING, rider, riderEvents, tricks, trickEvents, opts);
  const banked: number[] = [];
  const lost: number[] = [];
  run.events.on('chainBanked', (b) => banked.push(b.total));
  run.events.on('chainLost', (b) => lost.push(b.total));
  const land = (id: string, section: 'face' | 'air' | 'tube', extra: Partial<{ rotation: number; landing: 'perfect' | 'sloppy'; aheadOfCurl: number }> = {}) =>
    trickEvents.emit('trickLand', { trick: TRICKS.get(id), section, aheadOfCurl: extra.aheadOfCurl ?? rider.aheadOfCurl, rotation: extra.rotation ?? 0, landing: extra.landing, atLip: false });
  const steps = (n: number, cash = false) => {
    for (let i = 0; i < n; i++) run.step(DT, cash && i === 0);
  };
  return { run, rider, riderEvents, trickEvents, land, steps, banked, lost, tricks };
}

describe('special meter', () => {
  it('fills to yellow, drains in about 12 s, resets on wipeout', () => {
    let yellowAt = -1;
    let drained = -1;
    const m = new SpecialMeter(TUNING.meter, (k) => {
      if (k === 'meterYellow') yellowAt = 1;
      if (k === 'meterDrained') drained = 1;
    });
    for (let i = 0; i < 6; i++) m.add(TUNING.meter.fill.faceTrick);
    expect(m.state).toBe('yellow');
    expect(yellowAt).toBe(1);
    let t = 0;
    while (m.state === 'yellow' && t < 30) {
      m.step(DT);
      t += DT;
    }
    expect(t).toBeGreaterThan(10);
    expect(t).toBeLessThan(15);
    expect(drained).toBe(1);
    m.add(0.5);
    expect(m.state).toBe('green');
    m.reset();
    expect(m.state).toBe('empty');
  });
});

describe('chain and scoring', () => {
  it('links face tricks in green and banks when the section changes without yellow', () => {
    const r = rig();
    r.land('snap', 'face');
    r.land('rebound', 'face');
    expect(r.run.chain.entries.length).toBe(2);
    expect(r.run.meter.state).toBe('green');
    r.land('indy', 'air'); // cross-section while green → previous chain banks
    expect(r.banked.length).toBe(1);
    expect(r.run.chain.entries.length).toBe(1);
    expect(r.run.score).toBe(r.banked[0]);
  });

  it('cross-section linking while yellow builds one chain; cash-in banks base × multiplier', () => {
    const r = rig();
    // fill the meter with unique face tricks
    for (const id of ['snap', 'rebound', 'gouge', 'tailChuck', 'laybackSlide', 'revertCutback']) r.land(id, 'face');
    expect(r.run.meter.isYellow).toBe(true);
    r.land('indy', 'air', { rotation: Math.PI * 2, landing: 'perfect' });
    r.land('oneHandRoofDrag', 'tube');
    expect(r.banked.length).toBe(0);
    expect(r.run.chain.crossSection).toBe(true);
    expect(r.run.chain.multiplier).toBe(8);
    const expected = Math.round(r.run.chain.base * 8);
    r.steps(1, true);
    expect(r.banked).toEqual([expected]);
    expect(r.run.meter.state).toBe('empty');
    expect(r.run.bySection.air).toBeGreaterThan(0);
    expect(r.run.bySection.tube).toBeGreaterThan(0);
  });

  it('repeats decay and drain the meter; proximity and rotation multiply', () => {
    const r = rig();
    r.land('snap', 'face', { aheadOfCurl: 1.5 });
    r.land('snap', 'face', { aheadOfCurl: 1.5 });
    r.land('snap', 'face', { aheadOfCurl: 1.5 });
    const [a, b, c] = r.run.chain.entries;
    expect(a!.repeat).toBe(1);
    expect(b!.repeat).toBe(0.5);
    expect(c!.repeat).toBe(0.25);
    expect(a!.prox).toBeCloseTo(1.5, 1);
    expect(r.run.chain.multiplier).toBe(1);
    const far = rig();
    far.land('snap', 'face', { aheadOfCurl: 14 });
    expect(far.run.chain.entries[0]!.prox).toBeCloseTo(1.0, 1);
    const spun = rig();
    spun.land('indy', 'air', { rotation: Math.PI * 3, landing: 'perfect' }); // 540
    expect(spun.run.chain.entries[0]!.rot).toBeCloseTo(1 + 0.35 * 3);
    expect(spun.run.chain.entries[0]!.perfect).toBeCloseTo(1.1);
  });

  it('a wipeout loses the open chain and empties the meter and costs clock', () => {
    const r = rig();
    r.land('snap', 'face');
    r.land('gouge', 'face');
    const clock0 = r.run.clock;
    r.riderEvents.emit('wipeout', { reason: 'curl', u: 0 });
    expect(r.lost.length).toBe(1);
    expect(r.run.score).toBe(0);
    expect(r.run.meter.state).toBe('empty');
    expect(clock0 - r.run.clock).toBeCloseTo(TUNING.clock.wipeoutPenaltySeconds);
  });

  it('M5 acceptance: a 5-trick cross-section chain lands in a career-relevant range', () => {
    const basic = rig();
    for (const id of ['snap', 'rebound', 'gouge', 'tailChuck', 'laybackSlide', 'revertCutback']) basic.land(id, 'face', { aheadOfCurl: 3 });
    basic.land('indy', 'air', { rotation: Math.PI * 2, landing: 'perfect', aheadOfCurl: 3 });
    basic.land('method', 'air', { rotation: Math.PI * 2, landing: 'perfect', aheadOfCurl: 3 });
    basic.land('oneHandRoofDrag', 'tube', { aheadOfCurl: 2 });
    basic.steps(1, true);
    expect(basic.banked[0]).toBeGreaterThan(15000);
    expect(basic.banked[0]).toBeLessThan(80000);
    const special = rig();
    for (const id of ['snap', 'rebound', 'gouge', 'tailChuck', 'laybackSlide', 'revertCutback']) special.land(id, 'face', { aheadOfCurl: 3 });
    special.land('superman', 'air', { rotation: Math.PI * 2, landing: 'perfect', aheadOfCurl: 3 });
    special.land('coffin', 'tube', { aheadOfCurl: 2 });
    special.land('darkSlide', 'face', { aheadOfCurl: 2 });
    special.steps(1, true);
    expect(special.banked[0]).toBeGreaterThan(basic.banked[0]!);
    expect(special.banked[0]).toBeGreaterThan(40000);
  });

  it('tube time accrues into the chain and pays more when deep', () => {
    const shallow = rig();
    shallow.rider.tube.depth = 0.1;
    shallow.riderEvents.emit('tubeEnter', { u: 0, passive: false });
    shallow.rider.state = 'tube';
    shallow.steps(60 * 4);
    shallow.riderEvents.emit('tubeExit', { seconds: 4, maxDepth: 0.1, spit: false, u: 0 });
    const deep = rig();
    deep.rider.tube.depth = 0.9;
    deep.riderEvents.emit('tubeEnter', { u: 0, passive: false });
    deep.rider.state = 'tube';
    deep.steps(60 * 4);
    deep.riderEvents.emit('tubeExit', { seconds: 4, maxDepth: 0.9, spit: true, u: 0 });
    expect(deep.run.chain.total).toBeGreaterThan(shallow.run.chain.total);
    expect(shallow.run.chain.total).toBeGreaterThan(500);
  });

  it('rotation-only airs score through the synthetic spin trick', () => {
    const r = rig();
    r.trickEvents.emit('trickLand', { trick: spinTrick(2), section: 'air', aheadOfCurl: 3, rotation: Math.PI * 2, landing: 'perfect', atLip: false });
    expect(r.run.chain.entries[0]!.name).toBe('360');
  });
});

describe('clock', () => {
  it('ends when time runs out with nothing open, but overruns while the meter is yellow', () => {
    const quick = rig({ seconds: 2 });
    let ended = 0;
    quick.run.events.on('runEnd', () => ended++);
    quick.steps(60 * 2 + 2);
    expect(ended).toBe(1);

    const over = rig({ seconds: 2 });
    let endedAt = -1;
    over.run.events.on('runEnd', () => (endedAt = over.run.time));
    for (const id of ['snap', 'rebound', 'gouge', 'tailChuck', 'laybackSlide', 'revertCutback']) over.land(id, 'face');
    expect(over.run.meter.isYellow).toBe(true);
    over.steps(60 * 2 + 2);
    expect(over.run.overrun).toBe(true);
    expect(endedAt).toBe(-1);
    over.steps(60 * 16);
    expect(endedAt).toBeGreaterThan(2);
    expect(over.run.score).toBeGreaterThan(0); // the chain banked when the meter drained
  });

  it('idle chains bank after a few seconds when not yellow', () => {
    const r = rig();
    r.land('snap', 'face');
    r.steps(60 * (TUNING.scoring.idleBankSeconds + 0.5));
    expect(r.banked.length).toBe(1);
  });
});
