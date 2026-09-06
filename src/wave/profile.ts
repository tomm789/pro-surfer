/**
 * 2D cross-section of the wave at one point along the crest.
 *
 * Local frame: `d` = horizontal distance toward the shore (metres) measured from the trough line,
 * `y` = height above still water. The FACE is an elliptical arc centred at (0, ry) with radii (rx, ry):
 *   θ = -π/2  → trough (d=0, y=0), horizontal tangent
 *   θ = -π    → mid-face, vertical
 *   θ = -3π/2 → roof (top of the barrel)
 *   θ = -2π   → lip tip thrown fully shoreward
 * The face runs from θ = -π/2 down to θ_lip = -π/2 - phi. `phi` is the curl angle:
 *   phi ≈ 0.55π → feathering, unbroken face;  phi ≈ π → lip horizontal (roof forming);
 *   phi ≈ 1.6π → full throwing barrel (a tube the rider fits inside).
 * The rider's face coordinate v∈[0,1] maps to θ ∈ [-π/2, -π/2 - phiFace] where phiFace = min(phi, PHI_FACE_MAX),
 * so v=1 is always "the lip" you launch from, never the underside of the roof.
 */
import { clamp, lerp } from '@/core/math';

export const PHI_FACE_MAX = Math.PI * 0.58; // ~104°: the rider's domain ends just past vertical

export interface ProfileParams {
  /** Lip height above still water, metres. */
  H: number;
  /** Curl angle, radians (see file comment). */
  phi: number;
  /** rx / ry. Mellow ≈ 1.6, hollow ≈ 1.05. */
  aspect: number;
  /** Lip (curtain) thickness, metres. */
  lipThickness: number;
  /** Horizontal length of the back slope, metres. */
  backLength: number;
  /** 0 = intact, 1 = collapsed whitewater mound. */
  broken: number;
}

export interface Profile extends ProfileParams {
  rx: number;
  ry: number;
  phiFace: number;
}

export interface Point2 {
  d: number;
  y: number;
}

/** Derive ellipse radii from height and curl angle. */
export function makeProfile(p: ProfileParams): Profile {
  const H = Math.max(0.05, p.H);
  const phi = clamp(p.phi, Math.PI * 0.5, Math.PI * 1.85);
  const ry = phi <= Math.PI ? H / (1 - Math.cos(phi)) : H / 2;
  const rx = ry * p.aspect;
  return { ...p, H, phi, rx, ry, phiFace: Math.min(phi, PHI_FACE_MAX) };
}

/** Apply the whitewater morph to raw params (broken → lower, wider, no overhang). */
export function morphBroken(p: ProfileParams): ProfileParams {
  const b = clamp(p.broken, 0, 1);
  if (b <= 0) return p;
  return {
    ...p,
    H: p.H * lerp(1, 0.55, b),
    phi: lerp(p.phi, Math.PI * 0.66, b),
    aspect: lerp(p.aspect, 2.0, b),
    lipThickness: lerp(p.lipThickness, 0.9, b),
  };
}

export function thetaOfV(prof: Profile, v: number): number {
  return -Math.PI / 2 - clamp(v, 0, 1) * prof.phiFace;
}

/** Point on the inner (water/air) surface for ellipse angle θ. */
export function innerPoint(prof: Profile, theta: number, out: Point2): Point2 {
  out.d = prof.rx * Math.cos(theta);
  out.y = prof.ry + prof.ry * Math.sin(theta);
  return out;
}

/** Point on the outer surface (offset by lip thickness, radially). */
export function outerPoint(prof: Profile, theta: number, out: Point2): Point2 {
  out.d = (prof.rx + prof.lipThickness) * Math.cos(theta);
  out.y = prof.ry + (prof.ry + prof.lipThickness) * Math.sin(theta);
  return out;
}

/** Rider-facing: position on the face for v∈[0,1]. */
export function facePoint(prof: Profile, v: number, out: Point2): Point2 {
  return innerPoint(prof, thetaOfV(prof, v), out);
}

