/**
 * TrickSystem: reads rider state + input each step, asks the sequencer what the player meant,
 * validates it against the current section and special-meter gate, and lands or loses tricks.
 * Emits events consumed by scoring (M5), the HUD and audio.
 */
import type { EventBus } from '@/core/events';
import type { Tuning } from '@/core/tuning';
import type { RiderSim, RiderEvents } from '@/rider/rider';
import type { RiderInput } from '@/rider/input';
import { InputSequencer } from './sequencer';
import { type Trick, type TrickButton, type TrickCatalogue, type TrickSection, TRICKS } from './catalogue';

export interface LandedTrick {
  trick: Trick;
  section: TrickSection;
  /** Metres ahead of the curl when performed (proximity bonus). */
  aheadOfCurl: number;
  /** For air tricks: rotation in radians at landing. */
  rotation: number;
  /** Air landing rating if applicable. */
  landing?: 'perfect' | 'sloppy';
  /** Time in the tube at the moment of the trick (for depth bonuses). */
  tubeDepth?: number;
  atLip: boolean;
}

export interface TrickEvents extends Record<string, unknown> {
  trickStart: { trick: Trick; section: TrickSection };
  trickLand: LandedTrick;
  trickFail: { trick: Trick; reason: 'wipeout' | 'interrupted' };
  /** A special was attempted but the meter isn't flashing: HUD hint. */
  specialLocked: { trick: Trick };
  exitMove: { trick: Trick };
}

interface Active {
  trick: Trick;
  remaining: number;
  aheadOfCurl: number;
  atLip: boolean;
  tubeDepth?: number;
}

export class TrickSystem {
  readonly sequencer: InputSequencer;
  private active: Active | null = null;
  /** Air tricks performed this flight; they land (or are lost) with the rider. */
  private pendingAir: Active[] = [];
  private holdAccum = { carve: 0, grab: 0, slide: 0 } as Record<TrickButton, number>;
  private holdHeading = 0;
  private holdFired = { carve: false, grab: false, slide: false } as Record<TrickButton, boolean>;
  private prevState = '';
  /** Gate for special tricks; scoring wires this to the meter (M5). */
  canDoSpecial: () => boolean = () => true;
  /** Unlocked trick ids; null = everything unlocked. */
  unlocked: Set<string> | null = null;

  constructor(
    private rider: RiderSim,
    private tuning: Tuning,
    private events: EventBus<TrickEvents>,
    riderEvents: EventBus<RiderEvents>,
    private catalogue: TrickCatalogue = TRICKS,
  ) {
    this.sequencer = new InputSequencer(catalogue, tuning.input);
    riderEvents.on('land', (e) => this.onLand(e.rating, e.spins180, e.u));
    riderEvents.on('wipeout', () => this.onWipeout());
    riderEvents.on('launch', () => {
      this.pendingAir = [];
      this.finishActive('interrupted');
    });
  }

  get activeTrick(): Trick | null {
    return this.active?.trick ?? null;
  }

  get pendingAirTricks(): Trick[] {
    return this.pendingAir.map((a) => a.trick);
  }

  private sectionFor(): TrickSection | null {
    switch (this.rider.state) {
      case 'face':
      case 'floater':
        return 'face';
      case 'air':
        return 'air';
      case 'tube':
        return 'tube';
      default:
        return null;
    }
  }

  private allowed(trick: Trick): boolean {
    if (this.unlocked && !this.unlocked.has(trick.id)) return false;
    return true;
  }

  step(dt: number, input: Readonly<RiderInput>): void {
    const pressed = this.sequencer.update(dt, input);
    const section = this.sectionFor();
    if (this.rider.state !== this.prevState) {
      // leaving a section interrupts an in-progress trick (except air tricks which are pending)
      if (this.active && section !== 'air') this.finishActive('interrupted');
      this.prevState = this.rider.state;
      this.resetHolds();
    }
    if (!section) return;

    // committed trick animation ticking down
    if (this.active) {
      this.active.remaining -= dt;
      if (this.active.remaining <= 0) this.completeActive();
    }

    // exit move (air only): slide, slide, then direction
    if (section === 'air') {
      const exit = this.sequencer.exitMatch('air');
      if (exit && this.allowed(exit)) {
        this.events.emit('exitMove', { trick: exit });
        this.pendingAir = [];
        this.sequencer.reset();
        return;
      }
    }

    for (const button of pressed) {
      const atLip = this.rider.v > 0.75;
      const matches = this.sequencer.matches(button, section, atLip);
      let chosen: Trick | null = null;
      for (const m of matches) {
        if (!this.allowed(m.trick)) continue;
        if (m.trick.special && !this.canDoSpecial()) {
          this.events.emit('specialLocked', { trick: m.trick });
          continue;
        }
        chosen = m.trick;
        break;
      }
      if (chosen) this.start(chosen, section, atLip);
    }

    this.updateHolds(dt, input, section);
  }

