/**
 * RunController: one timed ride. Wires rider + trick events into the special meter, chain tracker,
 * score bank and clock, and implements the cash-in and overrun rules (design doc §6).
 */
import { EventBus } from '@/core/events';
import type { Tuning } from '@/core/tuning';
import type { RiderSim, RiderEvents } from '@/rider/rider';
import type { TrickEvents, TrickSystem } from '@/tricks/executor';
import type { TrickSection } from '@/tricks/catalogue';

/** The slice of the rider the run needs (structural, so tests can fake it). */
export type RunRider = Pick<RiderSim, 'state' | 'tube' | 'aheadOfCurl'>;
export type RunTricks = Pick<TrickSystem, 'canDoSpecial'>;
import { SpecialMeter, type MeterEvents } from './meter';
import { ChainTracker, type BankedChain } from './chain';

export interface RunEvents extends MeterEvents {
  chainBanked: BankedChain;
  chainLost: BankedChain;
  scoreChanged: { total: number };
  clockZero: Record<string, never>;
  runEnd: { score: number; reason: 'time' | 'ended' };
  tubeScore: { seconds: number; value: number };
}

export interface RunOptions {
  seconds?: number;
  /** Free surf: no clock. */
  untimed?: boolean;
}

export class RunController {
  readonly events = new EventBus<RunEvents>();
  readonly meter: SpecialMeter;
  readonly chain: ChainTracker;
  score = 0;
  bySection: Record<TrickSection, number> = { face: 0, air: 0, tube: 0, exit: 0 };
  banked: BankedChain[] = [];
  bestChain = 0;
  clock: number;
  clockRunning = true;
  overrun = false;
  ended = false;
  time = 0;
  /** Seconds ridden since the last wipeout / stand. */
  rideSeconds = 0;
  longestRide = 0;
  wipeouts = 0;
  private tubeSeconds = 0;
  private tubeActive = false;
  private floaterActive = false;
  private floaterSeconds = 0;
  private untimed: boolean;
  private tubeTricks = 0;

  constructor(
    private tuning: Tuning,
    private rider: RunRider,
    riderEvents: EventBus<RiderEvents>,
    tricks: RunTricks,
    trickEvents: EventBus<TrickEvents>,
    opts: RunOptions = {},
  ) {
    this.untimed = !!opts.untimed;
    this.clock = opts.seconds ?? tuning.clock.runSeconds;
    this.meter = new SpecialMeter(tuning.meter, (k, p) => this.events.emit(k, p), () => this.time);
    this.chain = new ChainTracker(tuning.scoring);
    tricks.canDoSpecial = () => this.meter.isYellow;

    trickEvents.on('trickLand', (e) => this.onTrick(e.trick, e.section, e.aheadOfCurl, e.rotation, e.landing));
    trickEvents.on('exitMove', (e) => {
      this.onTrick(e.trick, 'exit', rider.aheadOfCurl, 0, undefined);
      this.bank(false);
    });
    riderEvents.on('land', (e) => {
      if (e.rating === 'perfect') this.meter.add(tuning.meter.perfectLanding);
      else if (e.rating === 'sloppy') this.meter.add(tuning.meter.sloppyLanding);
    });
    riderEvents.on('wipeout', (e) => {
      if (e.reason === 'exit') return; // exit moves bank instead of losing
      this.wipeouts++;
      this.longestRide = Math.max(this.longestRide, this.rideSeconds);
      this.rideSeconds = 0;
      const lost = this.chain.lose();
      if (lost) this.events.emit('chainLost', lost);
      if (tuning.meter.wipeoutResetsMeter) this.meter.reset();
      if (!this.untimed) this.clock = Math.max(0, this.clock - tuning.clock.wipeoutPenaltySeconds);
      this.tubeActive = false;
      this.floaterActive = false;
    });
    riderEvents.on('stand', () => (this.rideSeconds = 0));
    riderEvents.on('tubeEnter', () => {
      this.tubeActive = true;
      this.tubeSeconds = 0;
    });
    riderEvents.on('tubeExit', () => this.endTube());
    riderEvents.on('floaterStart', () => {
      this.floaterActive = true;
      this.floaterSeconds = 0;
    });
    riderEvents.on('floaterEnd', () => {
      this.floaterActive = false;
      this.chain.endLive('floater');
    });
    this.events.on('meterDrained', () => {
      // the chain banks automatically when the meter drains to empty (§6.2 rule 7)
      this.bank(false);
      if (this.overrun) this.end('time');
    });
  }

  private tubeValue(seconds: number): number {
    const B = this.tuning.scoring.base;
    return B.tubePerSecond * seconds + B.tubeSquaredPerSecond * seconds * seconds;
  }

