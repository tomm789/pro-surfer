/** The flip axis (docs/MECHANICS.md §5): both sticks leaning the same way in the air rolls the board over. */
import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { EventBus } from '@/core/events';
import { TUNING } from '@/core/tuning';
import { WaveModel, waveParamsFromBeach } from '@/wave/wave';
import { getBeach } from '@/world/beaches';
import { waveFeetToMetres } from '@/world/beach';
import { RiderSim, type RiderEvents } from '@/rider/rider';
import { NEUTRAL_INPUT, type RiderInput } from '@/rider/input';
import { TrickSystem, type TrickEvents } from '@/tricks/executor';
import { judgeLanding } from '@/rider/landing';

const DT = 1 / 60;
const MID = { spin: 0.5, speed: 0.5, air: 0.5, balance: 0.5 };

function feet(back: [number, number], front: [number, number]): Partial<RiderInput> {
  return { backX: back[0], backY: back[1], frontX: front[0], frontY: front[1] };
}

function rig(seed = 5) {
  const wave = new WaveModel(waveParamsFromBeach(getBeach('sandbar'), waveFeetToMetres(9), { warnSeconds: 2.5 }), new Rng(seed), 0);
  wave.params.sections.rate = 0;
  const events = new EventBus<RiderEvents>();
  const rider = new RiderSim(wave, TUNING, MID, events, { state: 'face', u: 10, v: 0.4 }, new Rng(seed));
  rider.controls = 'dual';
  const trickEvents = new EventBus<TrickEvents>();
  const tricks = new TrickSystem(rider, TUNING, trickEvents, events);
  const landed: string[] = [];
  const log: string[] = [];
  trickEvents.on('trickLand', (e) => landed.push(e.trick.id));
  events.on('land', (e) => log.push(`land:${e.rating}:flips=${e.flips}`));
  events.on('wipeout', (e) => log.push(`wipeout:${e.reason}`));
  const step = (inp: Partial<RiderInput> = {}) => {
    const full = { ...NEUTRAL_INPUT, ...inp };
    wave.step(DT, rider.state === 'wipeout' ? null : rider.u);
    rider.step(DT, full);
    tricks.step(DT, full);
  };
  const launch = () => {
    for (let i = 0; i < 150; i++) step(feet([0, 1], [0, -1]));
    const dir = wave.params.direction;
    for (let i = 0; i < 60 * 4 && rider.state !== 'air'; i++) {
      const atLip = rider.v > 0.9;
      step(feet([dir, atLip ? 1 : -1], [dir, atLip ? 1 : -1]));
    }
    expect(rider.state).toBe('air');
  };
  return { wave, rider, step, launch, landed, log };
}

describe('the flip axis', () => {
  it('judges the roll residual alongside the yaw: flat is perfect, upside down is a wipeout', () => {
    expect(judgeLanding(0, 0, 20, 45, 0, Math.PI * 2).flips).toBe(1);
    expect(judgeLanding(0, 0, 20, 45, 0, Math.PI * 2).rating).toBe('perfect');
    expect(judgeLanding(0, 0, 20, 45, 0, Math.PI * 2 + 0.6).rating).toBe('sloppy');
    expect(judgeLanding(0, 0, 20, 45, 0, Math.PI).rating).toBe('wipeout');
    expect(judgeLanding(0, 0, 20, 45, 0, Math.PI * 4).flips).toBe(2);
    // the worse of the two axes wins
    expect(judgeLanding(0, 0.9, 20, 45, 0, 0).rating).toBe('wipeout');
  });

  it('holding the rail in flight rolls the board; releasing after a full roll lands a flip', () => {
    const r = rig();
    r.launch();
    const dir = r.wave.params.direction;
    let peakRoll = 0;
    for (let i = 0; i < 60 * 6 && r.rider.state === 'air'; i++) {
      // lean both sticks toward the wall until a full roll is nearly done, then flatten to land
      const rolling = Math.abs(r.rider.airRoll) < Math.PI * 2 - 0.4;
      r.step(feet([rolling ? dir : 0, -0.6], [rolling ? dir : 0, -0.6]));
      peakRoll = Math.max(peakRoll, Math.abs(r.rider.airRoll));
    }
    expect(peakRoll).toBeGreaterThan(Math.PI * 1.6);
    expect(r.log.some((l) => l.startsWith('land:') && !l.startsWith('land:wipeout') && l.endsWith('flips=1'))).toBe(true);
    expect(r.landed).toContain('flip1');
  });

  it('a half roll comes down upside down and is a wipeout; the classic scheme never rolls', () => {
    const r = rig();
    r.launch();
    const dir = r.wave.params.direction;
    for (let i = 0; i < 60 * 6 && r.rider.state === 'air'; i++) {
      const rolling = Math.abs(r.rider.airRoll) < Math.PI - 0.1;
      r.step(feet([rolling ? dir : 0, -0.6], [rolling ? dir : 0, -0.6]));
    }
    expect(r.log).toContain('wipeout:bad-landing');
    expect(r.landed).not.toContain('flip1');

    const c = rig(6);
    c.rider.controls = 'classic';
    for (let i = 0; i < 120; i++) c.step({ stickY: 1 });
    for (let i = 0; i < 60 * 5 && c.rider.state !== 'air'; i++) c.step({ stickX: c.wave.params.direction, stickY: 0.2, jump: c.rider.v < 0.9 });
    expect(c.rider.state).toBe('air');
    for (let i = 0; i < 60 && c.rider.state === 'air'; i++) c.step(feet([1, 0], [1, 0]));
    expect(c.rider.airRoll).toBe(0);
  });
});
