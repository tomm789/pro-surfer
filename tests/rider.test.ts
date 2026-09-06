import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { EventBus } from '@/core/events';
import { TUNING } from '@/core/tuning';
import { WaveModel, waveParamsFromBeach } from '@/wave/wave';
import { getBeach } from '@/world/beaches';
import { RiderSim, makePose, type RiderEvents } from '@/rider/rider';
import { NEUTRAL_INPUT, type RiderInput } from '@/rider/input';
import { judgeLanding } from '@/rider/landing';
import { DEG } from '@/core/math';

const DT = 1 / 60;
const MID = { spin: 0.5, speed: 0.5, air: 0.5, balance: 0.5 };

function rig(beachId = 'sandbar', ft = 8, seed = 5) {
  const beach = getBeach(beachId);
  const wave = new WaveModel(waveParamsFromBeach(beach, ft * 0.3048 * 1.15, { warnSeconds: 2.5 }), new Rng(seed), 0);
  const events = new EventBus<RiderEvents>();
  const rider = new RiderSim(wave, TUNING, MID, events, { state: 'face', u: 10, v: 0.4 });
  const log: string[] = [];
  events.on('wipeout', (e) => log.push(`wipeout:${e.reason}`));
  events.on('launch', () => log.push('launch'));
  events.on('land', (e) => log.push(`land:${e.rating}`));
  events.on('stand', () => log.push('stand'));
  const run = (seconds: number, input: Partial<RiderInput> = {}, each?: (t: number) => Partial<RiderInput>) => {
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i++) {
      const extra = each ? each(i * DT) : {};
      const inp = { ...NEUTRAL_INPUT, ...input, ...extra };
      wave.step(DT, rider.u);
      rider.step(DT, inp);
    }
  };
  return { wave, rider, run, log, events };
}

describe('landing judge', () => {
  it('perfect at the mirror angle, sloppy nearby, wipeout otherwise, fakie allowed', () => {
    const launch = 35 * DEG;
    expect(judgeLanding(launch, -launch, 20, 45, 0).rating).toBe('perfect');
    expect(judgeLanding(launch, -launch + 30 * DEG, 20, 45, 0).rating).toBe('sloppy');
    expect(judgeLanding(launch, -launch + 70 * DEG, 20, 45, 0).rating).toBe('wipeout');
    const fak = judgeLanding(launch, -launch + Math.PI, 20, 45, Math.PI);
    expect(fak.rating).toBe('perfect');
    expect(fak.fakie).toBe(true);
    expect(fak.spins180).toBe(1);
  });
});

describe('rider on the face', () => {
  it('trims down the line for 60 s without wiping out and stays ahead of the curl', () => {
    const { rider, run, log, wave } = rig();
    wave.params.sections.rate = 0; // sections are their own test; this one measures trimming
    run(60, { stickY: 0.4 });
    expect(log.filter((l) => l.startsWith('wipeout'))).toEqual([]);
    expect(rider.state).toBe('face');
    expect(rider.aheadOfCurl).toBeGreaterThan(2);
    expect(rider.aheadOfCurl).toBeLessThan(60);
  });

  it('stalling lets the curl catch you', () => {
    const { rider, run, log } = rig();
    run(20, { stickY: -1 });
    expect(log.some((l) => l === 'wipeout:curl' || l === 'wipeout:bogged')).toBe(true);
    expect(rider.wipeouts).toBeGreaterThan(0);
  });

  it('pumping increases speed relative to neutral trimming', () => {
    const a = rig();
    const b = rig();
    a.run(3, { stickY: 0 });
    b.run(3, { stickY: 1 });
    expect(b.rider.speed).toBeGreaterThan(a.rider.speed + 1);
  });

  it('turning toward the wall climbs the face; turning away drops', () => {
    const { rider, run, wave, log } = rig();
    const dir = wave.params.direction;
    const v0 = rider.v;
    run(0.35, { stickX: dir * 1, stickY: 0.5 });
    run(0.15, { stickY: 0.5 });
    expect(rider.v).toBeGreaterThan(v0 + 0.05);
    expect(rider.state).toBe('face');
    const v1 = rider.v;
    run(0.6, { stickX: -dir * 1, stickY: 0.5 });
    run(0.4, { stickY: 0.5 });
    expect(rider.v).toBeLessThan(v1);
    expect(log.filter((l) => l.startsWith('wipeout'))).toEqual([]);
  });

  it('takes roughly a second to climb from the trough to the lip (not a twitch)', () => {
    const { rider, run, wave } = rig();
    const dir = wave.params.direction;
    run(1, { stickY: 1 });
    let t = 0;
    while (rider.v < 0.95 && rider.state === 'face' && t < 5) {
      run(1 / 60, { stickX: dir, stickY: 0.3 });
      t += 1 / 60;
    }
    expect(t).toBeGreaterThan(0.5);
    expect(t).toBeLessThan(3);
  });

  it('is deterministic', () => {
    const a = rig('reefpass', 9, 3);
    const b = rig('reefpass', 9, 3);
    const script = (t: number) => ({ stickX: Math.sin(t * 1.3), stickY: Math.cos(t * 0.7), carve: t % 3 < 1 });
    a.run(30, {}, script);
    b.run(30, {}, script);
    expect(a.rider.snapshot()).toEqual(b.rider.snapshot());
  });
});