  private start(trick: Trick, section: TrickSection, atLip: boolean): void {
    const a: Active = {
      trick,
      remaining: trick.duration,
      aheadOfCurl: this.rider.aheadOfCurl,
      atLip,
      tubeDepth: section === 'tube' ? this.rider.tube.depth : undefined,
    };
    this.events.emit('trickStart', { trick, section });
    if (section === 'air') {
      // up to two tricks per air (design doc §5.3); a third replaces the last
      if (this.pendingAir.length >= 2) this.pendingAir.pop();
      this.pendingAir.push(a);
      return;
    }
    if (this.active) this.finishActive('interrupted');
    this.active = a;
    if (trick.duration <= 0) this.completeActive();
  }

  private completeActive(): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.events.emit('trickLand', {
      trick: a.trick,
      section: a.trick.section,
      aheadOfCurl: a.aheadOfCurl,
      rotation: 0,
      tubeDepth: a.tubeDepth,
      atLip: a.atLip,
    });
  }

  private finishActive(reason: 'wipeout' | 'interrupted'): void {
    if (!this.active) return;
    const t = this.active.trick;
    this.active = null;
    this.events.emit('trickFail', { trick: t, reason });
  }

  private onLand(rating: 'perfect' | 'sloppy' | 'wipeout', spins180: number, _u: number): void {
    if (rating === 'wipeout') {
      for (const a of this.pendingAir) this.events.emit('trickFail', { trick: a.trick, reason: 'wipeout' });
      this.pendingAir = [];
      return;
    }
    const rotation = spins180 * Math.PI;
    for (const a of this.pendingAir) {
      this.events.emit('trickLand', { trick: a.trick, section: 'air', aheadOfCurl: this.rider.aheadOfCurl, rotation, landing: rating, atLip: false });
    }
    if (!this.pendingAir.length && spins180 > 0) {
      // a plain rotation with no grab is still a trick: synthesise it from the catalogue-free "spin" entry
      this.events.emit('trickLand', { trick: spinTrick(spins180), section: 'air', aheadOfCurl: this.rider.aheadOfCurl, rotation, landing: rating, atLip: false });
    }
    this.pendingAir = [];
  }

  private onWipeout(): void {
    this.finishActive('wipeout');
    for (const a of this.pendingAir) this.events.emit('trickFail', { trick: a.trick, reason: 'wipeout' });
    this.pendingAir = [];
    this.sequencer.reset();
    this.resetHolds();
  }

  private resetHolds(): void {
    this.holdAccum = { carve: 0, grab: 0, slide: 0 };
    this.holdFired = { carve: false, grab: false, slide: false };
    this.holdHeading = this.rider.heading;
  }

  /** Held-button tricks: carve/grab turns count after enough heading change; slides after holdSeconds. */
  private updateHolds(dt: number, input: Readonly<RiderInput>, section: TrickSection): void {
    if (section !== 'face' || this.rider.state !== 'face') return;
    const turning = Math.abs(input.stickX) > 0.4;
    for (const trick of this.catalogue.bySection('face')) {
      const inp = trick.input;
      if (inp.kind !== 'hold') continue;
      const held = input[inp.button] && (!inp.with || input[inp.with]) && turning;
      const key = inp.with ? inp.with : inp.button; // power slide shares the slide key but needs grab too
      if (!held) {
        if (!inp.with) {
          this.holdAccum[key] = 0;
          this.holdFired[key] = false;
          this.holdHeading = this.rider.heading;
        }
        continue;
      }
      if (this.holdFired[key]) continue;
      if (inp.holdRadians !== undefined) {
        this.holdAccum[key] += Math.abs(this.rider.heading - this.holdHeading);
        this.holdHeading = this.rider.heading;
        if (this.holdAccum[key] >= inp.holdRadians) this.fireHold(trick, key);
      } else if (inp.holdSeconds !== undefined) {
        this.holdAccum[key] += dt;
        if (this.holdAccum[key] >= inp.holdSeconds) this.fireHold(trick, key);
      }
    }
  }

  private fireHold(trick: Trick, key: TrickButton): void {
    if (!this.allowed(trick)) return;
    this.holdFired[key] = true;
    this.events.emit('trickStart', { trick, section: 'face' });
    this.events.emit('trickLand', { trick, section: 'face', aheadOfCurl: this.rider.aheadOfCurl, rotation: 0, atLip: this.rider.v > 0.75 });
  }
}

/** Synthetic rotation trick (180/360/540…). Not in the data file because its value is computed. */
export function spinTrick(spins180: number): Trick {
  const deg = spins180 * 180;
  return {
    id: `spin${deg}`,
    name: `${deg}`,
    section: 'air',
    input: { kind: 'dir', button: 'carve', direction: 'up' },
    base: 0,
    meter: 0.08,
    duration: 0,
    special: false,
    icon: 'air',
  };
}
