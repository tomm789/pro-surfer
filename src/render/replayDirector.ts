/**
 * TV-style replay direction (design doc §11): cuts between a beach camera, a wide follow, a tight
 * close-up and the chase cam; slow motion through the air; the tube cam inside the barrel.
 */
import { Rng } from '@/core/rng';
import type { RiderState } from '@/rider/rider';
import type { CameraMode } from './chaseCamera';

const SEQUENCE: CameraMode[] = ['beach', 'chase', 'close', 'wide'];

export class ReplayDirector {
  mode: CameraMode = 'beach';
  /** Sim speed multiplier: <1 is slow motion. */
  speed = 1;
  /** True on the step where the camera should cut (snap instead of glide). */
  cut = true;
  private t = 0;
  private nextCut = 0;
  private shot = 0;
  private wasAir = false;
  private rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    this.nextCut = 2.8;
  }

  update(dt: number, state: RiderState, airTime: number): void {
    this.t += dt;
    this.cut = false;
    const inTube = state === 'tube';
    const inAir = state === 'air';
    if (inTube && this.mode !== 'tube') this.setMode('tube');
    else if (!inTube && this.mode === 'tube') this.advance();
    else if (inAir && !this.wasAir && this.mode === 'beach' && this.rng.next() < 0.5) this.setMode('wide');
    else if (this.t >= this.nextCut && !inAir) this.advance();
    this.wasAir = inAir;
    // slow motion on the way up and over the peak of an air, back to speed for the landing
    this.speed = inAir ? (airTime < 0.9 ? 0.42 : 0.7) : state === 'wipeout' ? 0.6 : 1;
  }

  private advance(): void {
    this.shot = (this.shot + 1) % SEQUENCE.length;
    this.setMode(SEQUENCE[this.shot]!);
  }

  private setMode(m: CameraMode): void {
    this.mode = m;
    this.cut = true;
    this.nextCut = this.t + 2.4 + this.rng.next() * 2.2;
  }
}
