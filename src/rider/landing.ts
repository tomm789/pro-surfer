import { wrapAngle, DEG } from '@/core/math';

export type LandingRating = 'perfect' | 'sloppy' | 'wipeout';

export interface LandingJudgement {
  rating: LandingRating;
  /** Signed angular error from the ideal landing heading, radians (folded for fakie). */
  errorRad: number;
  /** True when the board landed pointing backwards (still Perfect if within the window). */
  fakie: boolean;
  /** Number of full 180° rotations completed in the air. */
  spins180: number;
  /** Number of full rolls about the board's long axis completed in the air (the flips). */
  flips: number;
  /** Signed roll residual from flat at touchdown, radians. */
  rollErrorRad: number;
}

/**
 * Design doc §6.2 rule 3: a Perfect landing is at the mirror angle of the launch (nose pointed down the face).
 * Landing backwards counts the same ("perfect is still perfect backwards"). Windows come from tuning.
 * The roll (the flip axis, stick scheme only) is judged the same way against flat: the landing takes the
 * worse of the two ratings, and a roll landed inside its window counts as that many flips.
 */
export function judgeLanding(
  launchHeading: number,
  boardYawAtLanding: number,
  perfectWindowDeg: number,
  sloppyWindowDeg: number,
  totalSpin: number,
  totalRoll = 0,
  rollPerfectDeg = 25,
  rollSloppyDeg = 60,
): LandingJudgement {
  const ideal = -launchHeading;
  let err = wrapAngle(boardYawAtLanding - ideal);
  let fakie = false;
  if (Math.abs(err) > Math.PI / 2) {
    err = wrapAngle(err - Math.sign(err) * Math.PI);
    fakie = true;
  }
  const a = Math.abs(err);
  const yawRating: LandingRating = a <= perfectWindowDeg * DEG ? 'perfect' : a <= sloppyWindowDeg * DEG ? 'sloppy' : 'wipeout';
  // the roll residual is the distance from the nearest full roll (landing upside down is a wipeout)
  const rollErr = wrapAngle(totalRoll);
  const r = Math.abs(rollErr);
  const rollRating: LandingRating = r <= rollPerfectDeg * DEG ? 'perfect' : r <= rollSloppyDeg * DEG ? 'sloppy' : 'wipeout';
  const order: LandingRating[] = ['perfect', 'sloppy', 'wipeout'];
  const rating = order[Math.max(order.indexOf(yawRating), order.indexOf(rollRating))]!;
  // nearest multiple of 180° / 360°: a 350° spin landed inside the window is a 360
  return { rating, errorRad: err, fakie, spins180: Math.round(Math.abs(totalSpin) / Math.PI), flips: Math.round(Math.abs(totalRoll) / (Math.PI * 2)), rollErrorRad: rollErr };
}
