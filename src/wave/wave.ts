/**
 * WaveModel: one continuous peeling wave, simulated in wave space.
 *   u = metres along the crest (the curl advances toward +u; the rider surfs ahead of it)
 *   v = 0 at the trough … 1 at the lip, along the face arc
 * World mapping (Y up): x = dir·u, y = height, z = -d (shore is toward -Z).
 * The same functions feed the render mesh and the rider physics, so the board rides exactly what is drawn.
 */
import { clamp, lerp, smoothstep, type Vec3, v3Set } from '@/core/math';
import type { Rng } from '@/core/rng';
import {
  makeProfile,
  morphBroken,
  facePoint,
  faceTangent,
  faceSlope,
  crestHeight,
  type Profile,
  type ProfileParams,
  type Point2,
} from './profile';
import { SectionScheduler, type Section, type SectionProfile } from './sections';

export interface WaveParams {
  /** Face height at the peak, metres. */
  height: number;
  /** Beach hollowness 0..1. */
  hollowness: number;
  /** Curl speed along the crest, m/s. */
  breakSpeed: number;
  /** +1 right-hander (rider travels +X), -1 left. */
  direction: 1 | -1;
  faceAspect: number;
  /** Whether a rideable tube can form at all. */
  tube: boolean;
  sections: SectionProfile;
  /** Distance ahead of a breaking edge over which the lip is throwing. */
  throwLength: number;
  /** Distance behind a breaking edge over which the wave collapses to whitewater. */
  collapseLength: number;
  warnSeconds: number;
  sectionAheadMin: number;
  sectionAheadMax: number;
  /**
   * Fixed zones along the pool: hollowness and height vary with position so a lap has a barrel
   * section, a wall and a ramp instead of one uniform tube. Absent for ocean breaks, which get
   * their variety from scheduled sections instead.
   */
  zones?: { wavelength: number; hollowAmp: number; heightAmp: number };
  /**
   * Sets and lulls: the face pulses between `lull` × and `peak` × the nominal height on a cycle of
   * `period` seconds, the set taking `setSeconds` of it; each set's peak varies by ±`variance`.
   */
  swell?: { period: number; setSeconds: number; peak: number; lull: number; variance: number };
}

/** Where the swell is in its cycle. */
export interface SwellInfo {
  /** Multiplier on the nominal face height right now. */
  factor: number;
  inSet: boolean;
  /** Seconds until the next set starts (0 during a set). */
  nextSetIn: number;
  /** Which set is current or next, counting from the start of the ride. */
  setIndex: number;
}

