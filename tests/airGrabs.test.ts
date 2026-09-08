/**
 * Stick-scheme grabs (docs/MECHANICS.md §6): hold a hand on the rail and the foot shape says which grab.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { EventBus } from '@/core/events';
import { TUNING } from '@/core/tuning';
import { WaveModel, waveParamsFromBeach } from '@/wave/wave';
import { getBeach } from '@/world/beaches';
import { waveFeetToMetres } from '@/world/beach';
import { RiderSim, type RiderEvents } from '@/rider/rider';
import { NEUTRAL_INPUT, type RiderInput } from '@/rider/input';
import { TRICKS, feetMatch, feetShape } from '@/tricks/catalogue';
import { TrickSystem, type TrickEvents } from '@/tricks/executor';

const DT = 1 / 60;
const MID = { spin: 0.5, speed: 0.5, air: 0.5, balance: 0.5 };

/** feet(back, front) as [x, y]; y is the raw stick axis, so +1 = pulled up, −1 = pressed. */
function feet(back: [number, number], front: [number, number]): Partial<RiderInput> {
  return { backX: back[0], backY: back[1], frontX: front[0], frontY: front[1] };
}

function rig(seed = 5) {
  const wave = new WaveModel(waveParamsFromBeach(getBeach('sandbar'), waveFeetToMetres(8), { warnSeconds: 2.5 }), new Rng(seed), 0);
  wave.params.sections.rate = 0;
  const riderEvents = new EventBus<RiderEvents>();
  const rider = new RiderSim(wave, TUNING, MID, riderEvents, { state: 'face', u: 10, v: 0.4 }, new Rng(seed));
  rider.controls = 'dual';
  const trickEvents = new EventBus<TrickEvents>();
  const tricks = new TrickSystem(rider, TUNING, trickEvents, riderEvents);
  tricks.canDoSpecial = () => false;
  const landed: string[] = [];
  trickEvents.on('trickLand', (e) => landed.push(e.trick.id));
  const step = (inp: Partial<RiderInput> = {}, n = 1) => {
    for (let i = 0; i < n; i++) {
      const full = { ...NEUTRAL_INPUT, ...inp };
      wave.step(DT, rider.state === 'wipeout' ? null : rider.u);
      rider.step(DT, full);
      tricks.step(DT, full);
    }
  };
  /** Pump for speed, then climb crouched on a full rail and pop off the lip. */
  const launch = () => {
    for (let i = 0; i < 120; i++) step(feet([0, 1], [0, -1]));
    const dir = wave.params.direction;
    for (let i = 0; i < 60 * 4 && rider.state !== 'air'; i++) {
      const atLip = rider.v > 0.9;
      step(feet([dir, atLip ? 1 : -1], [dir, atLip ? 1 : -1]));
    }
    expect(rider.state).toBe('air');
    step({}, 6); // the pop's own foot motion settles before any grab is read
  };
  const pending = () => tricks.pendingAirTricks.map((t) => t.id);
  return { wave, rider, tricks, step, launch, pending, landed };
}

describe('foot shapes', () => {
  it('reads cues from the sticks with toe-side always toward the wall', () => {
    const right = feetShape({ backX: 1, backY: 0, frontX: 1, frontY: 0.8 }, 1);
    expect(right.back.has('toe')).toBe(true);
    expect(right.front.has('toe')).toBe(true);
    expect(right.front.has('up')).toBe(true);
    expect(right.twist).toBeNull();
    // the same sticks on a left are heel-side
    const left = feetShape({ backX: 1, backY: 0, frontX: 1, frontY: 0 }, -1);
    expect(left.back.has('heel')).toBe(true);
    const twisted = feetShape({ backX: -1, backY: -1, frontX: 1, frontY: -1 }, 1);
    expect(twisted.twist).toBe('out');
    expect(twisted.tuck).toBe(true);
  });

  it('matches by specificity so a tucked heel grab is a roast beef, not a melon', () => {
    const heels = feetShape({ backX: -1, backY: 0, frontX: -1, frontY: 0 }, 1);
    const tucked = feetShape({ backX: -1, backY: -1, frontX: -1, frontY: -1 }, 1);
    expect(feetMatch(TRICKS.get('melon').feet!, heels)).toBe(2);
    expect(feetMatch(TRICKS.get('roastBeef').feet!, heels)).toBe(-1);
    expect(feetMatch(TRICKS.get('roastBeef').feet!, tucked)).toBe(3);
    expect(feetMatch(TRICKS.get('melon').feet!, tucked)).toBe(2);
  });

  it('every basic air grab and flip has a shape, and no two on the same hand share one', () => {
    const basic = TRICKS.bySection('air').filter((t) => !t.special && t.input.kind === 'dir');
    expect(basic.length).toBe(16);
    for (const t of basic) expect(t.feet, t.id).toBeDefined();
    for (const button of ['grab', 'carve']) {
      const seen = new Map<string, string>();
      for (const t of basic.filter((x) => x.input.kind === 'dir' && x.input.button === button)) {
        const key = JSON.stringify(t.feet);
        expect(seen.get(key), `${t.id} shares a shape with ${seen.get(key)}`).toBeUndefined();
        seen.set(key, t.id);
      }
    }
  });
});

