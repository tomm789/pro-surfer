/**
 * The dual-stick scheme, tested against the claims in docs/MECHANICS.md.
 * Left stick = back foot, right stick = front foot, down presses that foot.
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
import { StanceModel } from '@/rider/stance';

const DT = 1 / 60;
const MID = { spin: 0.5, speed: 0.5, air: 0.5, balance: 0.5 };

/** feet(back, front) as [x, y] pairs; y is the raw stick axis, so -1 = pressed down. */
function feet(back: [number, number], front: [number, number]): Partial<RiderInput> {
  return { backX: back[0], backY: back[1], frontX: front[0], frontY: front[1] };
}

function rig(beachId = 'sandbar', ft = 8, seed = 5, stats = MID) {
  const wave = new WaveModel(waveParamsFromBeach(getBeach(beachId), waveFeetToMetres(ft), { warnSeconds: 2.5 }), new Rng(seed), 0);
  wave.params.sections.rate = 0;
  const events = new EventBus<RiderEvents>();
  const rider = new RiderSim(wave, TUNING, stats, events, { state: 'face', u: 10, v: 0.4 }, new Rng(seed));
  rider.controls = 'dual';
  const log: string[] = [];
  events.on('wipeout', (e) => log.push(`wipeout:${e.reason}`));
  events.on('launch', (e) => log.push(`launch:${e.power.toFixed(2)}`));
  events.on('land', (e) => log.push(`land:${e.rating}`));
  const step = (inp: Partial<RiderInput> = {}) => {
    wave.step(DT, rider.state === 'wipeout' ? null : rider.u);
    rider.step(DT, { ...NEUTRAL_INPUT, ...inp });
  };
  const run = (seconds: number, each: (t: number) => Partial<RiderInput>) => {
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i++) step(each(i * DT));
  };
  return { wave, rider, log, step, run };
}

describe('stance model', () => {
  it('reduces two sticks to compression, trim, rail and twist', () => {
    const m = new StanceModel(TUNING);
    const settle = (inp: Partial<RiderInput>, n = 40) => {
      for (let i = 0; i < n; i++) m.update(DT, { ...NEUTRAL_INPUT, ...inp }, 1, 0);
      return m.state;
    };
    // both feet pressed down = crouch, no trim bias
    let s = settle(feet([0, -1], [0, -1]));
    expect(s.compression).toBeGreaterThan(0.85);
    expect(Math.abs(s.trim)).toBeLessThan(0.05);
    // back foot pressed, front foot lifted = weight on the tail
    m.reset();
    s = settle(feet([0, -1], [0, 1]));
    expect(s.trim).toBeLessThan(-0.85);
    expect(Math.abs(s.compression)).toBeLessThan(0.05);
    // both feet pushed the same way = rail engaged, no twist
    m.reset();
    s = settle(feet([1, 0], [1, 0]));
    expect(s.rail).toBeGreaterThan(0.85);
    expect(Math.abs(s.twist)).toBeLessThan(0.05);
    // feet pushed opposite ways = twist, no rail
    m.reset();
    s = settle(feet([-1, 0], [1, 0]));
    expect(s.twist).toBeGreaterThan(0.85);
    expect(Math.abs(s.rail)).toBeLessThan(0.05);
    // rail is signed toward the wall, so a left-hander mirrors it
    m.reset();
    for (let i = 0; i < 40; i++) m.update(DT, { ...NEUTRAL_INPUT, ...feet([1, 0], [1, 0]) }, -1, 0);
    expect(m.state.rail).toBeLessThan(-0.85);
  });

  it('gives energy only for pumping in phase with the face', () => {
    const m = new StanceModel(TUNING);
    // extending while climbing puts energy in
    for (let i = 0; i < 20; i++) m.update(DT, { ...NEUTRAL_INPUT, ...feet([0, -1], [0, -1]) }, 1, 0.5);
    const extendClimb: number[] = [];
    for (let i = 0; i < 12; i++) {
      m.update(DT, { ...NEUTRAL_INPUT, ...feet([0, 1], [0, 1]) }, 1, 0.5);
      extendClimb.push(m.state.pumpWork);
    }
    expect(Math.max(...extendClimb)).toBeGreaterThan(0.3);
    // the same extension while dropping is out of phase and gives nothing
    m.reset();
    for (let i = 0; i < 20; i++) m.update(DT, { ...NEUTRAL_INPUT, ...feet([0, -1], [0, -1]) }, 1, -0.5);
    const extendDrop: number[] = [];
    for (let i = 0; i < 12; i++) {
      m.update(DT, { ...NEUTRAL_INPUT, ...feet([0, 1], [0, 1]) }, 1, -0.5);
      extendDrop.push(m.state.pumpWork);
    }
    expect(Math.max(...extendDrop)).toBe(0);
    // holding a stick still gives nothing at all
    const held: number[] = [];
    for (let i = 0; i < 60; i++) {
      m.update(DT, { ...NEUTRAL_INPUT, ...feet([0, -1], [0, -1]) }, 1, 0.5);
      held.push(m.state.pumpWork);
    }
    expect(Math.max(...held.slice(20))).toBe(0);
  });

  it('stores load that decays, and reports a pop on an explosive extension', () => {
    const m = new StanceModel(TUNING);
    for (let i = 0; i < 30; i++) m.update(DT, { ...NEUTRAL_INPUT, ...feet([0, -1], [0, -1]) }, 1, 0);
    expect(m.state.load).toBeGreaterThan(0.8);
    let pop = 0;
    for (let i = 0; i < 10; i++) {
      m.update(DT, { ...NEUTRAL_INPUT, ...feet([0, 1], [0, 1]) }, 1, 0);
      pop = Math.max(pop, m.state.pop);
    }
    expect(pop).toBeGreaterThan(0.6);
    // sitting in the crouch bleeds the load away, so the pop has to follow the compression
    m.reset();
    for (let i = 0; i < 30; i++) m.update(DT, { ...NEUTRAL_INPUT, ...feet([0, -1], [0, -1]) }, 1, 0);
    for (let i = 0; i < 120; i++) m.update(DT, { ...NEUTRAL_INPUT, ...feet([0, -0.15], [0, -0.15]) }, 1, 0);
    expect(m.state.load).toBeLessThan(0.35);
  });
});

