import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events';
import { Rng } from '@/core/rng';
import { TUNING } from '@/core/tuning';
import { WaveModel, waveParamsFromBeach } from '@/wave/wave';
import { getBeach } from '@/world/beaches';
import { waveFeetToMetres } from '@/world/beach';
import { RiderSim, type RiderEvents } from '@/rider/rider';
import { NEUTRAL_INPUT, type RiderInput } from '@/rider/input';
import { TrickRecognizer, type RecognizerRider } from '@/tricks/recognizer';
import type { TrickEvents } from '@/tricks/executor';

const DT = 1 / 60;
const MID = { spin: 0.5, speed: 0.5, air: 0.5, balance: 0.5 };

function feet(back: [number, number], front: [number, number]): Partial<RiderInput> {
  return { backX: back[0], backY: back[1], frontX: front[0], frontY: front[1] };
}

/** Drive the real rider with the sticks and collect what the recogniser names. */
function rig(beachId = 'wavepool', ft = 8, seed = 5) {
  const wave = new WaveModel(waveParamsFromBeach(getBeach(beachId), waveFeetToMetres(ft), { warnSeconds: 2.5 }), new Rng(seed), 0);
  wave.params.sections.rate = 0;
  const events = new EventBus<RiderEvents>();
  const trickEvents = new EventBus<TrickEvents>();
  const rider = new RiderSim(wave, TUNING, MID, events, { state: 'face', u: 10, v: 0.4 }, new Rng(seed));
  rider.controls = 'dual';
  const rec = new TrickRecognizer(TUNING, trickEvents);
  const named: string[] = [];
  trickEvents.on('trickLand', (e) => named.push(e.trick.id));
  const run = (seconds: number, each: (t: number) => Partial<RiderInput>) => {
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i++) {
      wave.step(DT, rider.state === 'wipeout' ? null : rider.u);
      rider.step(DT, { ...NEUTRAL_INPUT, ...each(i * DT) });
      rec.step(DT, rider);
    }
  };
  return { wave, rider, rec, named, run };
}

/** A synthetic rider, so each classification can be driven in isolation. */
function fake(over: Partial<RecognizerRider> = {}): RecognizerRider {
  return { state: 'face', v: 0.5, speed: 10, heading: 0, boardYaw: 0, aheadOfCurl: 5, slideSeconds: 0, stance: { rail: 0, compression: 0, trim: 0, twist: 0 }, ...over };
}

describe('trick recognizer', () => {
  it('ignores a nudge of the rail while trimming', () => {
    const trickEvents = new EventBus<TrickEvents>();
    const named: string[] = [];
    trickEvents.on('trickLand', (e) => named.push(e.trick.id));
    const rec = new TrickRecognizer(TUNING, trickEvents);
    const r = fake({ stance: { rail: 0.5, compression: 0, trim: 0, twist: 0 } });
    for (let i = 0; i < 20; i++) rec.step(DT, r);
    const back = fake();
    for (let i = 0; i < 20; i++) rec.step(DT, back);
    expect(named).toEqual([]);
  });

  it('names a turn by where on the face it happened', () => {
    const trickEvents = new EventBus<TrickEvents>();
    const named: string[] = [];
    trickEvents.on('trickLand', (e) => named.push(e.trick.id));
    const rec = new TrickRecognizer(TUNING, trickEvents);
    /** Hold a rail while the heading swings, then release. */
    const turn = (rail: number, v: number, extra: Partial<RecognizerRider> = {}, frames = 40) => {
      for (let i = 0; i < frames; i++) {
        rec.step(DT, fake({ v, heading: (i / frames) * 0.9 * Math.sign(rail), stance: { rail, compression: 0, trim: 0, twist: 0 }, ...extra }));
      }
      for (let i = 0; i < 20; i++) rec.step(DT, fake({ v, heading: 0.9 * Math.sign(rail), ...extra }));
    };
    turn(0.9, 0.2); // low on the face, rail toward the wall
    expect(named.at(-1)).toBe('bottomTurn');
    turn(0.9, 0.95); // up at the lip
    expect(named.at(-1)).toBe('offTheLip');
    turn(0.9, 0.7); // high but not at the lip
    expect(named.at(-1)).toBe('snap');
    turn(-0.8, 0.5, {}, 60); // long turn away from the wall
    expect(named.at(-1)).toBe('cutback');
    turn(0.9, 0.9, { slideSeconds: 0.4, boardYaw: 0.7 }); // sliding at the top
    expect(named.at(-1)).toBe('snap');
    turn(0.5, 0.45, { slideSeconds: 0.4, boardYaw: 0.7 }); // sliding mid-face
    expect(named.at(-1)).toBe('tailSlide');
  });

  it('calls a rail reversal inside one turn a roundhouse, and scores it highest', () => {
    const trickEvents = new EventBus<TrickEvents>();
    const landed: { id: string; base: number }[] = [];
    trickEvents.on('trickLand', (e) => landed.push({ id: e.trick.id, base: e.trick.base }));
    const rec = new TrickRecognizer(TUNING, trickEvents);
    for (let i = 0; i < 40; i++) rec.step(DT, fake({ v: 0.5, heading: (i / 40) * -0.8, stance: { rail: -0.9, compression: 0, trim: 0, twist: 0 } }));
    for (let i = 0; i < 40; i++) rec.step(DT, fake({ v: 0.5, heading: -0.8 + (i / 40) * 1.4, stance: { rail: 0.9, compression: 0, trim: 0, twist: 0 } }));
    for (let i = 0; i < 20; i++) rec.step(DT, fake({ v: 0.5, heading: 0.6 }));
    expect(landed.at(-1)!.id).toBe('roundhouse');
    expect(landed.at(-1)!.base).toBeGreaterThan(TUNING.scoring.base.faceBasic[0]);
  });

  it('recognises real turns driven by the sticks on the pool wave', () => {
    const r = rig();
    // build speed, then swing the rail from the bottom to the top and back, twice
    r.run(2.5, () => feet([0, 1], [0, -1]));
    r.run(6, (t) => {
      const phase = t % 2.4;
      const rail = phase < 1.2 ? 1 : -1;
      const press = r.rider.headingDeg > 0 ? 1 : -1;
      return feet([rail, press], [rail, press]);
    });
    expect(r.named.length).toBeGreaterThanOrEqual(2);
    for (const id of r.named) expect(['bottomTurn', 'snap', 'offTheLip', 'cutback', 'roundhouse', 'tailSlide', 'layback', 'carve']).toContain(id);
    expect(r.rec.last).not.toBeNull();
    expect(r.rec.last!.quality).toBeGreaterThan(0);
  });
});
