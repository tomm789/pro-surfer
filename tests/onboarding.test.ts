/**
 * The first five minutes. A new player meets the dual-stick scheme in the lessons, so these drive the
 * real lesson levels with a plausible beginner policy and check the goals are actually reachable.
 * If this fails, the game is unlearnable no matter how good the physics is.
 */
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events';
import { Rng } from '@/core/rng';
import { TUNING } from '@/core/tuning';
import { WaveModel, waveParamsFromBeach } from '@/wave/wave';
import { getBeach } from '@/world/beaches';
import { waveFeetToMetres } from '@/world/beach';
import { RiderSim, type RiderEvents } from '@/rider/rider';
import { NEUTRAL_INPUT, cloneInput } from '@/rider/input';
import { TrickSystem, type TrickEvents } from '@/tricks/executor';
import { TrickRecognizer } from '@/tricks/recognizer';
import { RunController } from '@/scoring/run';
import { GoalTracker, type GoalEvents } from '@/goals/goals';
import { getLevel } from '@/goals/levels';

const DT = 1 / 60;
const MID = { spin: 0.5, speed: 0.5, air: 0.5, balance: 0.5 };

type Policy = 'cruise' | 'airs' | 'spins' | 'chain' | 'tube';

/** Drive a lesson with a beginner who follows its hints. */
function playLesson(id: string, seed: number, policy: Policy = 'cruise') {
  const level = getLevel(id);
  const wave = new WaveModel(waveParamsFromBeach(getBeach(level.beach), waveFeetToMetres(level.waveFt), { warnSeconds: 2.5 }), new Rng(seed), 0);
  const events = new EventBus<RiderEvents>();
  const trickEvents = new EventBus<TrickEvents>();
  const rider = new RiderSim(wave, TUNING, MID, events, undefined, new Rng(seed));
  rider.controls = 'dual';
  const tricks = new TrickSystem(rider, TUNING, trickEvents, events);
  const rec = new TrickRecognizer(TUNING, trickEvents);
  const run = new RunController(TUNING, rider, events, tricks, trickEvents, { seconds: level.seconds });
  const goalEvents = new EventBus<GoalEvents>();
  const goals = new GoalTracker(
    level,
    { run, riderEvents: events, trickEvents, runEvents: run.events, wave, riderU: () => rider.u, riderState: () => rider.state, extra: { riderSpeed: () => rider.speed } },
    goalEvents,
  );
  const done: string[] = [];
  goalEvents.on('goalDone', (e) => done.push(e.goal.id));
  let airs = 0;
  events.on('land', (e) => {
    if (e.rating !== 'wipeout') airs++;
  });

  const inp = cloneInput(NEUTRAL_INPUT);
  const set = (bx: number, by: number, fx: number, fy: number) => {
    inp.backX = bx;
    inp.backY = by;
    inp.frontX = fx;
    inp.frontY = fy;
  };
  let t = 0;
  let popTimer = 0;
  let topSpeed = 0;
  let spinsLanded = 0;
  let tubeSeconds = 0;
  let cashTimer = 0;
  const wipeouts: string[] = [];
  events.on('land', (e) => {
    if (e.rating !== 'wipeout' && e.spins180 >= 2) spinsLanded++;
  });
  events.on('wipeout', (e) => wipeouts.push(e.reason));
  while (!run.ended && t < level.seconds + 5) {
    const dir = wave.params.direction;
    let cash = false;
    inp.cashIn = false;
    if (rider.state === 'prone') {
      // press both feet, then flick up to pop to your feet once the wave has you
      popTimer += DT;
      const flick = rider.v > 0.4 && popTimer > 0.3;
      set(0.3, flick ? 1 : -1, 0.3, flick ? 1 : -1);
      if (flick) popTimer = 0;
    } else if (rider.state === 'air') {
      if (policy === 'spins') {
        // twist the feet opposite ways and tuck to spin; stop twisting once past the target so the
        // board comes down on a multiple of 180°. A beginner goes for a 360 first, then a 540.
        const target = spinsLanded === 0 ? Math.PI * 2 : Math.PI * 3;
        const spinning = Math.abs(rider.airYaw) < target - 0.35;
        set(spinning ? dir : 0, -1, spinning ? -dir : 0, -1);
      } else set(0, -1, 0, -1); // land with the legs loaded
    } else if (rider.state === 'tube') {
      // stay in: neutral feet, small rail corrections against the balance marker
      const b = rider.tube.balance;
      const fix = Math.abs(b) > 0.15 ? -Math.sign(b) * 0.3 * dir : 0;
      set(fix, -0.3, fix, -0.3);
    } else if (rider.state === 'face') {
      if ((policy === 'airs' || policy === 'spins') && rider.speed > 9) {
        // climb crouched, then explode at the lip
        const atLip = rider.v > 0.88;
        set(dir, atLip ? 1 : -1, dir, atLip ? 1 : -1);
      } else if (policy === 'tube') {
        // sit low on the face a few metres ahead of the curl and let it catch up: press the tail
        // when too far ahead or too fast, drive off the nose when about to be caught
        const ahead = rider.aheadOfCurl;
        const rail = (rider.v < 0.3 ? 0.35 : -0.25) * dir;
        if (ahead < 1.5) set(rail, 1, rail, -1);
        else if (ahead > 4 || rider.speed > 6.5) set(rail, -1, rail, 1);
        else set(rail, -0.4, rail, 0.2);
      } else {
        const rail = (rider.v < 0.45 ? 0.6 : -0.5) * dir;
        const press = rider.headingDeg > 0 ? 1 : -1;
        set(rail, press, rail, press);
      }
      if (policy === 'chain') {
        // cash in once the chain has three tricks in it, the way the lesson asks
        cashTimer += DT;
        if (run.chain.entries.length >= 3 && cashTimer > 0.5) {
          cash = true;
          cashTimer = 0;
        }
      }
    } else set(0, 0, 0, 0);
    inp.cashIn = cash;
    wave.step(DT, rider.state === 'wipeout' ? null : rider.u);
    rider.step(DT, inp);
    tricks.step(DT, inp);
    rec.step(DT, rider);
    run.step(DT, cash);
    goals.update(DT);
    if (rider.state === 'face') topSpeed = Math.max(topSpeed, rider.speed);
    if (rider.state === 'tube') tubeSeconds += DT;
    t += DT;
  }
  return { done, airs, topSpeed, spinsLanded, tubeSeconds, wipeouts, requiredDone: goals.requiredDone, lines: goals.hudLines() };
}

