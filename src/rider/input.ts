/** Abstract per-step input for the rider. Screen-space: stickX right = +1, stickY up = +1. */
export interface RiderInput {
  stickX: number;
  stickY: number;
  /** Back foot (left stick). Down presses the foot: see docs/MECHANICS.md §1. */
  backX: number;
  backY: number;
  /** Front foot (right stick). */
  frontX: number;
  frontY: number;
  jump: boolean;
  carve: boolean;
  grab: boolean;
  slide: boolean;
  spinLeft: boolean;
  spinRight: boolean;
  cashIn: boolean;
  stand: boolean;
  duckDive: boolean;
  cameraToggle: boolean;
  objectCam: boolean;
  pause: boolean;
}

export const NEUTRAL_INPUT: Readonly<RiderInput> = Object.freeze({
  stickX: 0,
  stickY: 0,
  backX: 0,
  backY: 0,
  frontX: 0,
  frontY: 0,
  jump: false,
  carve: false,
  grab: false,
  slide: false,
  spinLeft: false,
  spinRight: false,
  cashIn: false,
  stand: false,
  duckDive: false,
  cameraToggle: false,
  objectCam: false,
  pause: false,
});

export type ButtonKey = {
  [K in keyof RiderInput]: RiderInput[K] extends boolean ? K : never;
}[keyof RiderInput];

export function cloneInput(i: Readonly<RiderInput>): RiderInput {
  return { ...i };
}

/** Tracks press/release edges between sim steps. */
export class InputEdges {
  private prev: RiderInput = cloneInput(NEUTRAL_INPUT);
  private cur: RiderInput = cloneInput(NEUTRAL_INPUT);

  update(next: Readonly<RiderInput>): void {
    this.prev = this.cur;
    this.cur = cloneInput(next);
  }

  get current(): Readonly<RiderInput> {
    return this.cur;
  }

  pressed(key: ButtonKey): boolean {
    return this.cur[key] && !this.prev[key];
  }

  released(key: ButtonKey): boolean {
    return !this.cur[key] && this.prev[key];
  }

  held(key: ButtonKey): boolean {
    return this.cur[key];
  }
}
