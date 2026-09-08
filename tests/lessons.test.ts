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
import { listLessons, listLevels, getLevel } from '@/goals/levels';
import { TRICKS } from '@/tricks/catalogue';
import { CareerSave } from '@/save/career';

const DT = 1 / 60;

function rig(levelId: string) {
  const level = getLevel(levelId);
  const wave = new WaveModel(waveParamsFromBeach(getBeach(level.beach), level.waveFt * 0.3048 * 1.35, { warnSeconds: 2.5 }), new Rng(3), 0);
  wave.params.sections.rate = 0;
  const riderEvents = new EventBus<RiderEvents>();
  const trickEvents = new EventBus<TrickEvents>();
  const rider = new RiderSim(wave, TUNING, { spin: 0.5, speed: 0.5, air: 0.5, balance: 0.5 }, riderEvents, { state: 'face', u: 12, v: 0.4 }, new Rng(3));
  const tricks = new TrickSystem(rider, TUNING, trickEvents, riderEvents);
  const run = new RunController(TUNING, rider, riderEvents, tricks, trickEvents, { seconds: level.seconds });
  const goalEvents = new EventBus<GoalEvents>();
  let speed = 0;
  const goals = new GoalTracker(
    level,
    { run, riderEvents, trickEvents, runEvents: run.events, wave, riderU: () => rider.u, riderState: () => rider.state, extra: { riderSpeed: () => speed } },
    goalEvents,
  );
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
  return { level, rider, run, goals, riderEvents, trickEvents, step, done, setSpeed: (s: number) => (speed = s) };
}

describe('lessons', () => {
  it('are a chain of unlocks outside the career map, each with hints', () => {
    const lessons = listLessons();
    expect(lessons.length).toBe(7);
    expect(listLevels().some((l) => l.lesson)).toBe(false);
    for (let i = 0; i < lessons.length; i++) {
      const l = lessons[i]!;
      expect(l.goals.every((g) => g.required && g.hint)).toBe(true);
      if (i < lessons.length - 1) expect(l.unlocks).toContain(lessons[i + 1]!.id);
      expect(() => getBeach(l.beach)).not.toThrow();
    }
    expect(new CareerSave({ getItem: () => null, setItem: () => undefined }).isUnlocked('lesson-1')).toBe(true);
  });

  it('lesson 1: stand, reach speed, ride without wiping out', () => {
    const r = rig('lesson-1');
    // the default hint teaches the dual-stick scheme; the classic wording is kept alongside it
    expect(r.goals.activeHint()).toContain('sticks');
    expect(r.goals.activeHint('classic')).toContain('stand');
    r.riderEvents.emit('stand', { u: 0, v: 0.3 });
    r.step();
    expect(r.done).toContain('stand');
    expect(r.goals.activeHint()).toContain('rhythm');
    expect(r.goals.activeHint('classic')).toContain('pump');
    r.setSpeed(11.5);
    r.step();
    expect(r.done).toContain('speed');
    expect(r.goals.hudLines().join('\n')).toContain('11.5 / 11');
  });

  it('lesson 2 and 5: airs, an air trick, a cashed-in chain and a special', () => {
    const a = rig('lesson-2');
    a.riderEvents.emit('land', { rating: 'perfect', spins180: 0, fakie: false, residual: 0, u: 0, v: 0.3, airTime: 1, speed: 9 } as never);
    a.step();
    expect(a.done).toContain('air');
    a.trickEvents.emit('trickLand', { trick: TRICKS.get('indy'), section: 'air', aheadOfCurl: 3, rotation: 0, landing: 'perfect', atLip: false });
    a.step();
    expect(a.done).toContain('grab');
    expect(a.done).not.toContain('airs');

    const c = rig('lesson-5');
    // same-section tricks link without the yellow meter (cross-section linking would bank early)
    for (const id of ['indy', 'method', 'mute']) c.trickEvents.emit('trickLand', { trick: TRICKS.get(id), section: 'air', aheadOfCurl: 3, rotation: 0, landing: 'perfect', atLip: false });
    c.step();
    expect(c.done).not.toContain('chain3');
    c.run.cashIn();
    c.step();
    expect(c.done).toContain('chain3');
  });
});
