/**
 * Trick chain / tracker (design doc §6.2).
 *   chain_total = round( Σ base_i × repeat_i × prox_i × rot_i × perfect_i ) × multiplier
 * Same-section linking always works; cross-section linking only while the meter is yellow.
 */
import { remap } from '@/core/math';
import type { Tuning } from '@/core/tuning';
import type { Trick, TrickSection } from '@/tricks/catalogue';

export interface ChainEntry {
  id: string;
  name: string;
  section: TrickSection;
  base: number;
  repeat: number;
  prox: number;
  rot: number;
  perfect: number;
  value: number;
  special: boolean;
  icon?: Trick['icon'];
}

export interface BankedChain {
  entries: ChainEntry[];
  multiplier: number;
  base: number;
  total: number;
  cashedIn: boolean;
  crossSection: boolean;
  bySection: Record<TrickSection, number>;
}

export class ChainTracker {
  entries: ChainEntry[] = [];
  private section: TrickSection | null = null;
  crossSection = false;
  /** Seconds since the last trick was added (for the idle bank rule). */
  idle = 0;
  /** Live, growing entries (tube time, floater time) keyed by kind. */
  private live = new Map<string, ChainEntry>();

  constructor(private tuning: Tuning['scoring']) {}

  get open(): boolean {
    return this.entries.length > 0;
  }

  get multiplier(): number {
    const distinct = new Set(this.entries.map((e) => e.id)).size;
    return Math.min(distinct, this.tuning.multiplierCap);
  }

  get base(): number {
    return this.entries.reduce((s, e) => s + e.value, 0);
  }

  get total(): number {
    return Math.round(this.base * this.multiplier);
  }

  proximity(aheadOfCurl: number): number {
    const T = this.tuning;
    return remap(aheadOfCurl, T.proximityFarMetres, T.proximityBoardLengths * 1.9, T.proximityMin, T.proximityMax);
  }

  /**
   * Try to add a landed trick. Returns 'linked' if it joined the open chain, 'new' if a new chain was
   * started (the previous one must have been banked by the caller: check `needsBankBefore` first).
   */
  needsBankBefore(section: TrickSection, meterYellow: boolean): boolean {
    return this.open && this.section !== null && this.section !== section && !meterYellow;
  }

  add(trick: Trick, section: TrickSection, opts: { aheadOfCurl: number; spins180?: number; landing?: 'perfect' | 'sloppy'; meterYellow: boolean; baseOverride?: number }): ChainEntry {
    const T = this.tuning;
    if (this.entries.length === 0) {
      this.section = section;
      this.crossSection = false;
    } else if (this.section !== section) {
      this.crossSection = true;
    }
    const prior = this.entries.filter((e) => e.id === trick.id).length;
    const repeat = T.repeatDecay[Math.min(prior, T.repeatDecay.length - 1)] ?? 0;
    const prox = this.proximity(opts.aheadOfCurl);
    const rot = section === 'air' ? 1 + T.rotationPer180 * (opts.spins180 ?? 0) : 1;
    const perfect = opts.landing === 'perfect' ? T.perfectBaseFactor : 1;
    const base = opts.baseOverride ?? trick.base;
    const entry: ChainEntry = {
      id: trick.id,
      name: trick.name,
      section,
      base,
      repeat,
      prox,
      rot,
      perfect,
      value: base * repeat * prox * rot * perfect,
      special: trick.special,
      icon: trick.icon,
    };
    this.entries.push(entry);
    this.idle = 0;
    return entry;
  }

  /** Start or update a live time-based entry (tube time, floater). */
  updateLive(key: string, name: string, section: TrickSection, value: number, aheadOfCurl: number): ChainEntry {
    let e = this.live.get(key);
    if (!e) {
      if (this.entries.length === 0) {
        this.section = section;
        this.crossSection = false;
      } else if (this.section !== section) this.crossSection = true;
      e = { id: key, name, section, base: 0, repeat: 1, prox: this.proximity(aheadOfCurl), rot: 1, perfect: 1, value: 0, special: false, icon: section === 'tube' ? 'tube' : 'face' };
      this.entries.push(e);
      this.live.set(key, e);
    }
    e.base = value;
    e.value = value * e.prox;
    this.idle = 0;
    return e;
  }

  endLive(key: string): void {
    this.live.delete(key);
  }

  step(dt: number): void {
    if (this.open) this.idle += dt;
  }

  bank(cashedIn: boolean): BankedChain | null {
    if (!this.open) return null;
    const bySection: Record<TrickSection, number> = { face: 0, air: 0, tube: 0, exit: 0 };
    const mult = this.multiplier;
    for (const e of this.entries) bySection[e.section] += Math.round(e.value * mult);
    const banked: BankedChain = {
      entries: this.entries,
      multiplier: mult,
      base: this.base,
      total: this.total,
      cashedIn,
      crossSection: this.crossSection,
      bySection,
    };
    this.clear();
    return banked;
  }

  lose(): BankedChain | null {
    if (!this.open) return null;
    const lost: BankedChain = {
      entries: this.entries,
      multiplier: this.multiplier,
      base: this.base,
      total: this.total,
      cashedIn: false,
      crossSection: this.crossSection,
      bySection: { face: 0, air: 0, tube: 0, exit: 0 },
    };
    this.clear();
    return lost;
  }

  private clear(): void {
    this.entries = [];
    this.section = null;
    this.crossSection = false;
    this.idle = 0;
    this.live.clear();
  }

  /** "Indy Grab + 360 + Snap" */
  label(): string {
    return this.entries.map((e) => e.name).join(' + ');
  }
}