/** d(face)/dv (unnormalised tangent pointing up the face). */
export function faceTangent(prof: Profile, v: number, out: Point2): Point2 {
  const th = thetaOfV(prof, v);
  const dth = -prof.phiFace; // dθ/dv
  out.d = -prof.rx * Math.sin(th) * dth;
  out.y = prof.ry * Math.cos(th) * dth;
  return out;
}

/** Slope of the face at v, radians above horizontal (0 = flat trough, π/2 = vertical, > π/2 = overhanging). */
export function faceSlope(prof: Profile, v: number): number {
  const t = faceTangent(prof, v, { d: 0, y: 0 });
  // tangent points up-and-back (−d, +y); slope measured from the −d axis
  return Math.atan2(t.y, -t.d);
}

/** Outward (water→air) normal on the face: toward the ellipse centre, i.e. shoreward and up. */
export function faceNormal(prof: Profile, v: number, out: Point2): Point2 {
  const t = faceTangent(prof, v, { d: 0, y: 0 });
  // rotate tangent (−d,+y direction) by −90° so the normal points toward +d for the lower face
  const nd = t.y;
  const ny = -t.d;
  const len = Math.hypot(nd, ny) || 1;
  out.d = nd / len;
  out.y = ny / len;
  return out;
}

/** Height of the lip crest (highest water point) above still water. */
export function crestHeight(prof: Profile): number {
  return prof.phi >= Math.PI ? 2 * prof.ry + prof.lipThickness : prof.H;
}

/** Row layout of the full cross-section polyline used by the mesh. Fixed counts keep the grid topology static. */
export const ROWS = {
  backOcean: 3,
  backSlope: 9,
  outerLip: 8,
  tip: 3,
  inner: 30,
  frontOcean: 3,
} as const;
export const ROW_COUNT = ROWS.backOcean + ROWS.backSlope + ROWS.outerLip + ROWS.tip + ROWS.inner + ROWS.frontOcean;

export interface ProfileRow {
  d: number;
  y: number;
  /** 0 on the trough/ocean, 1 at the lip crest (for colour ramps). */
  height01: number;
  /** foam weight 0..1 from geometry alone (lip tip, crest, broken). */
  foam: number;
  /** 1 where this row is on the water/air inner face (rideable side). */
  faceMask: number;
  /** rider v coordinate if on the face, else -1. */
  v: number;
  /** 1 on the underside of the roof / curtain interior. */
  tubeMask: number;
}

const tmpA: Point2 = { d: 0, y: 0 };
const tmpB: Point2 = { d: 0, y: 0 };

/**
 * Build the full polyline for one column. `rows` must have ROW_COUNT entries. Deterministic and allocation-free.
 * `skirt` = how far the flat ocean rows extend on each side.
 */