describe('launch and landing', () => {
  it('loads a jump, launches at the lip and lands', () => {
    const { rider, run, log, wave } = rig();
    const dir = wave.params.direction;
    run(2, { stickY: 1 }); // build speed
    // hold jump and steer up the face until the lip, then release
    let launched = false;
    for (let i = 0; i < 60 * 5 && !launched; i++) {
      wave.step(DT, rider.u);
      const atLip = rider.v > 0.9;
      rider.step(DT, { ...NEUTRAL_INPUT, stickX: dir * 1, stickY: 0.2, jump: !atLip });
      if (rider.state === 'air') launched = true;
    }
    expect(launched).toBe(true);
    expect(log).toContain('launch');
    // fly and land with no spin: the heading mirrors automatically → not a wipeout
    let landed = false;
    for (let i = 0; i < 60 * 6 && !landed; i++) {
      wave.step(DT, rider.u);
      rider.step(DT, NEUTRAL_INPUT);
      if (rider.state !== 'air') landed = true;
    }
    expect(landed).toBe(true);
    expect(rider.lastLanding).not.toBeNull();
    expect(rider.airTime).toBeGreaterThan(0.6);
    expect(log.some((l) => l.startsWith('land:'))).toBe(true);
  });

  it('spinning a full 360 with mid stats lands perfect or sloppy on an 8 ft wave', () => {
    const { rider, run, wave, log } = rig();
    const dir = wave.params.direction;
    run(2.5, { stickY: 1 });
    for (let i = 0; i < 60 * 5 && rider.state !== 'air'; i++) {
      wave.step(DT, rider.u);
      rider.step(DT, { ...NEUTRAL_INPUT, stickX: dir * 1, stickY: 0.2, jump: rider.v < 0.9 });
    }
    expect(rider.state).toBe('air');
    // spin until 360 then hold
    for (let i = 0; i < 60 * 6 && rider.state === 'air'; i++) {
      wave.step(DT, rider.u);
      const spin = Math.abs(rider.airYaw) < Math.PI * 2 - 0.15;
      rider.step(DT, { ...NEUTRAL_INPUT, spinRight: spin });
    }
    expect(['land:perfect', 'land:sloppy'].some((x) => log.includes(x))).toBe(true);
    expect(rider.lastLanding?.spins180).toBeGreaterThanOrEqual(2);
  });
});

describe('prone and wipeout cycle', () => {
  it('stands up when told and respawns after a wipeout', () => {
    const beach = getBeach('sandbar');
    const wave = new WaveModel(waveParamsFromBeach(beach, 2.5, { warnSeconds: 2.5 }), new Rng(1), 0);
    const events = new EventBus<RiderEvents>();
    const rider = new RiderSim(wave, TUNING, MID, events);
    expect(rider.state).toBe('prone');
    for (let i = 0; i < 60 * 3; i++) {
      wave.step(DT, rider.u);
      rider.step(DT, { ...NEUTRAL_INPUT, stand: i > 60 });
    }
    expect(rider.state).toBe('face');
    rider.wipeout('curl');
    expect(rider.state).toBe('wipeout');
    let respawned = false;
    events.on('respawn', () => (respawned = true));
    for (let i = 0; i < 60 * 4 && !respawned; i++) {
      wave.step(DT, rider.u);
      rider.step(DT, NEUTRAL_INPUT);
    }
    expect(respawned).toBe(true);
    expect(rider.state).toBe('prone');
    expect(rider.aheadOfCurl).toBeGreaterThan(5);
    // there is time to stand: at least 2 s before the curl arrives at break speed
    expect(rider.aheadOfCurl / wave.params.breakSpeed).toBeGreaterThan(2);
    const pose = makePose();
    rider.pose(pose);
    expect(Number.isFinite(pose.pos.x + pose.up.y + pose.forward.z)).toBe(true);
  });
});
