import type { Rng } from '@/core/rng';
import { clamp, lerp } from '@/core/math';

/** A part of the wave ahead of the curl that starts breaking on its own (a close-out section). */
export interface Section {
  id: number;
  /** Centre along the crest (u). */
  u: number;
  /** Current half-width of the broken region. */
  halfWidth: number;
  /** Growth rate of halfWidth, m/s. */
  spread: number;
  /** Time at which breaking starts (before that it's only a warning). */
  breakTime: number;
  /** Time the warning was issued. */
  warnTime: number;
  /** Extra height boost (the section "jacks up"). */
  jack: number;
}

export interface SectionProfile {
  rate: number;
  severity: number;
  doubleUp: boolean;
}

export interface SectionSchedulerOptions {
  warnSeconds: number;
  /** Minimum/maximum distance ahead of the curl a section spawns. */
  aheadMin: number;
  aheadMax: number;
}

/**
 * Spawns sections on a Poisson-ish schedule from the beach profile. Deterministic given the Rng.
 * The scheduler doesn't know about the rider; the WaveModel merges sections into the curl.
 */
export class SectionScheduler {
  private nextAt: number;
  private nextId = 1;

  constructor(
    private rng: Rng,
    private profile: SectionProfile,
    private opts: SectionSchedulerOptions,
  ) {
    this.nextAt = this.sampleInterval() * 0.6 + 6; // grace period at the start of a ride
  }

  private sampleInterval(): number {
    if (this.profile.rate <= 0) return Infinity;
    const mean = 60 / this.profile.rate;
    // clamp exponential samples so sections neither pile up nor vanish
    return clamp(-Math.log(1 - this.rng.next()) * mean, mean * 0.45, mean * 2.2);
  }

  /** Call once per sim step. Returns a new section (in warning state) or null. */
  update(time: number, curlU: number, riderU: number | null): Section | null {
    if (this.profile.rate <= 0 || time < this.nextAt) return null;
    this.nextAt = time + this.sampleInterval();
    const sev = this.profile.severity;
    // Spawn relative to the rider when we have one (so sections are a threat), else relative to the curl.
    const anchor = riderU ?? curlU;
    const ahead = lerp(this.opts.aheadMin, this.opts.aheadMax, this.rng.next());
    const u = anchor + ahead;
    const section: Section = {
      id: this.nextId++,
      u,
      halfWidth: 0,
      spread: lerp(2.0, 6.5, sev) * lerp(0.8, 1.2, this.rng.next()),
      breakTime: time + this.opts.warnSeconds,
      warnTime: time,
      jack: lerp(0.05, 0.22, sev),
    };
    return section;
  }
}