export function buildProfileRows(prof: Profile, rows: ProfileRow[], skirt = 30): void {
  let i = 0;
  const cH = crestHeight(prof);
  const hasRoof = prof.phi > Math.PI;
  const thetaLip = -Math.PI / 2 - prof.phi;
  const backStart = -(prof.rx + prof.backLength);

  // A. back ocean (flat), ending exactly where the back slope begins
  for (let k = 0; k < ROWS.backOcean; k++) {
    const t = k / (ROWS.backOcean - 1);
    const r = rows[i++]!;
    r.d = backStart - skirt * (1 - t);
    r.y = 0;
    r.height01 = 0;
    r.foam = 0;
    r.faceMask = 0;
    r.v = -1;
    r.tubeMask = 0;
  }

  // Crest top: where the back slope meets the outer lip surface.
  const crestTheta = hasRoof ? -1.5 * Math.PI : thetaLip;
  outerPoint(prof, crestTheta, tmpA);
  // B. back slope: smooth ease from (backStart, 0) to crest top with a horizontal start tangent
  for (let k = 0; k < ROWS.backSlope; k++) {
    const t = (k + 1) / ROWS.backSlope; // exclude t=0 (shared with back ocean)
    const s = t * t * (3 - 2 * t);
    const r = rows[i++]!;
    r.d = lerp(backStart, tmpA.d, t);
    r.y = lerp(0, tmpA.y, s);
    r.height01 = clamp(r.y / cH, 0, 1);
    r.foam = prof.broken * 0.9 * s;
    r.faceMask = 0;
    r.v = -1;
    r.tubeMask = 0;
  }

  // C. outer lip surface from crest top to lip tip (degenerate when no roof)
  for (let k = 0; k < ROWS.outerLip; k++) {
    const t = (k + 1) / ROWS.outerLip;
    const th = lerp(crestTheta, thetaLip, t);
    outerPoint(prof, th, tmpA);
    const r = rows[i++]!;
    r.d = tmpA.d;
    r.y = tmpA.y;
    r.height01 = clamp(r.y / cH, 0, 1);
    r.foam = clamp(0.35 * t + prof.broken, 0, 1);
    r.faceMask = 0;
    r.v = -1;
    r.tubeMask = 0;
  }

  // D. lip tip: half-circle from outer to inner around the tip point
  innerPoint(prof, thetaLip, tmpB);
  outerPoint(prof, thetaLip, tmpA);
  const cx = (tmpA.d + tmpB.d) / 2;
  const cy = (tmpA.y + tmpB.y) / 2;
  const radius = Math.hypot(tmpA.d - tmpB.d, tmpA.y - tmpB.y) / 2;
  const a0 = Math.atan2(tmpA.y - cy, tmpA.d - cx);
  for (let k = 0; k < ROWS.tip; k++) {
    const t = (k + 1) / (ROWS.tip + 1);
    // sweep 180° from outer to inner, going around the tip (direction chosen to bulge outward from the ellipse)
    const ang = a0 + Math.PI * t * (hasRoof ? -1 : -1);
    const r = rows[i++]!;
    r.d = cx + radius * Math.cos(ang);
    r.y = cy + radius * Math.sin(ang);
    r.height01 = clamp(r.y / cH, 0, 1);
    r.foam = clamp(0.8 + prof.broken, 0, 1);
    r.faceMask = 0;
    r.v = -1;
    r.tubeMask = hasRoof ? 1 : 0;
  }

  // E. inner surface from lip tip back to the trough (θ from thetaLip up to -π/2)
  const thetaFaceTop = -Math.PI / 2 - prof.phiFace;
  for (let k = 0; k < ROWS.inner; k++) {
    const t = k / (ROWS.inner - 1);
    const th = lerp(thetaLip, -Math.PI / 2, t);
    innerPoint(prof, th, tmpA);
    const r = rows[i++]!;
    r.d = tmpA.d;
    r.y = tmpA.y;
    r.height01 = clamp(r.y / cH, 0, 1);
    const onFace = th >= thetaFaceTop - 1e-6;
    r.faceMask = onFace ? 1 : 0;
    r.v = onFace ? clamp((-Math.PI / 2 - th) / prof.phiFace, 0, 1) : -1;
    r.tubeMask = onFace ? 0 : 1;
    // foam: near the lip on the face, plus broken
    const lipProximity = onFace ? clamp((r.v - 0.8) / 0.2, 0, 1) : 1;
    r.foam = clamp(lipProximity * 0.5 + prof.broken * (0.6 + 0.4 * (1 - t)), 0, 1);
  }

  // F. front ocean (flat) from the trough outward
  for (let k = 0; k < ROWS.frontOcean; k++) {
    const t = (k + 1) / ROWS.frontOcean;
    const r = rows[i++]!;
    r.d = skirt * t;
    r.y = 0;
    r.height01 = 0;
    r.foam = prof.broken * Math.max(0, 0.5 - t);
    r.faceMask = 0;
    r.v = -1;
    r.tubeMask = 0;
  }
}

export function allocRows(): ProfileRow[] {
  const rows: ProfileRow[] = [];
  for (let i = 0; i < ROW_COUNT; i++) rows.push({ d: 0, y: 0, height01: 0, foam: 0, faceMask: 0, v: -1, tubeMask: 0 });
  return rows;
}
