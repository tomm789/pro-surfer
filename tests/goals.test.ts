import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events';
import { Rng } from '@/core/rng';
import { TUNING } from '@/core/tuning';
import { WaveModel, waveParamsFromBeach } from '@/wave/wave';
import { getBeach } from '@/world/beaches';
import { RiderSim, type RiderEvents } from '@/rider/rider';
import { NEUTRAL_INPUT } from '@/rider/input';
import { TrickSystem, type TrickEvents } from '@/tricks/executor';
import { RunController } from '@/scoring/run';
import { GoalTracker, type GoalEvents } from '@/goals/goals';
import { listLevels, getLevel } from '@/goals/levels';
import { CareerSave } from '@/save/career';
import { TRICKS } from '@/tricks/catalogue';

const DT = 1 / 60;

function rig(levelId: string) {
  const level = getLevel(levelId);
  const beach = getBeach(level.beach);
  const wave = new WaveModel(waveParamsFromBeach(beach, level.waveFt * 0.3048 * 1.35, { warnSeconds: 2.5 }), new Rng(3), 0);
  wave.params.sections.rate = 0;
  const riderEvents = new EventBus<RiderEvents>();
  const trickEvents = new EventBus<TrickEvents>();
  const rider = new RiderSim(wave, TUNING, { spin: 0.5, speed: 0.5, air: 0.5, balance: 0.5 }, riderEvents, { state: 'face', u: 12, v: 0.4 }, new Rng(3));
  const tricks = new TrickSystem(rider, TUNING, trickEvents, riderEvents);
  const run = new RunController(TUNING, rider, riderEvents, tricks, trickEvents, { seconds: level.seconds });
  const goalEvents = new EventBus<GoalEvents>();
  const goals = new GoalTracker(level, { run, riderEvents, trickEvents, runEvents: run.events, wave, riderU: () => rider.u, riderState: () => rider.state }, goalEvents);
  const done: string[] = [];
  goalEvents.on('goalDone', (e) => done.push(e.goal.id));
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      wave.step(DT, rider.u);
      rider.step(DT, NEUTRAL_INPUT);
      tricks.step(DT, NEUTRAL_INPUT);
      run.step(DT, false);
      goals.update(DT);
    }
  };
  const land = (id: string, section: 'face' | 'air' | 'tube', rotation = 0) =>
    trickEvents.emit('trickLand', { trick: TRICKS.get(id), section, aheadOfCurl: 3, rotation, landing: 'perfect', atLip: false });
  return { level, wave, rider, run, goals, riderEvents, trickEvents, step, land, done };
}

describe('levels data', () => {
  it('loads levels in order with a required goal each and valid beaches', () => {
    const levels = listLevels();
    expect(levels.length).toBeGreaterThanOrEqual(4);
    for (const l of levels) {
      expect(l.goals.some((g) => g.required)).toBe(true);
      expect(() => getBeach(l.beach)).not.toThrow();
      for (const u of l.unlocks) expect(() => getLevel(u)).not.toThrow();
    }
  });
});

describe('goal tracker', () => {
  it('score, section score and rotation goals complete from run events', () => {
    const r = rig('sandbar-1');
    for (const id of ['snap', 'rebound', 'gouge', 'tailChuck', 'laybackSlide', 'revertCutback']) r.land(id, 'face');
    r.land('indy', 'air', Math.PI * 2);
    r.land('method', 'air', Math.PI * 2);
    r.riderEvents.emit('land', { rating: 'perfect', errorRad: 0, fakie: false, spins180: 2, u: 0, v: 0, airTime: 1, speed: 8 });
    r.riderEvents.emit('land', { rating: 'perfect', errorRad: 0, fakie: false, spins180: 2, u: 0, v: 0, airTime: 1, speed: 8 });
    r.run.cashIn();
    r.step(2);
    expect(r.done).toContain('score');
    expect(r.done).toContain('air');
    expect(r.done).toContain('rot');
    expect(r.goals.requiredDone).toBe(true);
    expect(r.goals.hudLines().length).toBe(4);
  });

  it('special time and learn-a-trick goals', () => {
    const r = rig('sandbar-2');
    for (const id of ['snap', 'rebound', 'gouge', 'tailChuck', 'laybackSlide', 'revertCutback']) r.land(id, 'face');
    expect(r.run.meter.isYellow).toBe(true);
    r.step(60 * 9);
    expect(r.done).toContain('special');
    for (let i = 0; i < 3; i++) r.land('shoveItOllie', 'face');
    r.step(1);
    expect(r.done).toContain('learn');
  });

  it('section survival counts sections passed without a wipeout', () => {
    const r = rig('reefpass-1');
    // force a section ahead that the rider will pass before it grows (spread 0)
    r.wave.sections.push({ id: 5, u: r.rider.u + 15, halfWidth: 0, spread: 0, breakTime: r.wave.time, warnTime: r.wave.time, jack: 0 });
    for (let i = 0; i < 60 * 6 && r.rider.u < r.rider.u + 0; i++) r.step();
    let t = 0;
    while (r.rider.state === 'face' && t < 8 && r.goals.progress.find((p) => p.goal.id === 'sections')!.current < 1) {
      r.wave.step(DT, r.rider.u);
      r.rider.step(DT, { ...NEUTRAL_INPUT, stickY: 1 });
      r.goals.update(DT);
      t += DT;
    }
    expect(r.goals.progress.find((p) => p.goal.id === 'sections')!.current).toBe(1);
  });
});

describe('career save', () => {
  it('unlocks levels when the required goal completes and applies stat rewards', () => {
    const mem = new Map<string, string>();
    const save = new CareerSave({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) });
    expect(save.isUnlocked('sandbar-1')).toBe(true);
    expect(save.isUnlocked('reefpass-1')).toBe(false);
    const lvl = getLevel('sandbar-1');
    const out = save.recordRun(lvl.id, 31000, [
      { goalId: 'score', required: true },
      { goalId: 'air', required: false, reward: 'stat:air' },
    ], lvl.unlocks);
    expect(out.newLevels).toEqual(['sandbar-2', 'reefpass-1']);
    expect(out.newRewards).toEqual(['stat:air']);
    expect(save.data.stats.air).toBeCloseTo(0.1);
    const again = new CareerSave({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) });
    expect(again.isUnlocked('reefpass-1')).toBe(true);
    expect(again.isGoalDone('sandbar-1', 'air')).toBe(true);
    expect(again.data.bestScores['sandbar-1']).toBe(31000);
  });
});