describe('grabs in the air', () => {
  it('front foot up under the grab hand is a nose grab; a second hand adds a second trick', () => {
    const r = rig();
    r.launch();
    r.step({ grab: true, ...feet([0, 0], [0, 1]) }, 8);
    expect(r.pending()).toEqual(['noseGrab']);
    r.step({}, 4);
    r.step({ carve: true, ...feet([-1, 0], [-1, 0]) }, 8);
    expect(r.pending()).toEqual(['noseGrab', 'method']);
    for (let i = 0; i < 60 * 6 && r.rider.state === 'air'; i++) r.step({});
    expect(r.landed).toEqual(expect.arrayContaining(['noseGrab', 'method']));
  });

  it('a held hand with the feet neutral grabs nothing until a shape appears, and only once per press', () => {
    const r = rig();
    r.launch();
    r.step({ grab: true }, 12);
    expect(r.pending()).toEqual([]);
    const dir = r.wave.params.direction;
    r.step({ grab: true, ...feet([dir, 0], [dir, 0]) }, 8);
    expect(r.pending()).toEqual(['indy']);
    // moving the feet while still holding does not re-read the grab
    r.step({ grab: true, ...feet([0, 1], [0, 0]) }, 10);
    expect(r.pending()).toEqual(['indy']);
  });

  it('feet twisted opposite ways under the front hand is a shove-it, not a lien', () => {
    const r = rig();
    r.launch();
    const dir = r.wave.params.direction;
    r.step({ carve: true, ...feet([dir, 0], [-dir, 0]) }, 8);
    expect(r.pending()).toEqual(['shoveThis']);
  });

  it('the classic direction grabs and the face catalogue do not fire in the stick scheme', () => {
    const r = rig();
    // a double-tap of carve on the face would be a catalogue snap in the classic scheme
    r.step({ carve: true }, 2);
    r.step({}, 4);
    r.step({ carve: true }, 2);
    r.step({}, 20);
    expect(r.landed).not.toContain('snap');
    expect(r.landed).not.toContain('rebound');
    r.launch();
    // a grab press with the classic stick pointing up must not become a nose grab by itself
    r.step({ grab: true, stickY: 1 }, 8);
    expect(r.pending()).toEqual([]);
  });
});

describe('tube tricks from the feet', () => {
  it('in the barrel the slide hand plus a foot shape is a tube trick, and a tuck picks the deeper one', () => {
    const wave = new WaveModel(waveParamsFromBeach(getBeach('reefpass'), waveFeetToMetres(9), { warnSeconds: 2.5 }), new Rng(5), 0);
    wave.params.sections.rate = 0;
    const riderEvents = new EventBus<RiderEvents>();
    const rider = new RiderSim(wave, TUNING, MID, riderEvents, { state: 'face', u: 5, v: 0.4 }, new Rng(5));
    rider.controls = 'dual';
    const trickEvents = new EventBus<TrickEvents>();
    const tricks = new TrickSystem(rider, TUNING, trickEvents, riderEvents);
    tricks.canDoSpecial = () => false;
    const landed: string[] = [];
    trickEvents.on('trickLand', (e) => landed.push(e.trick.id));
    const step = (inp: Partial<RiderInput> = {}) => {
      const full = { ...NEUTRAL_INPUT, ...inp };
      wave.step(DT, rider.u);
      rider.step(DT, full);
      tricks.step(DT, full);
    };
    // stall on the tail until the barrel takes the rider
    for (let i = 0; i < 60 * 6 && rider.state !== 'tube'; i++) step(feet([0, -1], [0, 1]));
    expect(rider.state).toBe('tube');
    const dir = wave.params.direction;
    // slide hand + front foot up: one hand on the roof
    for (let i = 0; i < 60 && rider.state === 'tube'; i++) step({ slide: true, ...feet([0, 0], [0, 1]) });
    for (let i = 0; i < 10 && rider.state === 'tube'; i++) step();
    expect(landed).toContain('oneHandRoofDrag');
    // both feet toe-side and tucked: the two-hand wall drag beats the one-hand one
    for (let i = 0; i < 60 && rider.state === 'tube'; i++) step({ slide: true, ...feet([dir, -1], [dir, -1]) });
    for (let i = 0; i < 10 && rider.state === 'tube'; i++) step();
    expect(landed).toContain('twoHandWallDrag');
    expect(landed).not.toContain('oneHandWallDrag');
  });
});
