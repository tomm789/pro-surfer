/**
 * Design doc §14 feel checklist as measurable sim checks. Each item is a tuning target; the
 * measurements are also written to a JSON report so a tuning pass can read the actual numbers.
 */
import { describe, expect, it, afterAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Rng } from '@/core/rng';
import { EventBus } from '@/core/events';
import { TUNING } from '@/core/tuning';
import { WaveModel, waveParamsFromBeach } from '@/wave/wave';
import { getBeach } from '@/world/beaches';
import { waveFeetToMetres } from '@/world/beach';
import { RiderSim, type RiderEvents } from '@/rider/rider';
import { NEUTRAL_INPUT, type RiderInput } from '@/rider/input';
import { TrickSystem, type TrickEvents } from '@/tricks/executor';
import { RunController } from '@/scoring/run';

const DT = 1 / 60;
const MID = { spin: 0.5, speed: 0.5, air: 0.5, balance: 0.5 };
const report: Record<string, unknown> = {};

afterAll(() => {
  // `npm run feel` prints this report; LINEUP_SCRATCH overrides the directory
  try {
    const dir = process.env.LINEUP_SCRATCH ?? 'artifacts';
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/feel-report.json`, JSON.stringify(report, null, 2));
  } catch {
    /* optional */
  }
});

function rig(beachId: string, ft: number, stats = MID, seed = 5) {
  const beach = getBeach(beachId);
  const wave = new WaveModel(waveParamsFromBeach(beach, waveFeetToMetres(ft), { warnSeconds: 2.5 }), new Rng(seed), 0);
  wave.params.sections.rate = 0;
  const events = new EventBus<RiderEvents>();
  const rider = new RiderSim(wave, TUNING, stats, events, { state: 'face', u: 10, v: 0.4 }, new Rng(seed));
  const log: string[] = [];
  events.on('wipeout', (e) => log.push(`wipeout:${e.reason}`));
  events.on('launch', () => log.push('launch'));
  events.on('land', (e) => log.push(`land:${e.rating}`));
  const step = (inp: Partial<RiderInput>) => {
    wave.step(DT, rider.state === 'wipeout' ? null : rider.u);
    rider.step(DT, { ...NEUTRAL_INPUT, ...inp });
  };
  const run = (seconds: number, inp: Partial<RiderInput>) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) step(inp);
  };
  return { wave, rider, events, log, step, run };
}

/** Pump for `pumpSeconds`, climb to the lip with the jump loaded, then spin flat out until landing. */
function bigAir(beachId: string, ft: number, stats = MID, pumpSeconds = 3) {
  const r = rig(beachId, ft, stats);
  const dir = r.wave.params.direction;
  r.run(pumpSeconds, { stickY: 1 });
  const speedAtTakeoff = { v: 0 };
  for (let i = 0; i < 60 * 5 && r.rider.state !== 'air'; i++) {
    speedAtTakeoff.v = r.rider.speed;
    r.step({ stickX: dir, stickY: 0.2, jump: r.rider.v < 0.9 });
  }
  const launched = r.rider.state === 'air';
  let airTime = 0;
  let yaw = 0;
  let peak = 0;
  const y0 = r.rider.airPos.y;
  for (let i = 0; i < 60 * 8 && r.rider.state === 'air'; i++) {
    r.step({ spinRight: true });
    airTime = r.rider.airTime;
    yaw = Math.abs(r.rider.airYaw);
    peak = Math.max(peak, r.rider.airPos.y - y0);
  }
  return { launched, airTime, yaw, spins180: Math.floor((yaw - 0.15) / Math.PI), peak, speedAtTakeoff: speedAtTakeoff.v, log: r.log };
}

describe('§14 feel checklist', () => {
  it('neutral trimming mid-face holds speed and the curl does not catch you', () => {
    const r = rig('sandbar', 8);
    const speeds: number[] = [];
    for (let i = 0; i < 60 * 25; i++) {
      r.step({});
      if (i % 60 === 0) speeds.push(r.rider.speed);
    }
    report.trim = { speeds: speeds.map((s) => +s.toFixed(1)), ahead: +r.rider.aheadOfCurl.toFixed(1), curlSpeed: r.wave.params.breakSpeed, trimSpeed: TUNING.rider.trimSpeed };
    expect(r.log.filter((l) => l.startsWith('wipeout'))).toEqual([]);
    expect(r.rider.state).toBe('face');
    const late = speeds.slice(5);
    for (const s of late) expect(s).toBeGreaterThan(TUNING.rider.trimSpeed * 0.75);
    for (const s of late) expect(s).toBeLessThan(TUNING.rider.trimSpeed * 1.3);
    expect(r.rider.aheadOfCurl).toBeGreaterThan(2);
    // curl speed ≈ 0.9 × trim speed on average; beaches spread from mellow to racy for progression
    const ratios = ['sandbar', 'pointbreak', 'reefpass', 'cove', 'slab', 'outer'].map((b) => getBeach(b).breakSpeed / TUNING.rider.trimSpeed);
    report.curlRatios = ratios.map((x) => +x.toFixed(2));
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    expect(mean).toBeGreaterThan(0.8);
    expect(mean).toBeLessThan(1.0);
    for (const x of ratios) expect(x).toBeGreaterThan(0.7);
    for (const x of ratios) expect(x).toBeLessThan(1.15);
  });

  it('two pumps from trim are enough for a launch on a 7 ft wave', () => {
    const a = bigAir('sandbar', 7, MID, 1.6);
    report.twoPumpLaunch = { airTime: +a.airTime.toFixed(2), peak: +a.peak.toFixed(2), speed: +a.speedAtTakeoff.toFixed(1) };
    expect(a.launched).toBe(true);
    expect(a.airTime).toBeGreaterThan(0.7);
    expect(a.peak).toBeGreaterThan(1.0);
  });

  it('launch height scales with speed, wave height and the Air stat', () => {
    const base = bigAir('sandbar', 8, MID, 2);
    const faster = bigAir('sandbar', 8, MID, 5);
    const bigger = bigAir('sandbar', 12, MID, 2);
    const airStat = bigAir('sandbar', 8, { ...MID, air: 1 }, 2);
    report.launchScaling = {
      base: { peak: +base.peak.toFixed(2), airTime: +base.airTime.toFixed(2) },
      faster: { peak: +faster.peak.toFixed(2), airTime: +faster.airTime.toFixed(2) },
      bigger: { peak: +bigger.peak.toFixed(2), airTime: +bigger.airTime.toFixed(2) },
      airStat: { peak: +airStat.peak.toFixed(2), airTime: +airStat.airTime.toFixed(2) },
    };
    for (const a of [base, faster, bigger, airStat]) expect(a.launched).toBe(true);
    expect(faster.peak).toBeGreaterThan(base.peak * 1.1);
    expect(bigger.peak).toBeGreaterThan(base.peak * 1.1);
    expect(airStat.peak).toBeGreaterThan(base.peak * 1.1);
  });

  it('a 540 is reachable with mid Spin on an 8 ft wave; 900+ needs high Spin and a big wave', () => {
    const mid8 = bigAir('sandbar', 8, MID, 4);
    const pro12 = bigAir('outer', 12, { spin: 1, speed: 0.8, air: 0.8, balance: 0.5 }, 5);
    const pro8 = bigAir('sandbar', 8, { spin: 1, speed: 0.5, air: 0.5, balance: 0.5 }, 4);
    report.spins = { mid8: mid8.spins180, pro12: pro12.spins180, pro8: pro8.spins180, airTimes: [mid8.airTime, pro12.airTime, pro8.airTime].map((x) => +x.toFixed(2)) };
    expect(mid8.spins180).toBeGreaterThanOrEqual(3); // 540
    expect(mid8.spins180).toBeLessThan(5); // no 900 with mid spin on 8 ft
    expect(pro12.spins180).toBeGreaterThanOrEqual(5); // 900
  });

  it('tube: 6 s is comfortable for a casual player; 15 s takes fast reactions and the rail grab', () => {
    // a simulated player: reads the balance marker with some reaction latency, taps against it
    // once it passes a deadband, and holds a target depth
    const ride = (ft: number, stats: typeof MID, latencySeconds: number, deadband: number, grab: boolean, depth: [number, number]) => {
      const r = rig('reefpass', ft, stats);
      for (let i = 0; i < 60 * 6 && r.rider.state !== 'tube'; i++) r.step({ stickY: -1 });
      expect(r.rider.state).toBe('tube');
      const history: number[] = [];
      const lag = Math.round(latencySeconds / DT);
      let seconds = 0;
      for (let i = 0; i < 60 * 30 && r.rider.state === 'tube'; i++) {
        history.push(r.rider.tube.balance);
        const seen = history[Math.max(0, history.length - 1 - lag)]!;
        const stickX = Math.abs(seen) > deadband && i % 6 < 3 ? Math.sign(seen) : 0;
        const d = r.rider.tube.depth;
        r.step({ stickX, grab, stickY: d < depth[0] ? -0.5 : d > depth[1] ? 0.5 : 0 });
        seconds = r.rider.tube.seconds;
      }
      return { seconds, end: r.log.slice(-1)[0] ?? r.rider.state };
    };
    const casual = ride(9, MID, 0.3, 0.3, false, [0.3, 0.5]);
    const expert = ride(10, { ...MID, balance: 0.8 }, 0.1, 0.08, true, [0.45, 0.6]);
    report.tube = { casual, expert };
    expect(casual.seconds).toBeGreaterThan(6);
    expect(casual.seconds).toBeLessThan(15);
    expect(expert.seconds).toBeGreaterThan(15);
  });

  it('a wipeout costs about 5–8 s of clock including re-catching the wave', () => {
    const r = rig('sandbar', 8);
    const trickEvents = new EventBus<TrickEvents>();
    const tricks = new TrickSystem(r.rider, TUNING, trickEvents, r.events);
    const run = new RunController(TUNING, r.rider, r.events, tricks, trickEvents, { seconds: 120 });
    r.run(2, { stickY: 0.3 });
    run.step(2, false);
    const clockBefore = run.clock;
    r.rider.wipeout('curl');
    let t = 0;
    // a human stands about a second after the board comes back
    let proneSince = -1;
    while (r.rider.state !== 'face' && t < 15) {
      if (r.rider.state === 'prone' && proneSince < 0) proneSince = t;
      r.step({ stand: proneSince >= 0 && t - proneSince > 1.0 });
      run.step(DT, false);
      t += DT;
    }
    const cost = clockBefore - run.clock;
    report.wipeout = { deadSeconds: +t.toFixed(1), clockCost: +cost.toFixed(1), penalty: TUNING.clock.wipeoutPenaltySeconds };
    expect(r.rider.state).toBe('face');
    expect(cost).toBeGreaterThanOrEqual(5);
    expect(cost).toBeLessThanOrEqual(8);
    // and you are not immediately caught again
    r.run(3, { stickY: 0.3 });
    expect(r.rider.state).toBe('face');
  });
});