describe('onboarding', () => {
  it('lesson 1 can be completed: stand up, find speed, ride without falling', () => {
    for (const seed of [1, 2, 3]) {
      const r = playLesson('lesson-1', seed);
      expect(r.done).toContain('stand');
      expect(r.done).toContain('speed');
      expect(r.done).toContain('ride');
      expect(r.requiredDone).toBe(true);
      expect(r.topSpeed).toBeGreaterThan(11);
    }
  });

  it('lesson 2 can be started: crouch and flick at the lip gets a beginner into the air', () => {
    const r = playLesson('lesson-2', 1, 'airs');
    expect(r.airs).toBeGreaterThan(0);
    expect(r.done).toContain('air');
  });

  it('lesson 3 can be completed: twist and tuck in the air lands a 360 and a 540', () => {
    const r = playLesson('lesson-3', 1, 'spins');
    expect(r.spinsLanded).toBeGreaterThanOrEqual(1);
    expect(r.done).toContain('spin360');
    expect(r.done, r.lines.join(' | ')).toContain('spin540');
  });

  it('lesson 4 can be completed: carving up and down the face is recognised as face tricks', () => {
    const r = playLesson('lesson-4', 2);
    expect(r.done).toContain('face');
    expect(r.done, r.lines.join(' | ')).toContain('face4');
  });

  it('lesson 5 can be completed: a three-trick chain cashed in, and a special from the recogniser', () => {
    const r = playLesson('lesson-5', 3, 'chain');
    expect(r.done).toContain('chain3');
    expect(r.done, r.lines.join(' | ')).toContain('special');
  });

  it('lesson 6 can be completed: stalling into the reef barrel and holding the balance', () => {
    const r = playLesson('lesson-6', 1, 'tube');
    expect(r.tubeSeconds, `wipeouts: ${r.wipeouts.join(',')}`).toBeGreaterThan(3);
    expect(r.done).toContain('tube3');
    expect(r.done, r.lines.join(' | ')).toContain('tube8');
  });

  it('every lesson names a beach that exists and teaches the scheme in use', () => {
    for (const id of ['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4', 'lesson-5', 'lesson-6', 'lesson-7']) {
      const l = getLevel(id);
      expect(() => getBeach(l.beach)).not.toThrow();
      // the first lessons are on the pool, which never closes out on a learner
      if (['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4', 'lesson-5'].includes(id)) {
        expect(l.beach).toBe('wavepool');
        expect(getBeach(l.beach).sections.rate).toBe(0);
      }
    }
  });
});