  private endTube(): void {
    if (!this.tubeActive) return;
    this.tubeActive = false;
    this.chain.endLive('tube');
    this.events.emit('tubeScore', { seconds: this.tubeSeconds, value: this.tubeValue(this.tubeSeconds) });
  }

  private onTrick(trick: { id: string; name: string; base: number; meter: number; special: boolean; icon?: 'face' | 'air' | 'tube' | 'special'; section: TrickSection; input: unknown; duration: number }, section: TrickSection, aheadOfCurl: number, rotation: number, landing?: 'perfect' | 'sloppy'): void {
    const M = this.tuning.meter;
    if (this.chain.needsBankBefore(section, this.meter.isYellow)) this.bank(false);
    const prior = this.chain.entries.filter((e) => e.id === trick.id).length;
    const spins180 = Math.round(rotation / Math.PI);
    this.chain.add(trick as never, section, { aheadOfCurl, spins180, landing, meterYellow: this.meter.isYellow });
    // meter: unique tricks fill; repeats drain
    if (prior > 0) this.meter.add(-M.repeatDrain);
    else if (trick.special) this.meter.add(M.fill.special);
    else if (section === 'face') this.meter.add(M.fill.faceTrick);
    else if (section === 'air') this.meter.add(M.fill.grabOrFlip);
    else this.meter.add(trick.meter || M.fill.grabOrFlip);
    if (section === 'tube') this.tubeTricks++;
  }

  cashIn(): BankedChain | null {
    if (!this.meter.isYellow && !this.chain.open) return null;
    return this.bank(true);
  }

  private bank(cashedIn: boolean): BankedChain | null {
    const banked = this.chain.bank(cashedIn);
    if (!banked) return null;
    this.score += banked.total;
    for (const s of Object.keys(banked.bySection) as TrickSection[]) this.bySection[s] += banked.bySection[s];
    this.banked.push(banked);
    this.bestChain = Math.max(this.bestChain, banked.total);
    this.events.emit('chainBanked', banked);
    this.events.emit('scoreChanged', { total: this.score });
    if (cashedIn) this.meter.reset();
    return banked;
  }

  step(dt: number, cashInPressed: boolean): void {
    if (this.ended) return;
    this.time += dt;
    if (this.rider.state === 'face' || this.rider.state === 'tube' || this.rider.state === 'air' || this.rider.state === 'floater') this.rideSeconds += dt;
    this.meter.step(dt);
    this.chain.step(dt);
    if (this.tubeActive) {
      this.tubeSeconds += dt;
      const depth = this.rider.tube.depth;
      this.meter.add(this.tuning.meter.fill.tubePerSecond * dt * (0.6 + 0.8 * depth));
      this.chain.updateLive('tube', 'Tube', 'tube', this.tubeValue(this.tubeSeconds) * (0.7 + 0.6 * depth), this.rider.aheadOfCurl);
    }
    if (this.floaterActive) {
      this.floaterSeconds += dt;
      this.meter.add(this.tuning.meter.fill.floaterPerSecond * dt);
      this.chain.updateLive('floater', 'Floater', 'face', this.tuning.scoring.base.floaterPerSecond * this.floaterSeconds, this.rider.aheadOfCurl);
    }
    // idle rule: a chain with no new tricks while the meter is not yellow banks after a few seconds
    if (this.chain.open && !this.meter.isYellow && this.chain.idle > this.tuning.scoring.idleBankSeconds && !this.tubeActive && !this.floaterActive) this.bank(false);
    if (cashInPressed) this.cashIn();
    if (!this.untimed && this.clockRunning) {
      this.clock -= dt;
      if (this.clock <= 0) {
        this.clock = 0;
        this.clockRunning = false;
        this.events.emit('clockZero', {});
        // the run continues until the meter drains (§6.4) unless nothing is open
        if (this.tuning.clock.overrunUntilMeterDrains && (this.meter.isYellow || this.chain.open)) this.overrun = true;
        else this.end('time');
      }
    }
    if (this.overrun && !this.meter.isYellow && !this.chain.open) this.end('time');
  }

  end(reason: 'time' | 'ended'): void {
    if (this.ended) return;
    this.bank(false);
    this.ended = true;
    this.longestRide = Math.max(this.longestRide, this.rideSeconds);
    this.events.emit('runEnd', { score: this.score, reason });
  }

  snapshot(): Record<string, unknown> {
    return {
      score: this.score,
      clock: +this.clock.toFixed(1),
      meter: +this.meter.value.toFixed(2),
      meterState: this.meter.state,
      yellowSeconds: +this.meter.totalYellowSeconds.toFixed(1),
      chain: this.chain.label(),
      chainTotal: this.chain.total,
      multiplier: this.chain.multiplier,
      bestChain: this.bestChain,
      bySection: this.bySection,
      wipeouts: this.wipeouts,
      overrun: this.overrun,
      ended: this.ended,
    };
  }
}
