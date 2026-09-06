/**
 * Input sequencer: turns the raw per-step RiderInput into direction presses, button presses,
 * double taps and button combos, and matches them against the trick catalogue.
 * Design doc §12.2: 600 ms ring buffer of direction presses; diagonals get a generous cone (§4.2).
 */
import type { RiderInput } from '@/rider/input';
import { DIRECTIONS, type Direction8, type Trick, type TrickButton, type TrickCatalogue, type TrickSection } from './catalogue';

export interface SequencerOptions {
  sequenceWindowMs: number;
  doubleTapWindowMs: number;
  diagonalConeDeg: number;
  deadzone: number;
}

interface Press {
  t: number;
}
interface DirPress extends Press {
  dir: Direction8;
}
interface ButtonPress extends Press {
  button: TrickButton;
}

export interface Match {
  trick: Trick;
  /** Higher wins when several tricks match one press. */
  priority: number;
}

const BUTTONS: TrickButton[] = ['carve', 'grab', 'slide'];

/** 8-way quantisation with a diagonal cone: diagonals accept ±cone, cardinals the remainder. */
export function quantiseDirection(x: number, y: number, deadzone: number, diagonalConeDeg: number): Direction8 | null {
  if (Math.hypot(x, y) < deadzone) return null;
  // screen angle: 0 = right, 90 = up
  let a = (Math.atan2(y, x) * 180) / Math.PI;
  if (a < 0) a += 360;
  const cone = diagonalConeDeg;
  // sectors centred on 45, 135, 225, 315 with width 2*cone
  const diagonals: [number, Direction8][] = [
    [45, 'upRight'],
    [135, 'upLeft'],
    [225, 'downLeft'],
    [315, 'downRight'],
  ];
  for (const [c, d] of diagonals) if (Math.abs(a - c) <= cone) return d;
  const cardinals: [number, Direction8][] = [
    [0, 'right'],
    [90, 'up'],
    [180, 'left'],
    [270, 'down'],
    [360, 'right'],
  ];
  let best: Direction8 = 'right';
  let bestD = 999;
  for (const [c, d] of cardinals) {
    const dd = Math.abs(a - c);
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return best;
}

export class InputSequencer {
  private dirs: DirPress[] = [];
  private buttons: ButtonPress[] = [];
  private lastDir: Direction8 | null = null;
  private held: Record<TrickButton, boolean> = { carve: false, grab: false, slide: false };
  private time = 0;
  /** Set when a button was pressed this step (edge). */
  pressedThisStep: TrickButton[] = [];
  currentDir: Direction8 | null = null;

  constructor(
    private catalogue: TrickCatalogue,
    private opts: SequencerOptions,
  ) {}

  reset(): void {
    this.dirs.length = 0;
    this.buttons.length = 0;
    this.lastDir = null;
    this.currentDir = null;
    this.held = { carve: false, grab: false, slide: false };
    this.pressedThisStep = [];
  }

  /** Feed one sim step. Returns the buttons that were pressed (edges) this step. */
  update(dt: number, input: Readonly<RiderInput>): TrickButton[] {
    this.time += dt;
    const dir = quantiseDirection(input.stickX, input.stickY, this.opts.deadzone, this.opts.diagonalConeDeg);
    this.currentDir = dir;
    if (dir && dir !== this.lastDir) this.dirs.push({ dir, t: this.time });
    this.lastDir = dir;
    this.pressedThisStep = [];
    for (const b of BUTTONS) {
      const down = input[b];
      if (down && !this.held[b]) {
        this.buttons.push({ button: b, t: this.time });
        this.pressedThisStep.push(b);
      }
      this.held[b] = down;
    }
    // trim history
    const keep = (this.opts.sequenceWindowMs / 1000) * 3;
    while (this.dirs.length && this.time - this.dirs[0]!.t > keep) this.dirs.shift();
    while (this.buttons.length && this.time - this.buttons[0]!.t > keep) this.buttons.shift();
    return this.pressedThisStep;
  }

  isHeld(b: TrickButton): boolean {
    return this.held[b];
  }

  /** Direction presses within the sequence window before `t` (oldest first). */
  private recentDirs(t: number): Direction8[] {
    const w = this.opts.sequenceWindowMs / 1000;
    return this.dirs.filter((d) => t - d.t <= w && d.t <= t).map((d) => d.dir);
  }

  /** Was `button` pressed twice within the double-tap window (this press being the second)? */
  private isDoubleTap(button: TrickButton, t: number): boolean {
    const w = this.opts.doubleTapWindowMs / 1000;
    const presses = this.buttons.filter((b) => b.button === button && t - b.t <= w && b.t <= t);
    return presses.length >= 2;
  }

  /** Previous different button pressed within the window (for combos like carve → slide). */
  private previousButton(button: TrickButton, t: number): TrickButton | null {
    const w = this.opts.sequenceWindowMs / 1000;
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i]!;
      if (b.t >= t) continue;
      if (t - b.t > w) break;
      if (b.button !== button) return b.button;
    }
    return null;
  }

  /**
   * All tricks that this button press could mean, ranked. `section` filters by rider context;
   * `atLip` resolves snap vs rebound. The executor applies special gating and picks the best allowed.
   */
  matches(button: TrickButton, section: TrickSection, atLip: boolean): Match[] {
    const t = this.time;
    const out: Match[] = [];
    const seqDirs = this.recentDirs(t);
    const dirNow = this.currentDir ?? (seqDirs.length && t - (this.dirs[this.dirs.length - 1]?.t ?? -9) < 0.15 ? seqDirs[seqDirs.length - 1]! : null);
    const dbl = this.isDoubleTap(button, t);
    const prev = this.previousButton(button, t);
    for (const trick of this.catalogue.bySection(section)) {
      const inp = trick.input;
      switch (inp.kind) {
        case 'seq': {
          if (inp.button !== button) break;
          const n = inp.sequence.length;
          if (seqDirs.length < n) break;
          const tail = seqDirs.slice(-n);
          // exact tail match; consecutive identical directions need two distinct presses (re-centre between)
          if (tail.every((d, i) => d === inp.sequence[i])) out.push({ trick, priority: 40 + n });
          break;
        }
        case 'double':
          if (inp.button !== button || !dbl) break;
          if (inp.context === 'lip' && !atLip) break;
          if (inp.context === 'face' && atLip) break;
          out.push({ trick, priority: 30 });
          break;
        case 'combo':
          if (inp.then === button && prev === inp.button) out.push({ trick, priority: 25 });
          break;
        case 'dir':
          if (inp.button === button && dirNow === inp.direction) out.push({ trick, priority: 20 });
          break;
        default:
          break;
      }
    }
    out.sort((a, b) => b.priority - a.priority);
    return out;
  }

  /** Exit moves: after two slide presses in the air, the next direction press(es) choose the move. */
  exitMatch(section: TrickSection): Trick | null {
    if (section !== 'air') return null;
    const w = this.opts.sequenceWindowMs / 1000;
    const slides = this.buttons.filter((b) => b.button === 'slide' && this.time - b.t <= w * 2);
    if (slides.length < 2) return null;
    const armed = slides[slides.length - 1]!.t;
    const after = this.dirs.filter((d) => d.t > armed).map((d) => d.dir);
    if (!after.length) return null;
    let best: Trick | null = null;
    for (const trick of this.catalogue.bySection('exit')) {
      const inp = trick.input;
      if (inp.kind !== 'exit') continue;
      const n = inp.sequence.length;
      const tail = after.slice(-n);
      if (tail.length === n && tail.every((d, i) => d === inp.sequence[i])) {
        if (!best || n > (best.input as { sequence: string[] }).sequence.length) best = trick;
      }
    }
    return best;
  }

  get now(): number {
    return this.time;
  }
}

export { DIRECTIONS };
