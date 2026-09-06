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
}

/**
 * Design doc §6.2 rule 3: a Perfect landing is at the mirror angle of the launch (nose pointed down the face).
 * Landing backwards counts the same ("perfect is still perfect backwards"). Windows come from tuning.
 */
export function judgeLanding(launchHeading: number, boardYawAtLanding: number, perfectWindowDeg: number, sloppyWindowDeg: number, totalSpin: number): LandingJudgement {
  const ideal = -launchHeading;
  let err = wrapAngle(boardYawAtLanding - ideal);
  let fakie = false;
  if (Math.abs(err) > Math.PI / 2) {
    err = wrapAngle(err - Math.sign(err) * Math.PI);
    fakie = true;
  }
  const a = Math.abs(err);
  const rating: LandingRating = a <= perfectWindowDeg * DEG ? 'perfect' : a <= sloppyWindowDeg * DEG ? 'sloppy' : 'wipeout';
  // nearest multiple of 180°: a 350° spin landed inside the window is a 360
  return { rating, errorRad: err, fakie, spins180: Math.round(Math.abs(totalSpin) / Math.PI) };
}