/** Deterministic 0…1 noise from an integer and a seed; the sim never touches Math.random. */
function hash01(k: number, seed: number): number {
  const v = Math.sin(k * 12.9898 + seed * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** What the wave is doing at this point along a zoned venue. */
export type ZoneName = 'barrel' | 'wall' | 'ramp';

export interface WaveFields {
  H: number;
  /** 0..1 how much the lip is throwing here. */
  hollow: number;
  /** 0..1 how collapsed. */
  broken: number;
  /** 0..1 rideable-tube factor (roof present and not collapsed). */
  tube: number;
  /** Curl angle actually used for the profile. */
  phi: number;
}

export interface SurfaceSample {
  pos: Vec3;
  /** Unit tangent along +u (down the line). */
  tu: Vec3;
  /** Unit tangent up the face (+v). */
  tv: Vec3;
  /** Unit normal out of the water. */
  n: Vec3;
  /** Metres per unit v at this point (|dP/dv|). */
  vScale: number;
  /** Slope of the face above horizontal (radians). */
  slope: number;
  fields: WaveFields;
}

const PHI_FACE_MIN = Math.PI * 0.52; // unbroken, feathering face
const PHI_CRUMBLE = Math.PI * 1.02; // mellow beach: lip folds over without a roof
const PHI_BARREL = Math.PI * 1.62; // hollow beach: full throwing barrel
const LIP_THICKNESS_FRAC = 0.09;

export class WaveModel {
  time = 0;
  /** Position of the main curl (the front of the whitewater) along the crest. */
  curlU: number;
  readonly sections: Section[] = [];
  /** Sections that have been announced but not yet started breaking (HUD warnings). */
  private scheduler: SectionScheduler;
  private rowsScratch: ProfileParams = { H: 1, phi: 1, aspect: 1, lipThickness: 0.1, backLength: 1, broken: 0 };
  private p2: Point2 = { d: 0, y: 0 };
  private t2: Point2 = { d: 0, y: 0 };
  private mergedCount = 0;
  /** The swell cycle: a ride starts in a lull with the first set 15–30 s out, so the size arrives. */
  private swellOffset = 0;
  private swellSeed = 0;
  /** Multiplier on the nominal face height right now (1 for a steady wave). */
  swellFactor = 1;

  constructor(
    readonly params: WaveParams,
    rng: Rng,
    startCurlU = 0,
  ) {
    this.curlU = startCurlU;
    this.scheduler = new SectionScheduler(rng, params.sections, {
      warnSeconds: params.warnSeconds,
      aheadMin: params.sectionAheadMin,
      aheadMax: params.sectionAheadMax,
    });
    if (params.swell) {
      this.swellSeed = rng.next();
      this.swellOffset = params.swell.period - rng.range(15, 30);
      this.swellFactor = this.swellAt(0).factor;
    }
  }

  /** Where the swell is in its cycle at time t. */
  private swellAt(t: number): SwellInfo {
    const S = this.params.swell;
    if (!S) return { factor: 1, inSet: false, nextSetIn: Infinity, setIndex: 0 };
    const x = t + this.swellOffset;
    const k = Math.floor(x / S.period);
    const tau = x - k * S.period;
    // the variance is on the set's size above the lull, so a big beach does not double up on itself
    const peak = S.lull + (S.peak - S.lull) * (1 + S.variance * (hash01(k, this.swellSeed) * 2 - 1));
    const inSet = tau < S.setSeconds;
    // a sin² bump: the set builds from nothing, peaks in the middle and fades out
    const s = inSet ? Math.sin((Math.PI * tau) / S.setSeconds) ** 2 : 0;
    return { factor: S.lull + (peak - S.lull) * s, inSet, nextSetIn: inSet ? 0 : S.period - tau, setIndex: inSet ? k : k + 1 };
  }

  swellInfo(): SwellInfo {
    return this.swellAt(this.time);
  }

  /** Advance the wave. `riderU` lets the scheduler place sections as a threat; may be null. */
  step(dt: number, riderU: number | null = null): void {
    this.time += dt;
    this.swellFactor = this.swellAt(this.time).factor;
    this.curlU += this.params.breakSpeed * dt;
    const s = this.scheduler.update(this.time, this.curlU, riderU);
    if (s) this.sections.push(s);
    for (let i = this.sections.length - 1; i >= 0; i--) {
      const sec = this.sections[i]!;
      if (this.time >= sec.breakTime) sec.halfWidth += sec.spread * dt;
      // merge into the main curl once the whitewater regions touch → close-out jump
      if (sec.u - sec.halfWidth <= this.curlU) {
        this.curlU = Math.max(this.curlU, sec.u + sec.halfWidth);
        this.sections.splice(i, 1);
        this.mergedCount++;
      }
    }
  }

  get mergedSections(): number {
    return this.mergedCount;
  }

  /** Scalar fields along the crest. Pure function of (u, state). */
  fields(u: number, out?: WaveFields): WaveFields {
    const P = this.params;
    const o = out ?? { H: 0, hollow: 0, broken: 0, tube: 0, phi: 0 };
    // main curl: broken behind, throwing just ahead
    const du = u - this.curlU;
    let broken = du < 0 ? smoothstep(0, P.collapseLength, -du) : 0;
    let hollow = du >= 0 ? 1 - smoothstep(P.throwLength * 0.4, P.throwLength, du) : 1;
    let jack = 0;
    for (const sec of this.sections) {
      if (this.time < sec.breakTime) {
        // pre-break: the section stands up (visual warning) but is not yet throwing
        const w = 1 - smoothstep(0, P.throwLength * 1.5, Math.abs(u - sec.u));
        const pre = smoothstep(sec.warnTime, sec.breakTime, this.time);
        jack = Math.max(jack, sec.jack * w * pre);
        hollow = Math.max(hollow, 0.45 * w * pre);
        continue;
      }
      const dist = Math.abs(u - sec.u) - sec.halfWidth; // negative inside the broken region
      const b = dist < 0 ? smoothstep(0, P.collapseLength, -dist) : 0;
      const h = dist >= 0 ? 1 - smoothstep(P.throwLength * 0.4, P.throwLength, dist) : 1;
      broken = Math.max(broken, b);
      hollow = Math.max(hollow, h);
      jack = Math.max(jack, sec.jack * (1 - smoothstep(0, P.throwLength * 2, Math.max(0, dist))));
    }
    // gentle height variation along the line so the wall isn't a ruler
    const wobble = 1 + 0.05 * Math.sin(u * 0.11) + 0.03 * Math.sin(u * 0.37 + 1.3);
    const z = this.zoneShape(u);
    o.H = P.height * wobble * z.height * (1 + jack) * this.swellFactor;
    const hollowness = clamp(P.hollowness * z.hollow, 0, 1);
    o.hollow = clamp(hollow * hollowness, 0, 1) * (P.tube ? 1 : 0.55);
    o.broken = clamp(broken, 0, 1);
    const phiBreak = lerp(PHI_CRUMBLE, PHI_BARREL, hollowness);
    o.phi = lerp(PHI_FACE_MIN, phiBreak, hollow);
    const roof = o.phi > Math.PI * 1.25 ? clamp((o.phi - Math.PI * 1.25) / (PHI_BARREL - Math.PI * 1.25), 0, 1) : 0;
    o.tube = P.tube ? roof * (1 - o.broken) : 0;
    return o;
  }

  /** Zone modulation at u: 1,1 for a venue without zones. */
  private zoneShape(u: number): { hollow: number; height: number } {
    const z = this.params.zones;
    if (!z) return { hollow: 1, height: 1 };
    const t = (u / z.wavelength) * Math.PI * 2;
    return { hollow: 1 + z.hollowAmp * Math.sin(t), height: 1 + z.heightAmp * Math.sin(t * 0.5 + 0.7) };
  }

  /**
   * Runs of zones between u0 and u1, merged, for the wave meter. Empty where there are no zones.
   * Sampled rather than solved analytically so the thresholds stay in one place (`zoneAt`).
   */
  zoneBands(u0: number, u1: number, step = 2): { name: ZoneName; u0: number; u1: number }[] {
    if (!this.params.zones) return [];
    const out: { name: ZoneName; u0: number; u1: number }[] = [];
    let cur: { name: ZoneName; u0: number; u1: number } | null = null;
    for (let u = u0; u <= u1; u += step) {
      const name = this.zoneAt(u);
      if (cur && cur.name === name) cur.u1 = u;
      else {
        cur = { name, u0: u, u1: u };
        out.push(cur);
      }
    }
    return out;
  }

  /** Which part of a zoned venue u falls in; always 'wall' where there are no zones. */
  zoneAt(u: number): ZoneName {
    const z = this.params.zones;
    if (!z) return 'wall';
    const s = Math.sin((u / z.wavelength) * Math.PI * 2);
    if (s > 0.45) return 'barrel';
    if (s < -0.45) return 'ramp';
    return 'wall';
  }

  /** Full cross-section profile at u (after the whitewater morph). */
  profileAt(u: number, fieldsOut?: WaveFields): Profile {
    const f = this.fields(u, fieldsOut);
    const raw = this.rowsScratch;
    raw.H = f.H;
    raw.phi = f.phi;
    raw.aspect = lerp(this.params.faceAspect, this.params.faceAspect * 0.72, f.hollow);
    raw.lipThickness = Math.max(0.12, f.H * LIP_THICKNESS_FRAC * (0.6 + 0.8 * f.hollow));
    raw.backLength = f.H * 2.2;
    raw.broken = f.broken;
    return makeProfile(morphBroken(raw));
  }

  /** World position of wave-space (u, v). */
  position(u: number, v: number, out: Vec3): Vec3 {
    const prof = this.profileAt(u);
    facePoint(prof, v, this.p2);
    return v3Set(out, this.params.direction * u, this.p2.y, -this.p2.d);
  }

  /** Full local frame at (u, v). */
  sample(u: number, v: number, out: SurfaceSample): SurfaceSample {
    const prof = this.profileAt(u, out.fields);
    facePoint(prof, v, this.p2);
    const dir = this.params.direction;
    v3Set(out.pos, dir * u, this.p2.y, -this.p2.d);
    // ∂P/∂v from the analytic profile tangent
    faceTangent(prof, v, this.t2);
    const vScale = Math.hypot(this.t2.d, this.t2.y) || 1;
    v3Set(out.tv, 0, this.t2.y / vScale, -this.t2.d / vScale);
    out.vScale = vScale;
    // ∂P/∂u by finite difference (profile changes along the line)
    const eps = 0.5;
    const pA = this.profileAt(u + eps);
    facePoint(pA, v, this.p2);
    const ay = this.p2.y;
    const ad = this.p2.d;
    const pB = this.profileAt(u - eps);
    facePoint(pB, v, this.p2);
    const tx = dir * 2 * eps;
    const ty = ay - this.p2.y;
    const tz = -(ad - this.p2.d);
    const tl = Math.hypot(tx, ty, tz) || 1;
    v3Set(out.tu, tx / tl, ty / tl, tz / tl);
    // normal = tv × tu for a right-hander gives water→air (shoreward/up); flip for lefts via dir
    const nx = out.tv.y * out.tu.z - out.tv.z * out.tu.y;
    const ny = out.tv.z * out.tu.x - out.tv.x * out.tu.z;
    const nz = out.tv.x * out.tu.y - out.tv.y * out.tu.x;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const s = dir; // ensures n.y ≥ 0 on the lower face for both directions
    v3Set(out.n, (s * nx) / nl, (s * ny) / nl, (s * nz) / nl);
    if (out.n.y < 0 && v < 0.9) {
      out.n.x = -out.n.x;
      out.n.y = -out.n.y;
      out.n.z = -out.n.z;
    }
    out.slope = faceSlope(prof, v);
    return out;
  }

  /** Height of the lip crest at u. */
  lipHeight(u: number): number {
    return crestHeight(this.profileAt(u));
  }

  /** Sections currently in warning state (not yet breaking). */
  warnings(): Section[] {
    return this.sections.filter((s) => this.time < s.breakTime);
  }

  /**
   * Distance from u to whitewater: `behind` = metres ahead of the nearest breaking edge behind the rider
   * (negative once the rider is inside whitewater), `ahead` = metres to the next section's rear edge,
   * `inside` = u is inside a broken region.
   */
  distanceToBreak(u: number): { behind: number; ahead: number; inside: boolean } {
    let behind = u - this.curlU;
    let ahead = Infinity;
    let inside = behind < 0;
    for (const sec of this.sections) {
      if (this.time < sec.breakTime) continue;
      const rear = sec.u - sec.halfWidth;
      const front = sec.u + sec.halfWidth;
      if (rear > u) ahead = Math.min(ahead, rear - u);
      else if (front < u) behind = Math.min(behind, u - front);
      else {
        inside = true;
        behind = Math.min(behind, -(u - rear));
        ahead = 0;
      }
    }
    return { behind, ahead, inside };
  }

  /** Rideable tube window ahead of the main curl: [minOffset, length] in u relative to curlU. */
  tubeLength(lengthFactor: number): number {
    return this.params.throwLength * lengthFactor;
  }
}

export function makeSurfaceSample(): SurfaceSample {
  return {
    pos: { x: 0, y: 0, z: 0 },
    tu: { x: 1, y: 0, z: 0 },
    tv: { x: 0, y: 1, z: 0 },
    n: { x: 0, y: 0, z: 1 },
    vScale: 1,
    slope: 0,
    fields: { H: 0, hollow: 0, broken: 0, tube: 0, phi: 0 },
  };
}

export function waveParamsFromBeach(
  beach: {
    hollowness: number;
    breakSpeed: number;
    breakDirection: 'left' | 'right';
    faceAspect: number;
    tube: boolean;
    sections: SectionProfile;
    zones?: { wavelength: number; hollowAmp: number; heightAmp: number };
    swell?: { period: number; setSeconds: number; peak: number; lull: number; variance: number };
  },
  heightMetres: number,
  /** `swell: true` turns the beach's sets and lulls on; off by default so tests and lessons get a steady wave. */
  tuning: { throwLength?: number; collapseLength?: number; warnSeconds: number; swell?: boolean },
): WaveParams {
  return {
    height: heightMetres,
    hollowness: beach.hollowness,
    breakSpeed: beach.breakSpeed,
    direction: beach.breakDirection === 'right' ? 1 : -1,
    faceAspect: beach.faceAspect,
    tube: beach.tube,
    sections: { ...beach.sections },
    ...(beach.zones ? { zones: { ...beach.zones } } : {}),
    ...(tuning.swell && beach.swell ? { swell: { ...beach.swell } } : {}),
    throwLength: tuning.throwLength ?? Math.max(7, heightMetres * 3.6),
    collapseLength: tuning.collapseLength ?? Math.max(5, heightMetres * 2.5),
    warnSeconds: tuning.warnSeconds,
    sectionAheadMin: 28,
    sectionAheadMax: 55,
  };
}
