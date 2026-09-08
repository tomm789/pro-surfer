/**
 * Emergent trick recognition (docs/MECHANICS.md): with the sticks driving the body, a turn is not a
 * button combination — it is something the board did. This watches the physics, decides when a turn
 * started and ended, classifies what it was, and emits it as a named trick into the normal scoring.
 *
 * Deterministic and DOM-free: it reads numbers off the rider and emits events.
 */
import { clamp, lerp } from '@/core/math';
import type { EventBus } from '@/core/events';
import type { Tuning } from '@/core/tuning';
import type { Trick } from './catalogue';
import type { TrickEvents } from './executor';

/** The rider surface the recogniser needs — kept structural so tests can drive it directly. */
export interface RecognizerRider {
  state: string;
  v: number;
  speed: number;
  heading: number;
  boardYaw: number;
  aheadOfCurl: number;
  slideSeconds: number;
  stance: { rail: number; compression: number; trim: number; twist: number };
}

export type TurnKind = 'bottomTurn' | 'snap' | 'offTheLip' | 'cutback' | 'roundhouse' | 'tailSlide' | 'layback' | 'carve';

const NAMES: Record<TurnKind, string> = {
  bottomTurn: 'Bottom Turn',
  snap: 'Snap',
  offTheLip: 'Off the Lip',
  cutback: 'Cutback',
  roundhouse: 'Roundhouse',
  tailSlide: 'Tail Slide',
  layback: 'Layback',
  carve: 'Carve',
};

/** A completed turn, before it is scored. Exposed so tests and the HUD can read the shape of a move. */
export interface TurnSummary {
  kind: TurnKind;
  /** 0…1 how committed the turn was: rail, direction change and height on the face. */
  quality: number;
  peakRail: number;
  headingSwing: number;
  peakV: number;
  minV: number;
  peakYaw: number;
  seconds: number;
  reversed: boolean;
}

function makeTrick(kind: TurnKind, base: number, special: boolean): Trick {
  return {
    id: kind,
    name: NAMES[kind],
    section: 'face',
    input: { kind: 'dir', button: 'carve', direction: 'up' },
    base,
    meter: 0,
    duration: 0,
    special,
    icon: 'face',
  };
}

export class TrickRecognizer {
  private active = false;
  private seconds = 0;
  private sign = 0;
  private peakRail = 0;
  private peakYaw = 0;
  private peakV = 0;
  private minV = 1;
  private startHeading = 0;
  private swing = 0;
  private reversed = false;
  private sinceLast = 10;
  /** The most recent recognised turn, for the HUD and for tests. */
  last: TurnSummary | null = null;

  constructor(
    private tuning: Tuning,
    private events: EventBus<TrickEvents>,
  ) {}

  reset(): void {
    this.active = false;
    this.seconds = 0;
    this.swing = 0;
    this.reversed = false;
    this.last = null;
  }

  step(dt: number, r: RecognizerRider): void {
    const R = this.tuning.recognizer;
    this.sinceLast += dt;
    const rail = r.stance.rail;
    const onFace = r.state === 'face';
    if (!onFace) {
      // leaving the face abandons any turn in progress: an air or a wipeout is not a completed turn
      this.active = false;
      return;
    }
    if (!this.active) {
      if (Math.abs(rail) >= R.engageRail && this.sinceLast > R.minGapSeconds) {
        this.active = true;
        this.seconds = 0;
        this.sign = Math.sign(rail);
        this.peakRail = Math.abs(rail);
        this.peakYaw = Math.abs(r.boardYaw);
        this.peakV = r.v;
        this.minV = r.v;
        this.startHeading = r.heading;
        this.swing = 0;
        this.reversed = false;
      }
      return;
    }
    // tracking
    this.seconds += dt;
    this.peakRail = Math.max(this.peakRail, Math.abs(rail));
    this.peakYaw = Math.max(this.peakYaw, Math.abs(r.boardYaw));
    this.peakV = Math.max(this.peakV, r.v);
    this.minV = Math.min(this.minV, r.v);
    this.swing = Math.max(this.swing, Math.abs(r.heading - this.startHeading));
    // a rail reversal inside one turn is the signature of a roundhouse
    if (Math.sign(rail) === -this.sign && Math.abs(rail) >= R.engageRail) this.reversed = true;

    const released = Math.abs(rail) < R.releaseRail;
    if (released || this.seconds >= R.maxSeconds) this.finish(r);
  }

  private finish(r: RecognizerRider): void {
    const R = this.tuning.recognizer;
    this.active = false;
    this.sinceLast = 0;
    // a nudge of the rail while trimming is not a turn
    if (this.swing < R.minSwingRad && this.peakYaw < R.minYawRad) return;

    const kind = this.classify(r);
    const commitment = clamp(this.peakRail, 0, 1);
    const direction = clamp(this.swing / R.fullSwingRad, 0, 1);
    const height = clamp(this.peakV, 0, 1);
    const quality = clamp(0.45 * commitment + 0.35 * direction + 0.2 * height, 0, 1);
    const summary: TurnSummary = {
      kind,
      quality,
      peakRail: this.peakRail,
      headingSwing: this.swing,
      peakV: this.peakV,
      minV: this.minV,
      peakYaw: this.peakYaw,
      seconds: this.seconds,
      reversed: this.reversed,
    };
    this.last = summary;
    const B = this.tuning.scoring.base.faceBasic;
    const base = lerp(B[0], B[1], quality) * (R.worth[kind] ?? 1);
    const special = kind === 'roundhouse' || kind === 'layback';
    this.events.emit('trickLand', {
      trick: makeTrick(kind, Math.round(base), special),
      section: 'face',
      aheadOfCurl: r.aheadOfCurl,
      rotation: 0,
      landing: quality > R.perfectQuality ? 'perfect' : undefined,
      atLip: this.peakV > R.lipV,
    });
  }

  private classify(r: RecognizerRider): TurnKind {
    const R = this.tuning.recognizer;
    const sliding = r.slideSeconds > R.slideSeconds || this.peakYaw > R.slideYawRad;
    if (this.reversed) return 'roundhouse';
    if (sliding && this.peakV > R.lipV) return 'snap';
    if (sliding) return this.peakRail > R.laybackRail ? 'layback' : 'tailSlide';
    if (this.peakV > R.lipV) return 'offTheLip';
    if (this.peakV > R.highV) return 'snap';
    if (this.minV < R.bottomV && this.sign > 0) return 'bottomTurn';
    if (this.sign < 0 && this.seconds > R.cutbackSeconds) return 'cutback';
    return 'carve';
  }
}
