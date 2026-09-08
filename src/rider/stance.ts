/**
 * Stance model (docs/MECHANICS.md §2): reduces two stick vectors — left = back foot, right = front foot —
 * to the five quantities the board physics and the character animation both read.
 *
 * Convention that never inverts: down on a stick presses that foot, up unweights it.
 */
import { clamp, damp } from '@/core/math';
import type { Tuning } from '@/core/tuning';
import type { RiderInput } from './input';

export interface StanceState {
  /** −1 fully extended … +1 deep crouch. */
  compression: number;
  /** −1 weight on the tail … +1 weight on the nose. */
  trim: number;
  /** Rail engagement, −1 heel … +1 toe, already signed toward the wave wall. */
  rail: number;
  /** Feet pushing opposite ways: board yaw torque, signed toward the wall. */
  twist: number;
  /** Energy put in this frame by pumping in time with the face, 0…1. */
  pumpWork: number;
  /** Stored load available to a pop, 0…1 (decays if you sit in a crouch). */
  load: number;
  /** Non-zero on the frame a loaded crouch is released explosively; carries the load. */
  pop: number;
}

export function makeStance(): StanceState {
  return { compression: 0, trim: 0, rail: 0, twist: 0, pumpWork: 0, load: 0, pop: 0 };
}

export class StanceModel {
  readonly state = makeStance();
  private prevCompression = 0;
  private peak = 0;

  constructor(private tuning: Tuning) {}

  reset(): void {
    const s = this.state;
    s.compression = s.trim = s.rail = s.twist = s.pumpWork = s.load = s.pop = 0;
    this.prevCompression = 0;
    this.peak = 0;
  }

  /**
   * @param direction  wave break direction (+1 right-hander), so `rail` and `twist` are signed toward the wall
   * @param sinH       sin of the rider's heading: > 0 climbing the face, < 0 dropping
   */
  update(dt: number, input: Readonly<RiderInput>, direction: number, sinH: number): StanceState {
    const T = this.tuning.stance;
    const s = this.state;
    const pressBack = clamp(-input.backY, -1, 1);
    const pressFront = clamp(-input.frontY, -1, 1);
    const rawCompression = (pressBack + pressFront) / 2;
    const rawTrim = (pressFront - pressBack) / 2;
    const rawRail = direction * clamp((input.backX + input.frontX) / 2, -1, 1);
    const rawTwist = direction * clamp((input.frontX - input.backX) / 2, -1, 1);

    // the body has mass: it follows the sticks fast, but never instantly
    s.compression = damp(s.compression, rawCompression, T.footFollowRate, dt);
    s.trim = damp(s.trim, rawTrim, T.footFollowRate, dt);
    s.rail = damp(s.rail, rawRail, T.railFollowRate, dt);
    s.twist = damp(s.twist, rawTwist, T.footFollowRate, dt);

    const rate = (s.compression - this.prevCompression) / Math.max(dt, 1e-6);
    this.prevCompression = s.compression;

    // §4 energy loop: extend into the climb, compress through the bottom. Out of phase gives nothing.
    let work = 0;
    if (sinH > T.pumpPhaseDeadzone) work = Math.max(0, -rate);
    else if (sinH < -T.pumpPhaseDeadzone) work = Math.max(0, rate);
    s.pumpWork = clamp(work / T.pumpFullRate, 0, 1);

    // stored load decays if you just sit in a crouch, so a pop has to follow the compression
    this.peak = Math.max(s.compression, this.peak - dt / T.loadDecaySeconds);
    s.load = clamp(this.peak, 0, 1);
    s.pop = rate < -T.popRate ? s.load : 0;
    if (s.pop > 0) this.peak = 0;
    return s;
  }
}

/**
 * Classic single-stick input expressed as foot axes, so the character still reacts in classic mode.
 * Up (pump) reads as weight forward and the back foot light; down (stall) as weight on the tail.
 */
export function stanceFromClassic(input: RiderInput): void {
  input.backX = input.stickX;
  input.frontX = input.stickX;
  input.backY = input.stickY;
  input.frontY = -input.stickY;
}
