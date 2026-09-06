/**
 * Three-heat contest (design doc §9.2). Each heat is a short timed run; a "wave" is one ride between
 * standing up and wiping out (or the heat ending); the heat score is the best two waves.
 * Opponents are seeded AI scores scaled by the level's difficulty. Place = rank of the total.
 */
import type { Rng } from '@/core/rng';

export interface ContestOptions {
  heats: number;
  heatSeconds: number;
  /** Opponent skill: roughly the heat score of the best opponent. */
  opponentTop: number;
  opponents: number;
  names: string[];
}

export interface HeatResult {
  waves: number[];
  score: number;
}

export class Contest {
  heat = 0;
  readonly results: HeatResult[] = [];
  private waves: number[] = [];
  private currentWave = 0;
  readonly opponentScores: number[][] = [];
  readonly names: string[];

  constructor(
    private opts: ContestOptions,
    rng: Rng,
  ) {
    this.names = opts.names.slice(0, opts.opponents);
    for (let o = 0; o < opts.opponents; o++) {
      const skill = opts.opponentTop * (1 - o * 0.22) * rng.range(0.85, 1.05);
      const heats: number[] = [];
      for (let h = 0; h < opts.heats; h++) heats.push(Math.round(skill * rng.range(0.7, 1.15)));
      this.opponentScores.push(heats);
    }
  }

  get heatSeconds(): number {
    return this.opts.heatSeconds;
  }

  get totalHeats(): number {
    return this.opts.heats;
  }

  /** Points banked during the current wave. */
  addToWave(points: number): void {
    this.currentWave += points;
  }

  /** The wave ended (wipeout or heat end). */
  endWave(): void {
    if (this.currentWave > 0) this.waves.push(this.currentWave);
    this.currentWave = 0;
  }

  endHeat(): HeatResult {
    this.endWave();
    const sorted = [...this.waves].sort((a, b) => b - a);
    const score = (sorted[0] ?? 0) + (sorted[1] ?? 0);
    const r = { waves: this.waves, score };
    this.results.push(r);
    this.waves = [];
    this.heat++;
    return r;
  }

  get finished(): boolean {
    return this.heat >= this.opts.heats;
  }

  playerTotal(): number {
    return this.results.reduce((s, r) => s + r.score, 0) + this.liveHeatScore();
  }

  liveHeatScore(): number {
    const all = [...this.waves, this.currentWave].sort((a, b) => b - a);
    return (all[0] ?? 0) + (all[1] ?? 0);
  }

  opponentTotal(o: number): number {
    const heatsPlayed = Math.min(this.opts.heats, this.heat + 1);
    let s = 0;
    for (let h = 0; h < heatsPlayed; h++) s += this.opponentScores[o]![h]!;
    return s;
  }

  /** 1-based place of the player among opponents right now. */
  place(): number {
    const mine = this.playerTotal();
    let place = 1;
    for (let o = 0; o < this.opponentScores.length; o++) if (this.opponentTotal(o) > mine) place++;
    return place;
  }

  standings(): { name: string; total: number; you: boolean }[] {
    const rows = this.opponentScores.map((_, o) => ({ name: this.names[o] ?? `Rider ${o + 1}`, total: this.opponentTotal(o), you: false }));
    rows.push({ name: 'YOU', total: this.playerTotal(), you: true });
    return rows.sort((a, b) => b.total - a.total);
  }
}
