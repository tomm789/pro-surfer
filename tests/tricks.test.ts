import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { EventBus } from '@/core/events';
import { TUNING } from '@/core/tuning';
import { WaveModel, waveParamsFromBeach } from '@/wave/wave';
import { getBeach } from '@/world/beaches';
import { RiderSim, type RiderEvents } from '@/rider/rider';
import { NEUTRAL_INPUT, type RiderInput } from '@/rider/input';
import { TRICKS } from '@/tricks/catalogue';
import { quantiseDirection } from '@/tricks/sequencer';
import { TrickSystem, type TrickEvents } from '@/tricks/executor';

const DT = 1 / 60;
const MID = { spin: 0.5, speed: 0.5, air: 0.5, balance: 0.5 };

function rig(beachId = 'sandbar', ft = 8, seed = 5, state: 'face' | 'tube' = 'face') {
  const beach = getBeach(beachId);
  const wave = new WaveModel(waveParamsFromBeach(beach, ft * 0.3048 * 1.35, { warnSeconds: 2.5 }), new Rng(seed), 0);
  wave.params.sections.rate = 0;
  const riderEvents = new EventBus<RiderEvents>();
  const rider = new RiderSim(wave, TUNING, MID, riderEvents, { state: 'face', u: state === 'tube' ? 5 : 12, v: 0.4 }, new Rng(seed));
  const trickEvents = new EventBus<TrickEvents>();
  const tricks = new TrickSystem(rider, TUNING, trickEvents, riderEvents);
  const landed: string[] = [];
  const failed: string[] = [];
  const locked: string[] = [];
  trickEvents.on('trickLand', (e) => landed.push(e.trick.id));
  trickEvents.on('trickFail', (e) => failed.push(e.trick.id));
  trickEvents.on('specialLocked', (e) => locked.push(e.trick.id));
  const step = (inp: Partial<RiderInput> = {}, n = 1) => {
    for (let i = 0; i < n; i++) {
      const full = { ...NEUTRAL_INPUT, ...inp };
      wave.step(DT, rider.u);
      rider.step(DT, full);
      tricks.step(DT, full);
    }
  };
  /** Press a button for one step then release for `gap` steps. */
  const tap = (btn: Partial<RiderInput>, gap = 3) => {
    step(btn);
    step({}, gap);
  };
  return { wave, rider, tricks, step, tap, landed, failed, locked, trickEvents };
}

describe('catalogue', () => {
  it('loads every trick from design doc §5 with unique ids', () => {
    expect(TRICKS.all.length).toBeGreaterThanOrEqual(64);
    expect(TRICKS.bySection('air').length).toBeGreaterThanOrEqual(31);
    expect(TRICKS.bySection('tube').length).toBe(12);
    expect(TRICKS.bySection('exit').length).toBe(8);
    expect(TRICKS.get('superman').special).toBe(true);
  });
});

describe('direction quantisation', () => {
  it('uses a generous diagonal cone and literal d-pad diagonals', () => {
    expect(quantiseDirection(1, 0, 0.2, 30)).toBe('right');
    expect(quantiseDirection(0, 1, 0.2, 30)).toBe('up');
    expect(quantiseDirection(1, 1, 0.2, 30)).toBe('upRight');
    expect(quantiseDirection(Math.cos((70 * Math.PI) / 180), Math.sin((70 * Math.PI) / 180), 0.2, 30)).toBe('upRight');
    expect(quantiseDirection(Math.cos((80 * Math.PI) / 180), Math.sin((80 * Math.PI) / 180), 0.2, 30)).toBe('up');
    expect(quantiseDirection(0.05, 0.05, 0.2, 30)).toBeNull();
  });
});

