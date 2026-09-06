/**
 * Push mode divider (design doc §10): the split-screen divider moves toward whoever is scoring less.
 * Pure function of banked points so it can be tested. share = player 1's fraction of the screen.
 */
export interface PushOptions {
  /** Points that move the divider across the full screen. */
  fullScreenPoints: number;
  /** Win when a player owns at least this share. */
  winShare: number;
  minShare: number;
}

export class PushDivider {
  share = 0.5;
  winner: 1 | 2 | null = null;
  private velocity = 0;

  constructor(private opts: PushOptions) {}

  /** Player `p` banked `points`: push the divider away from them. */
  onBank(p: 1 | 2, points: number): void {
    if (this.winner) return;
    const delta = points / this.opts.fullScreenPoints;
    this.velocity += p === 1 ? delta : -delta;
  }

  step(dt: number): void {
    if (this.winner) return;
    // the divider glides rather than snapping
    const move = this.velocity * Math.min(1, dt * 3);
    this.share += move;
    this.velocity -= move;
    this.share = Math.max(this.opts.minShare, Math.min(1 - this.opts.minShare, this.share));
    if (this.share >= this.opts.winShare) this.winner = 1;
    else if (this.share <= 1 - this.opts.winShare) this.winner = 2;
  }

  /** At time-out, whoever owns more of the screen wins (ties to nobody). */
  decide(): 1 | 2 | null {
    if (this.winner) return this.winner;
    if (Math.abs(this.share - 0.5) < 1e-6) return null;
    return this.share > 0.5 ? 1 : 2;
  }
}

/** Time attack (design doc §10): your score reduces the next player's run time. */
export function timeAttackSeconds(baseSeconds: number, opponentScore: number, secondsPerPoint: number, minSeconds: number): number {
  return Math.max(minSeconds, baseSeconds - opponentScore * secondsPerPoint);
}