describe('dual-stick rider', () => {
  it('leaning both feet toward the wall carves, and carves harder compressed', () => {
    const shallow = rig();
    const deep = rig();
    shallow.run(0.6, () => feet([1, 0], [1, 0]));
    deep.run(0.6, () => feet([1, -1], [1, -1]));
    expect(shallow.rider.heading).toBeGreaterThan(0.1);
    expect(deep.rider.heading).toBeGreaterThan(shallow.rider.heading);
    expect(deep.rider.v).toBeGreaterThan(shallow.rider.v);
  });

  it('feet twisting opposite ways pivot the board and swing the heading round', () => {
    const r = rig();
    let peakHeading = 0;
    r.run(0.35, () => {
      peakHeading = Math.max(peakHeading, Math.abs(r.rider.heading));
      return feet([-1, 0], [1, 0]);
    });
    const yawPeak = r.rider.boardYaw;
    expect(Math.abs(yawPeak)).toBeGreaterThan(0.15);
    // the rail bites again: the pivot is carried into the direction of travel, then the board settles
    r.run(1.4, () => {
      peakHeading = Math.max(peakHeading, Math.abs(r.rider.heading));
      return {};
    });
    expect(peakHeading).toBeGreaterThan(0.25);
    expect(Math.abs(r.rider.boardYaw)).toBeLessThan(0.1);
    // with the sticks back at rest the auto-trim assist finds a sensible line again
    expect(Math.abs(r.rider.heading)).toBeLessThan(peakHeading * 0.5);
  });

  it('pumping in time with the face puts energy in; out of phase puts none in', () => {
    // A player who works the face: steer up when low and down when high. The two riders follow the
    // same rail line and differ only in when they extend, so the comparison isolates the phase.
    const session = (phase: 1 | -1) => {
      const r = rig();
      let work = 0;
      let topSpeed = 0;
      r.run(8, () => {
        work += r.rider.stance.pumpWork;
        topSpeed = Math.max(topSpeed, r.rider.speed);
        // work the lower face: climbing to the lip would launch an air and end the comparison
        const rail = r.rider.v < 0.35 ? 0.7 : -0.7;
        const press = (r.rider.headingDeg > 0 ? 1 : -1) * phase; // stick up = extend, down = compress
        return feet([rail, press], [rail, press]);
      });
      return { work, topSpeed, rider: r.rider, log: r.log };
    };
    const inPhase = session(1);
    const outOfPhase = session(-1);
    let passengerTop = 0;
    const passenger = rig();
    passenger.run(8, () => {
      passengerTop = Math.max(passengerTop, passenger.rider.speed);
      return feet([0, 0], [0, 0]);
    });

    // The claim in §4 is about energy: in phase the legs do work, out of phase they do essentially
    // none. Speed is the right read-out — distance along the line is not, because working the face
    // means zig-zagging, which covers less ground than simply trimming straight down it.
    expect(inPhase.work).toBeGreaterThan(20);
    expect(outOfPhase.work).toBeLessThan(inPhase.work * 0.1);
    expect(inPhase.topSpeed).toBeGreaterThan(passengerTop);
    expect(inPhase.log.filter((l) => l.startsWith('wipeout'))).toEqual([]);
  });

  it('weight forward drives, weight on the tail stalls', () => {
    const drive = rig();
    const stall = rig();
    drive.run(2.5, () => feet([0, 1], [0, -1]));
    stall.run(2.5, () => feet([0, -1], [0, 1]));
    expect(drive.rider.speed).toBeGreaterThan(stall.rider.speed + 1.5);
  });

  it('compress then flick up at the lip launches, with the power that was loaded', () => {
    const r = rig('sandbar', 8);
    // build speed, then climb crouched
    r.run(2, () => feet([0, 1], [0, -1]));
    let launched = false;
    for (let i = 0; i < 60 * 4 && !launched; i++) {
      const atLip = r.rider.v > 0.9;
      // hold the crouch until the lip, then explode
      r.step(feet([1, atLip ? 1 : -1], [1, atLip ? 1 : -1]));
      if (r.rider.state === 'air') launched = true;
    }
    expect(launched).toBe(true);
    const pop = r.log.find((l) => l.startsWith('launch:'));
    expect(pop).toBeDefined();
    expect(Number(pop!.split(':')[1])).toBeGreaterThan(0.5);
  });

  it('holding a full rail turns hard but does not spin the board round', () => {
    const r = rig();
    let peak = 0;
    r.run(4, () => {
      peak = Math.max(peak, Math.abs(r.rider.headingDeg));
      return feet([1, -1], [1, -1]);
    });
    // a cutback swings past 90°, but the board resists going round and never reverses
    expect(peak).toBeGreaterThan(80);
    expect(peak).toBeLessThan(140);
  });

  it('auto-trim straightens a resting board but does not fight a deliberate stall', () => {
    // sticks at rest: the assist finds a line again
    const resting = rig();
    resting.run(0.5, () => feet([1, 0], [1, 0]));
    const turned = resting.rider.heading;
    expect(turned).toBeGreaterThan(0.15);
    resting.run(1.5, () => ({}));
    expect(Math.abs(resting.rider.heading)).toBeLessThan(Math.abs(turned) * 0.4);
    // pressing the tail is not "at rest": the angle is held, which is what setting up for the tube needs
    const stalling = rig();
    stalling.run(0.5, () => feet([1, 0], [1, 0]));
    const held = stalling.rider.heading;
    stalling.run(1.5, () => feet([0, -1], [0, 1]));
    expect(Math.abs(stalling.rider.heading)).toBeGreaterThan(Math.abs(held) * 0.6);
  });

  it('is deterministic and reproduces exactly from the same inputs', () => {
    const script = (t: number) => feet([Math.sin(t * 1.7), Math.cos(t * 0.9)], [Math.sin(t * 1.3 + 0.4), Math.cos(t * 1.1)]);
    const a = rig('reefpass', 9, 3);
    const b = rig('reefpass', 9, 3);
    a.run(20, script);
    b.run(20, script);
    expect(b.rider.snapshot()).toEqual(a.rider.snapshot());
  });
});
