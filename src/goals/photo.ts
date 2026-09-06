/**
 * Photo director (design doc §7 "Photo events"): a viewfinder appears with a four-beep countdown;
 * be mid-trick on beep three and landing when the shutter fires to score the photo.
 */
export interface PhotoShot {
  value: number;
  trick: string;
  special: boolean;
  time: number;
}

export interface PhotoOptions {
  shots: number;
  beeps: number;
  beepIntervalSeconds: number;
  runSeconds: number;
}

export type PhotoPhase = 'idle' | 'countdown' | 'flash';

export interface PhotoSubject {
  /** Trick performed or landed within the shutter window, if any. */
  trick: { id: string; name: string; base: number; special: boolean } | null;
  /** Multiplier context: chain multiplier at the moment. */
  multiplier: number;
  inTube: boolean;
  tubeDepth: number;
  inAir: boolean;
  landedRecently: boolean;
  wipedOut: boolean;
}

export class PhotoDirector {
  readonly shots: PhotoShot[] = [];
  phase: PhotoPhase = 'idle';
  beep = 0;
  private schedule: number[] = [];
  private beepTimer = 0;
  private flashTimer = 0;
  lastValue = 0;

  constructor(private opts: PhotoOptions) {
    // spread the shots across the run, avoiding the first and last 12 s
    for (let i = 0; i < opts.shots; i++) {
      const f = (i + 1) / (opts.shots + 1);
      this.schedule.push(12 + (opts.runSeconds - 24) * f);
    }
  }

  get nextShotAt(): number | null {
    return this.schedule[0] ?? null;
  }

  get total(): number {
    return this.shots.reduce((s, p) => s + p.value, 0);
  }

  get best(): number {
    return this.shots.reduce((s, p) => Math.max(s, p.value), 0);
  }

  get bestSpecial(): number {
    return this.shots.filter((p) => p.special).reduce((s, p) => Math.max(s, p.value), 0);
  }

  /** Call every step. `subject()` is queried at the shutter. Returns 'beep' | 'shutter' | null for audio/HUD. */
  step(dt: number, runTime: number, subject: () => PhotoSubject): 'beep' | 'shutter' | null {
    if (this.phase === 'flash') {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.phase = 'idle';
      return null;
    }
    if (this.phase === 'idle') {
      if (this.schedule.length && runTime >= this.schedule[0]!) {
        this.schedule.shift();
        this.phase = 'countdown';
        this.beep = 1;
        this.beepTimer = this.opts.beepIntervalSeconds;
        return 'beep';
      }
      return null;
    }
    // countdown
    this.beepTimer -= dt;
    if (this.beepTimer <= 0) {
      this.beep++;
      this.beepTimer = this.opts.beepIntervalSeconds;
      if (this.beep >= this.opts.beeps) {
        this.shutter(runTime, subject());
        return 'shutter';
      }
      return 'beep';
    }
    return null;
  }

  private shutter(time: number, s: PhotoSubject): void {
    let value = 0;
    let trick = '';
    let special = false;
    if (!s.wipedOut) {
      if (s.trick) {
        value = Math.round(s.trick.base * 2 * Math.max(1, s.multiplier * 0.5) * (s.landedRecently || s.inAir ? 1.25 : 1));
        trick = s.trick.name;
        special = s.trick.special;
      } else if (s.inTube) {
        value = Math.round(600 + 1800 * s.tubeDepth);
        trick = 'Tube';
      } else if (s.inAir) {
        value = 400;
        trick = 'Air';
      }
    }
    this.lastValue = value;
    this.shots.push({ value, trick, special, time });
    this.phase = 'flash';
    this.flashTimer = 1.2;
  }
}