describe('face tricks', () => {
  it('double-tap carve mid-face is a Rebound, at the lip a Snap', () => {
    const r = rig();
    r.step({ stickY: 0.5 }, 30);
    r.tap({ carve: true }, 4);
    r.tap({ carve: true }, 40);
    expect(r.landed).toContain('rebound');
    // climb to the lip and double-tap again
    const dir = r.wave.params.direction;
    r.step({ stickY: 1 }, 30);
    for (let i = 0; i < 90 && r.rider.v < 0.8; i++) r.step({ stickX: dir, stickY: 0.2 });
    expect(r.rider.v).toBeGreaterThan(0.75);
    expect(r.rider.state).toBe('face');
    r.tap({ carve: true }, 4);
    r.tap({ carve: true }, 40);
    expect(r.landed).toContain('snap');
  });

  it('carve then slide within the window is a Gouge; slide then carve a Lay Back Slide', () => {
    const r = rig();
    r.step({ stickY: 0.5 }, 30);
    r.tap({ carve: true }, 10);
    r.tap({ slide: true }, 45);
    expect(r.landed).toContain('gouge');
    r.tap({ slide: true }, 10);
    r.tap({ carve: true }, 45);
    expect(r.landed).toContain('laybackSlide');
  });

  it('holding carve through a turn counts a Carve once per hold', () => {
    const r = rig();
    const dir = r.wave.params.direction;
    r.step({ stickY: 0.5 }, 20);
    const wiggle = () => {
      for (let k = 0; k < 4; k++) {
        r.step({ carve: true, stickX: dir }, 10);
        r.step({ carve: true, stickX: -dir }, 10);
      }
    };
    wiggle();
    expect(r.rider.state).toBe('face');
    expect(r.landed.filter((t) => t === 'carve').length).toBe(1);
    r.step({}, 5);
    wiggle();
    expect(r.landed.filter((t) => t === 'carve').length).toBe(2);
  });

  it('a special sequence (Up, Down + Carve) is gated by the meter', () => {
    const r = rig();
    r.tricks.canDoSpecial = () => false;
    r.step({ stickY: 0.5 }, 20);
    r.step({ stickY: 1 }, 4);
    r.step({}, 3);
    r.step({ stickY: -1 }, 4);
    r.tap({ carve: true, stickY: -1 }, 45);
    expect(r.locked).toContain('shoveItOllie');
    expect(r.landed).not.toContain('shoveItOllie');
    r.tricks.canDoSpecial = () => true;
    r.step({ stickY: 1 }, 4);
    r.step({}, 3);
    r.step({ stickY: -1 }, 4);
    r.tap({ carve: true, stickY: -1 }, 50);
    expect(r.landed).toContain('shoveItOllie');
  });

  it('a wipeout mid-trick loses it', () => {
    const r = rig();
    r.step({ stickY: 0.5 }, 20);
    r.tap({ slide: true }, 4);
    r.step({ slide: true }, 1);
    expect(r.tricks.activeTrick?.id).toBe('revertCutback');
    r.rider.wipeout('curl');
    r.step({}, 2);
    expect(r.failed).toContain('revertCutback');
    expect(r.landed).not.toContain('revertCutback');
  });
});

describe('air tricks', () => {
  function launch(r: ReturnType<typeof rig>) {
    const dir = r.wave.params.direction;
    r.step({ stickY: 1 }, 120);
    for (let i = 0; i < 60 * 5 && r.rider.state !== 'air'; i++) r.step({ stickX: dir, stickY: 0.2, jump: r.rider.v < 0.9 });
    expect(r.rider.state).toBe('air');
  }

  it('grab + direction in the air lands with the rider; two tricks per air', () => {
    const r = rig();
    r.tricks.canDoSpecial = () => false;
    launch(r);
    r.step({}, 40); // approach stick history expires (600 ms window)
    r.tap({ grab: true, stickX: -1 }, 8); // Indy
    r.tap({ carve: true, stickX: 1 }, 8); // Method
    expect(r.tricks.pendingAirTricks.map((t) => t.id)).toEqual(['indy', 'method']);
    for (let i = 0; i < 60 * 6 && r.rider.state === 'air'; i++) r.step({});
    expect(r.landed).toEqual(expect.arrayContaining(['indy', 'method']));
  });

  it('a bad landing loses the air tricks', () => {
    const r = rig();
    launch(r);
    r.tap({ grab: true, stickY: 1 }, 5); // nose grab
    // spin to ~90° and land badly
    for (let i = 0; i < 60 * 6 && r.rider.state === 'air'; i++) r.step({ spinRight: Math.abs(r.rider.airYaw) < Math.PI / 2 });
    expect(r.rider.lastLanding?.rating).toBe('wipeout');
    expect(r.failed).toContain('noseGrab');
    expect(r.landed).not.toContain('noseGrab');
  });

  it('a clean 360 with no grab still lands a rotation trick', () => {
    const r = rig();
    launch(r);
    for (let i = 0; i < 60 * 6 && r.rider.state === 'air'; i++) r.step({ spinRight: Math.abs(r.rider.airYaw) < Math.PI * 2 - 0.1 });
    expect(r.landed).toContain('spin360');
  });

  it('exit move: slide, slide, then a direction ends the flight on purpose', () => {
    const r = rig();
    launch(r);
    let exit = '';
    r.trickEvents.on('exitMove', (e) => (exit = e.trick.id));
    r.tap({ slide: true }, 4);
    r.tap({ slide: true }, 4);
    r.step({ stickX: -1 }, 3);
    r.step({}, 2);
    expect(exit).toBe('cannonBall');
  });
});

describe('tube tricks', () => {
  it('slide + direction inside the barrel', () => {
    const r = rig('reefpass', 9, 5, 'tube');
    for (let i = 0; i < 60 * 6 && r.rider.state !== 'tube'; i++) r.step({ stickY: -1 });
    expect(r.rider.state).toBe('tube');
    r.step({}, 40);
    r.tap({ slide: true, stickY: 1 }, 60);
    expect(r.landed).toContain('oneHandRoofDrag');
  });
});
