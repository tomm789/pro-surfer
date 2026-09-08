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

const KEYS: (keyof RiderInput)[] = [
  'stickX',
  'stickY',
  'backX',
  'backY',
  'frontX',
  'frontY',
  'jump',
  'carve',
  'grab',
  'slide',
  'spinLeft',
  'spinRight',
  'cashIn',
  'stand',
  'duckDive',
  'cameraToggle',
  'objectCam',
  'pause',
];

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

/**
 * Storage form of a recording: each key is one row of numbers — the frame, the six axes as integers
 * in 1/64ths (the input manager quantises sticks to that grid, so this is exact), a bitmask of the
 * buttons and the cash-in flag. About a fifth the size of the JSON of the live form.
 */
export interface CompactRecording {
  v: 1;
  hz: number;
  seed: number;
  params: string;
  frames: number;
  highlight: Highlight | null;
  keys: number[][];
}

const AXES: (keyof RiderInput)[] = ['stickX', 'stickY', 'backX', 'backY', 'frontX', 'frontY'];
const BUTTONS: (keyof RiderInput)[] = ['jump', 'carve', 'grab', 'slide', 'spinLeft', 'spinRight', 'cashIn', 'stand', 'duckDive', 'cameraToggle', 'objectCam', 'pause'];
/** Sticks are stored on this grid; the input manager rounds to it so a replay is bit-exact. */
export const AXIS_STEPS = 64;

export function quantiseAxis(v: number): number {
  const q = Math.round(Math.max(-1, Math.min(1, v)) * AXIS_STEPS) / AXIS_STEPS;
  return q === 0 ? 0 : q; // never −0: it would survive the sim but not JSON
}

export function encodeRecording(rec: Recording): CompactRecording {
  const keys = rec.keys.map((k) => {
    let mask = 0;
    BUTTONS.forEach((b, i) => {
      if (k.i[b]) mask |= 1 << i;
    });
    return [k.f, ...AXES.map((a) => Math.round((k.i[a] as number) * AXIS_STEPS)), mask, k.c ? 1 : 0];
  });
  return { v: 1, hz: rec.hz, seed: rec.seed, params: rec.params, frames: rec.frames, highlight: rec.highlight, keys };
}

/** Back to the live form; throws on anything that is not a compact recording. */
export function decodeRecording(c: unknown): Recording {
  const r = c as Partial<CompactRecording>;
  if (!r || r.v !== 1 || typeof r.hz !== 'number' || typeof r.seed !== 'number' || typeof r.params !== 'string' || !Array.isArray(r.keys) || typeof r.frames !== 'number') {
    throw new Error('not a replay');
  }
  const keys: ReplayKey[] = r.keys.map((row) => {
    // frame, the six axes, the button mask, the cash-in flag
    if (!Array.isArray(row) || row.length !== 1 + AXES.length + 2 || row.some((x) => typeof x !== 'number')) throw new Error('bad replay key');
    const i = cloneInput(NEUTRAL_INPUT);
    AXES.forEach((a, j) => {
      (i as unknown as Record<string, number>)[a] = row[1 + j]! / AXIS_STEPS;
    });
    const mask = row[1 + AXES.length]!;
    BUTTONS.forEach((b, j) => {
      (i as unknown as Record<string, boolean>)[b] = (mask & (1 << j)) !== 0;
    });
    return { f: row[0]!, i, c: row[2 + AXES.length] === 1 };
  });
  // the highlight is optional but when present it must be a real frame window, or the replay would seek to NaN
  const h = r.highlight as Partial<Highlight> | null | undefined;
  const highlight: Highlight | null =
    h && typeof h === 'object' && Number.isInteger(h.startFrame) && Number.isInteger(h.endFrame) && typeof h.points === 'number' && Number.isFinite(h.points)
      ? { startFrame: h.startFrame!, endFrame: h.endFrame!, points: h.points! }
      : null;
  return { hz: r.hz, seed: r.seed, params: r.params, keys, frames: r.frames, highlight };
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
