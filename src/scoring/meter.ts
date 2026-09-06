/** Special meter (design doc §6.1): empty → green (filling) → yellow (flashing, full) → draining. */
import { clamp } from '@/core/math';
import type { Tuning } from '@/core/tuning';

export type MeterState = 'empty' | 'green' | 'yellow';

export interface MeterEvents extends Record<string, unknown> {
  meterYellow: { at: number };
  meterDrained: { yellowSeconds: number };
}

export class SpecialMeter {
  value = 0;
  state: MeterState = 'empty';
  /** Seconds spent flashing yellow in the current yellow stretch. */
  yellowSeconds = 0;
  /** Total yellow seconds this run (for "special time" goals). */
  totalYellowSeconds = 0;
  private emit: <K extends keyof MeterEvents>(k: K, p: MeterEvents[K]) => void;

  constructor(
    private tuning: Tuning['meter'],
    emit?: <K extends keyof MeterEvents>(k: K, p: MeterEvents[K]) => void,
    private time = () => 0,
  ) {
    this.emit = emit ?? (() => undefined);
  }

  get isYellow(): boolean {
    return this.state === 'yellow';
  }

  /** Add (or subtract) meter. Positive amounts while yellow top it back up. */
  add(amount: number): void {
    const wasYellow = this.state === 'yellow';
    this.value = clamp(this.value + amount, 0, 1);
    if (this.value >= 1) {
      this.state = 'yellow';
      if (!wasYellow) {
        this.yellowSeconds = 0;
        this.emit('meterYellow', { at: this.time() });
      }
    } else if (wasYellow) {
      // a hit while yellow (sloppy landing, repeat) that knocks it below full: keep flashing until drained
      // (the design's "draining" state is still yellow)
      this.state = this.value > 0 ? 'yellow' : 'empty';
      if (this.state === 'empty') this.drained();
    } else {
      this.state = this.value > 0 ? 'green' : 'empty';
    }
  }

  step(dt: number): void {
    if (this.state === 'yellow') {
      this.yellowSeconds += dt;
      this.totalYellowSeconds += dt;
      this.value -= this.tuning.drainPerSecond * dt;
      if (this.value <= 0) {
        this.value = 0;
        this.state = 'empty';
        this.drained();
      }
    } else if (this.state === 'green') {
      this.value -= this.tuning.greenDrainPerSecond * dt;
      if (this.value <= 0) {
        this.value = 0;
        this.state = 'empty';
      }
    }
  }

  private drained(): void {
    const s = this.yellowSeconds;
    this.yellowSeconds = 0;
    this.emit('meterDrained', { yellowSeconds: s });
  }

  reset(): void {
    const wasYellow = this.state === 'yellow';
    this.value = 0;
    this.state = 'empty';
    if (wasYellow) this.drained();
  }
}
