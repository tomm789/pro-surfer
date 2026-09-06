/**
 * Icon stack (design doc §7, §9.2): icons drop in on a schedule and pile up; landing a trick of the
 * bottom icon's type clears it. If the stack fills, the goal fails. Purely sim-side; the HUD renders it.
 */
import type { Rng } from '@/core/rng';
import type { Trick } from '@/tricks/catalogue';

export type IconType = 'air' | 'face' | 'tube' | 'special';

export interface IconStackOptions {
  stackSize: number;
  dropIntervalSeconds: number;
  /** Relative weights per type. */
  weights: Record<IconType, number>;
  /** Total icons to drop (goal count + a margin); 0 = endless. */
  total: number;
}

export class IconStack {
  readonly stack: IconType[] = [];
  cleared = 0;
  dropped = 0;
  failed = false;
  private timer: number;
  private chainWhileYellow = 0;

  constructor(
    private opts: IconStackOptions,
    private rng: Rng,
  ) {
    this.timer = opts.dropIntervalSeconds * 0.6;
  }

  step(dt: number, meterYellow: boolean): void {
    if (this.failed) return;
    if (this.opts.total > 0 && this.dropped >= this.opts.total) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer += this.opts.dropIntervalSeconds;
      this.drop();
    }
    if (!meterYellow) this.chainWhileYellow = 0;
  }

  private drop(): void {
    if (this.stack.length >= this.opts.stackSize) {
      this.failed = true;
      return;
    }
    const w = this.opts.weights;
    const total = w.air + w.face + w.tube + w.special;
    let r = this.rng.next() * total;
    let type: IconType = 'face';
    for (const t of ['air', 'face', 'tube', 'special'] as IconType[]) {
      r -= w[t];
      if (r <= 0) {
        type = t;
        break;
      }
    }
    this.stack.push(type);
    this.dropped++;
  }

  /** A trick landed: clears the bottom icon if the type matches. Returns true when cleared. */
  onTrick(trick: Trick, meterYellow: boolean): boolean {
    const type: IconType = trick.special ? 'special' : (trick.icon as IconType | undefined) ?? (trick.section === 'exit' ? 'face' : (trick.section as IconType));
    const bottom = this.stack[0];
    if (!bottom) return false;
    if (bottom !== type && !(bottom === 'special' && trick.special)) return false;
    this.stack.shift();
    this.cleared++;
    this.chainWhileYellow = meterYellow ? this.chainWhileYellow + 1 : 0;
    return true;
  }

  /** Five icon tricks chained while yellow = bonus (§6.2 rule 9). Resets after paying. */
  takeChainBonus(count: number): boolean {
    if (this.chainWhileYellow >= count) {
      this.chainWhileYellow = 0;
      return true;
    }
    return false;
  }
}
