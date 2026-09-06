/**
 * Replays (design doc §11 / M9). The simulation is deterministic, so a replay is the same seed and
 * parameters re-simulated with the recorded per-frame inputs. Only input changes are stored.
 */
import { cloneInput, NEUTRAL_INPUT, type RiderInput } from '@/rider/input';

export interface ReplayKey {
  /** Sim frame index the input applies from. */
  f: number;
  i: RiderInput;
  /** Cash-in edge on exactly this frame. */
  c: boolean;
}

export interface Highlight {
  startFrame: number;
  endFrame: number;
  points: number;
}

export interface Recording {
  hz: number;
  seed: number;
  /** URLSearchParams string of the ride that was recorded. */
  params: string;
  keys: ReplayKey[];
  frames: number;
  highlight: Highlight | null;
}

const KEYS: (keyof RiderInput)[] = ['stickX', 'stickY', 'jump', 'carve', 'grab', 'slide', 'spinLeft', 'spinRight', 'cashIn', 'stand', 'duckDive', 'cameraToggle', 'objectCam', 'pause'];

function sameInput(a: Readonly<RiderInput>, b: Readonly<RiderInput>): boolean {
  for (const k of KEYS) if (a[k] !== b[k]) return false;
  return true;
}

export class InputRecorder {
  readonly keys: ReplayKey[] = [];
  frames = 0;
  private last: RiderInput | null = null;

  /** Call once per sim step with the input actually fed to the rider and whether a cash-in fired. */
  record(input: Readonly<RiderInput>, cashIn: boolean): void {
    const f = this.frames++;
    if (cashIn || !this.last || !sameInput(this.last, input)) {
      this.keys.push({ f, i: cloneInput(input), c: cashIn });
      this.last = cloneInput(input);
    }
  }
}

export class ReplayPlayer {
  private idx = -1;

  constructor(private rec: Recording) {}

  /** Input for sim frame `f`. Frames must be requested in non-decreasing order. */
  inputAt(f: number): { input: Readonly<RiderInput>; cashIn: boolean } {
    const keys = this.rec.keys;
    while (this.idx + 1 < keys.length && keys[this.idx + 1]!.f <= f) this.idx++;
    const k = this.idx >= 0 ? keys[this.idx]! : null;
    if (!k) return { input: NEUTRAL_INPUT, cashIn: false };
    return { input: k.i, cashIn: k.c && k.f === f };
  }
}

/** Tracks the highest-scoring chain's frame window so the replay can jump straight to it. */
export class HighlightTracker {
  best: Highlight | null = null;
  private openedAt: number | null = null;
  private lastClosedAt = 0;

  /** Call each step with the current frame and whether the chain is open. */
  step(frame: number, chainOpen: boolean): void {
    if (chainOpen && this.openedAt === null) this.openedAt = frame;
    if (!chainOpen && this.openedAt !== null) {
      this.openedAt = null;
      this.lastClosedAt = frame;
    }
  }

  /** A chain banked `points` at `frame`. */
  bank(frame: number, points: number, leadFrames: number, tailFrames: number): void {
    if (points <= 0 || (this.best && points <= this.best.points)) return;
    const start = Math.max(0, (this.openedAt ?? this.lastClosedAt) - leadFrames);
    this.best = { startFrame: start, endFrame: frame + tailFrames, points };
  }
}
