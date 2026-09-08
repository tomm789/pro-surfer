/**
 * The character: a stylised, chunky little surfer built from rounded primitives — big head, short
 * body, oversized hands and feet. Deliberately not human-proportioned.
 *
 * Two layers drive it (docs/MECHANICS.md §7):
 *   1. a discrete pose per rider state (prone, air, tube, wipeout, grabs), blended between;
 *   2. a continuous layer that reads the stance — compression bends the knees, rail leans the whole
 *      body inside the arc, trim shifts the weight along the board, twist makes the shoulders lead.
 * On top of both, secondary motion with lag proportional to how heavy a part looks: the big head
 * settles slowly, the hair tuft trails, the arms swing. A cute character that snaps instantly to its
 * target reads as a puppet, so nothing is allowed to arrive without overshoot or delay.
 *
 * Original stylised character: no licensed model, brand or likeness.
 */
import * as THREE from 'three';
import type { RiderState } from '@/rider/rider';

type JointName =
  | 'pelvis'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'lThigh'
  | 'lShin'
  | 'lFoot'
  | 'rThigh'
  | 'rShin'
  | 'rFoot'
  | 'lUpper'
  | 'lFore'
  | 'lHand'
  | 'rUpper'
  | 'rFore'
  | 'rHand';

type Pose = Partial<Record<JointName, [number, number, number]>> & { pelvisY?: number; pelvisZ?: number; pelvisX?: number };

const D = Math.PI / 180;

/**
 * Joint rotations in degrees (x pitch, y twist, z roll). Board space: +x nose, +y up, +z right rail.
 * The chain is yawed 90° at the pelvis so the character stands across the board and faces the rail.
 */
export const POSES: Record<string, Pose> = {
  stand: {
    pelvisY: 0.52,
    pelvis: [0, 90, 0],
    spine: [10, -14, 0],
    chest: [6, -10, 0],
    head: [-6, 26, 0],
    lThigh: [-32, 0, -14],
    lShin: [52, 0, 0],
    lFoot: [-20, -30, 0],
    rThigh: [-28, 0, 16],
    rShin: [48, 0, 0],
    rFoot: [-20, 30, 0],
    lUpper: [-16, 0, -66],
    lFore: [-34, 0, -12],
    rUpper: [-8, 0, 66],
    rFore: [-38, 0, 12],
  },
  crouch: {
    pelvisY: 0.38,
    pelvis: [0, 90, 0],
    spine: [26, -20, 0],
    chest: [16, -12, 0],
    head: [-18, 30, 0],
    lThigh: [-68, 0, -16],
    lShin: [104, 0, 0],
    lFoot: [-34, -30, 0],
    rThigh: [-64, 0, 18],
    rShin: [100, 0, 0],
    rFoot: [-34, 30, 0],
    lUpper: [-26, 0, -58],
    lFore: [-46, 0, -12],
    rUpper: [-8, 0, 58],
    rFore: [-54, 0, 12],
  },
  air: {
    pelvisY: 0.42,
    pelvis: [0, 90, 0],
    spine: [22, -16, 0],
    chest: [12, -8, 0],
    head: [-8, 26, 0],
    lThigh: [-78, 0, -14],
    lShin: [112, 0, 0],
    lFoot: [-34, -30, 0],
    rThigh: [-72, 0, 16],
    rShin: [108, 0, 0],
    rFoot: [-34, 30, 0],
    lUpper: [-40, 0, -84],
    lFore: [-26, 0, -12],
    rUpper: [-30, 0, 84],
    rFore: [-26, 0, 12],
  },
  grabFront: {
    pelvisY: 0.34,
    pelvis: [0, 90, 0],
    spine: [40, -26, 10],
    chest: [24, -8, 0],
    head: [-24, 30, 0],
    lThigh: [-88, 0, -14],
    lShin: [122, 0, 0],
    lFoot: [-34, -30, 0],
    rThigh: [-82, 0, 16],
    rShin: [118, 0, 0],
    rFoot: [-34, 30, 0],
    lUpper: [-18, 0, -38],
    lFore: [-56, 0, -12],
    rUpper: [72, 0, 32],
    rFore: [-18, 0, 0],
  },
  grabBack: {
    pelvisY: 0.34,
    pelvis: [0, 90, 0],
    spine: [40, -26, -10],
    chest: [24, -8, 0],
    head: [-24, 30, 0],
    lThigh: [-88, 0, -14],
    lShin: [122, 0, 0],
    lFoot: [-34, -30, 0],
    rThigh: [-82, 0, 16],
    rShin: [118, 0, 0],
    rFoot: [-34, 30, 0],
    lUpper: [72, 0, -32],
    lFore: [-18, 0, 0],
    rUpper: [-18, 0, 38],
    rFore: [-56, 0, 12],
  },
  tube: {
    pelvisY: 0.34,
    pelvis: [0, 90, 8],
    spine: [28, -30, 5],
    chest: [14, -12, 0],
    head: [-18, 46, 0],
    lThigh: [-70, 0, -16],
    lShin: [106, 0, 0],
    lFoot: [-34, -30, 0],
    rThigh: [-70, 0, 18],
    rShin: [106, 0, 0],
    rFoot: [-34, 30, 0],
    lUpper: [-18, 0, -104],
    lFore: [-10, 0, -20],
    rUpper: [8, 0, 28],
    rFore: [-74, 0, 20],
  },
  prone: {
    pelvisY: 0.13,
    pelvisX: -0.08,
    pelvis: [-90, 0, 0],
    spine: [-10, 0, 0],
    chest: [-12, 0, 0],
    head: [-38, 0, 0],
    lThigh: [0, 0, -6],
    lShin: [12, 0, 0],
    lFoot: [10, 0, 0],
    rThigh: [0, 0, 6],
    rShin: [12, 0, 0],
    rFoot: [10, 0, 0],
    lUpper: [-155, 0, -28],
    lFore: [-28, 0, 0],
    rUpper: [-155, 0, 28],
    rFore: [-28, 0, 0],
  },
  wipeout: {
    pelvisY: 0.4,
    pelvis: [30, 40, 20],
    spine: [-18, 0, 14],
    chest: [-8, 0, 5],
    head: [-18, 0, 0],
    lThigh: [-40, 0, -36],
    lShin: [58, 0, 0],
    rThigh: [30, 0, 36],
    rShin: [20, 0, 0],
    lUpper: [-118, 0, -68],
    lFore: [-58, 0, 0],
    rUpper: [-88, 0, 78],
    rFore: [-38, 0, 0],
  },
  floater: {
    pelvisY: 0.5,
    pelvis: [0, 90, 0],
    spine: [8, -8, 0],
    chest: [6, -4, 0],
    head: [-8, 18, 0],
    lThigh: [-38, 0, -14],
    lShin: [58, 0, 0],
    rThigh: [-38, 0, 16],
    rShin: [58, 0, 0],
    lUpper: [-28, 0, -96],
    lFore: [-18, 0, 0],
    rUpper: [-28, 0, 96],
    rFore: [-18, 0, 0],
  },
  layback: {
    pelvisY: 0.32,
    pelvis: [0, 90, -35],
    spine: [-24, -16, -20],
    chest: [-14, 0, -10],
    head: [10, 22, 15],
    lThigh: [-58, 0, -16],
    lShin: [94, 0, 0],
    rThigh: [-58, 0, 18],
    rShin: [94, 0, 0],
    lUpper: [-38, 0, -28],
    lFore: [-28, 0, 0],
    rUpper: [-98, 0, 108],
    rFore: [-8, 0, 0],
  },
};

const TRICK_POSE: Record<string, string> = {
  noseGrab: 'grabFront',
  tailGrab: 'grabBack',
  indy: 'grabBack',
  roastBeef: 'grabBack',
  nuclear: 'grabFront',
  rocket: 'grabFront',
  melon: 'grabFront',
  mute: 'grabFront',
  lienAir: 'grabFront',
  stalefish: 'grabBack',
  judoAir: 'grabFront',
  method: 'grabBack',
  shoveThis: 'air',
  shoveIt: 'air',
  heelFlip: 'air',
  kickFlip: 'air',
  laybackSlide: 'layback',
  laybackDrag: 'layback',
  coffin: 'prone',
  superman: 'prone',
};

export interface SurferLook {
  suit: number;
  accent: number;
  skin: number;
  hair: number;
  board: number;
  boardAccent: number;
}

export const DEFAULT_LOOK: SurferLook = { suit: 0x1d2b3a, accent: 0x3ef0a0, skin: 0xd9a066, hair: 0x3a2a1a, board: 0xf4f0e6, boardAccent: 0xff7a3d };

/** What the body reacts to each frame. */
export interface SurferDrive {
  speed01: number;
  lean: number;
  carve: boolean;
  grab: boolean;
  slide: boolean;
  trickId: string | null;
  tubeDepth: number;
  airTime: number;
  fakie: boolean;
  /** Stance quantities, −1…1 (docs/MECHANICS.md §2). */
  compression: number;
  trim: number;
  rail: number;
  twist: number;
  pumpWork: number;
  /** Board yaw relative to travel, radians — the body counter-rotates against it. */
  boardYaw: number;
}

function capsule(r: number, len: number, mat: THREE.Material, y = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len), 3, 8), mat);
  m.position.y = y;
  m.castShadow = true;
  return m;
}

function ball(r: number, mat: THREE.Material, y = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
  m.position.y = y;
  m.castShadow = true;
  return m;
}

/** A critically damped spring for secondary motion: heavier parts get a lower rate. */
class Lag {
  value = 0;
  private vel = 0;
  constructor(
    private rate: number,
    private damping = 1,
  ) {}
  step(target: number, dt: number): number {
    const k = this.rate * this.rate;
    const c = 2 * this.damping * this.rate;
    this.vel += (k * (target - this.value) - c * this.vel) * dt;
    this.value += this.vel * dt;
    return this.value;
  }
}

export class SurferModel {
  readonly group = new THREE.Group();
  readonly board: THREE.Group;
  private joints = new Map<JointName, THREE.Object3D>();
  private pelvis: THREE.Group;
  private phase = 0;
  private curQ = new Map<JointName, THREE.Quaternion>();
  private tmpE = new THREE.Euler();
  private tmpQb = new THREE.Quaternion();
  private lastPoseName = 'stand';
  /** Parts hidden in first person, where the camera sits inside the head. */
  private upperBody: THREE.Object3D[] = [];
  private firstPerson = false;
  // secondary motion: the big head is heavy and slow, the hair is light and fast
  private headYaw = new Lag(9, 0.65);
  private headRoll = new Lag(8, 0.6);
  private hairLag = new Lag(16, 0.45);
  private armLag = new Lag(11, 0.7);
  private bodyLean = new Lag(12, 0.9);
  private hair: THREE.Object3D;
  private tuft: THREE.Object3D;
  private hips!: THREE.Mesh;
  /** Pose-blended pelvis position; the live position is this plus the stance offsets. */
  private pelvisBase = new THREE.Vector3(0, 0.52, 0);

  constructor(look: SurferLook = DEFAULT_LOOK, boardLength = 1.9) {
    const suit = new THREE.MeshStandardMaterial({ color: look.suit, roughness: 0.72 });
    const accent = new THREE.MeshStandardMaterial({ color: look.accent, roughness: 0.55 });
    const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.85 });
    const hair = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.9 });
    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.4 });
    const pupil = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.35 });

    this.board = this.makeBoard(boardLength, look);
    this.group.add(this.board);

    const mk = (name: JointName, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
      const j = new THREE.Group();
      j.position.set(x, y, z);
      parent.add(j);
      this.joints.set(name, j);
      return j;
    };

    // ── torso: short and round, so the head reads as the biggest thing on screen
    this.pelvis = mk('pelvis', this.group, 0, 0.52, 0);
    this.hips = capsule(0.115, 0.06, suit, 0.01);
    this.pelvis.add(this.hips);
    const spine = mk('spine', this.pelvis, 0, 0.07, 0);
    const chest = mk('chest', spine, 0, 0.1, 0);
    const torso = capsule(0.14, 0.1, suit, 0.07);
    chest.add(torso);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.138, 0.018, 6, 14), accent);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = 0.04;
    chest.add(stripe);
    const neck = mk('neck', chest, 0, 0.15, 0);
    neck.add(capsule(0.045, 0.03, skin, 0.02));

    // ── head: oversized. Everything about the character reads from this, so it gets the most detail.
    const head = mk('head', neck, 0, 0.05, 0);
    const skull = ball(0.19, skin, 0.16);
    skull.scale.set(1, 0.96, 1.02);
    head.add(skull);
    // the face looks along −x in head-local space (the chain is yawed 90° at the pelvis)
    const face = new THREE.Group();
    face.position.set(-0.13, 0.17, 0);
    head.add(face);
    for (const s of [-1, 1]) {
      const eye = ball(0.05, eyeWhite);
      eye.position.set(0.0, 0.0, s * 0.075);
      eye.scale.set(0.6, 1, 1);
      face.add(eye);
      const p = ball(0.026, pupil);
      p.position.set(-0.028, 0.0, s * 0.082);
      face.add(p);
    }
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.016, 0.075), hair);
    brow.position.set(-0.03, 0.062, 0.075);
    face.add(brow);
    const brow2 = brow.clone();
    brow2.position.z = -0.075;
    face.add(brow2);
    // hair: a cap plus a tuft that trails behind the head
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.196, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), hair);
    cap.position.y = 0.175;
    head.add(cap);
    this.hair = cap;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), hair);
    tuft.position.set(0.13, 0.3, 0);
    tuft.rotation.z = -0.9;
    head.add(tuft);
    this.tuft = tuft;

    // ── limbs: chunky, with oversized hands and feet
    // the pelvis is yawed 90°, so this offset separates the feet ALONG the board: a proper surf stance,
    // front foot near the wide point and back foot over the fins
    const stanceHalf = 0.28;
    const leg = (side: 'l' | 'r', sx: number) => {
      const thigh = mk(`${side}Thigh` as JointName, this.pelvis, 0, -0.01, sx * stanceHalf);
      thigh.add(capsule(0.062, 0.15, suit, -0.11));
      const shin = mk(`${side}Shin` as JointName, thigh, 0, -0.24, 0);
      shin.add(capsule(0.052, 0.14, suit, -0.1));
      const foot = mk(`${side}Foot` as JointName, shin, 0, -0.22, 0);
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.05, 0.2), skin);
      f.position.set(0, -0.025, 0.02);
      f.castShadow = true;
      foot.add(f);
    };
    leg('l', -1);
    leg('r', 1);
    const arm = (side: 'l' | 'r', sx: number) => {
      const upper = mk(`${side}Upper` as JointName, chest, 0, 0.11, sx * 0.135);
      upper.add(capsule(0.048, 0.12, suit, -0.09));
      const fore = mk(`${side}Fore` as JointName, upper, 0, -0.19, 0);
      fore.add(capsule(0.042, 0.11, skin, -0.085));
      const hand = mk(`${side}Hand` as JointName, fore, 0, -0.175, 0);
      hand.add(ball(0.055, skin, -0.04));
    };
    arm('l', -1);
    arm('r', 1);

    // hiding the spine takes the torso, arms and head with it; the hips mesh would fill the lens,
    // but the pelvis joint itself must stay so the legs and feet remain in shot
    this.upperBody = [spine, this.hips];
    for (const name of this.joints.keys()) this.curQ.set(name, new THREE.Quaternion());
    this.applyPose(POSES.stand!, 1);
  }

  /** In first person the camera is inside the head, so the head and torso are hidden but the legs stay. */
  setFirstPerson(on: boolean): void {
    if (on === this.firstPerson) return;
    this.firstPerson = on;
    for (const o of this.upperBody) o.visible = !on;
  }

  private makeBoard(len: number, look: SurferLook): THREE.Group {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    const half = len / 2;
    const w = 0.26;
    shape.moveTo(half, 0);
    shape.bezierCurveTo(half - 0.15, w * 0.9, half * 0.2, w, -half * 0.3, w);
    shape.bezierCurveTo(-half * 0.8, w * 0.95, -half + 0.05, w * 0.55, -half, w * 0.28);
    shape.lineTo(-half, -w * 0.28);
    shape.bezierCurveTo(-half + 0.05, -w * 0.55, -half * 0.8, -w * 0.95, -half * 0.3, -w);
    shape.bezierCurveTo(half * 0.2, -w, half - 0.15, -w * 0.9, half, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.055, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0.03, 0);
    const deck = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: look.board, roughness: 0.35, metalness: 0.05 }));
    deck.castShadow = true;
    g.add(deck);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.004, 0.03), new THREE.MeshStandardMaterial({ color: look.boardAccent, roughness: 0.5 }));
    stripe.position.y = 0.065;
    g.add(stripe);
    const flash = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.004, 0.22), new THREE.MeshStandardMaterial({ color: look.boardAccent, roughness: 0.5 }));
    flash.position.set(half - 0.35, 0.065, 0);
    g.add(flash);
    const finMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 });
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(-0.16, 0);
    finShape.quadraticCurveTo(-0.02, 0.02, 0.05, 0.14);
    finShape.lineTo(0, 0);
    const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.006, bevelEnabled: false });
    for (const [x, z] of [
      [-half + 0.12, 0],
      [-half + 0.32, 0.09],
      [-half + 0.32, -0.09],
    ] as [number, number][]) {
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.rotation.x = Math.PI;
      fin.position.set(x, 0.0, z);
      g.add(fin);
    }
    return g;
  }

  /**
   * Blend the skeleton toward a pose. The pelvis blends into `pelvisBase` and the live position is
   * copied from it, so the stance and secondary-motion offsets applied afterwards are absolute
   * offsets from the pose rather than something that accumulates frame over frame.
   */
  private applyPose(pose: Pose, alpha: number): void {
    for (const [name, j] of this.joints) {
      const r = pose[name];
      if (!r) continue;
      this.tmpE.set(r[0] * D, r[1] * D, r[2] * D, 'YXZ');
      this.tmpQb.setFromEuler(this.tmpE);
      const q = this.curQ.get(name)!;
      q.slerp(this.tmpQb, alpha);
      j.quaternion.copy(q);
    }
    const b = this.pelvisBase;
    b.x += ((pose.pelvisX ?? 0) - b.x) * alpha;
    b.y += ((pose.pelvisY ?? 0.52) - b.y) * alpha;
    b.z += ((pose.pelvisZ ?? 0) - b.z) * alpha;
    this.pelvis.position.copy(b);
  }

  private poseFor(state: RiderState, d: SurferDrive): string {
    switch (state) {
      case 'prone':
        return 'prone';
      case 'wipeout':
        return 'wipeout';
      case 'air':
        return d.trickId && TRICK_POSE[d.trickId] ? TRICK_POSE[d.trickId]! : 'air';
      case 'tube':
        return 'tube';
      case 'floater':
        return 'floater';
      default:
        if (d.trickId && TRICK_POSE[d.trickId]) return TRICK_POSE[d.trickId]!;
        // the continuous layer supplies the lean, so the base pose only picks the depth of the stance
        return d.compression > 0.15 || d.speed01 > 0.6 || d.grab ? 'crouch' : 'stand';
    }
  }

  /** Blend to the state pose, then lay the stance and the secondary motion over the top. */
  update(dt: number, state: RiderState, d: SurferDrive): void {
    this.phase += dt;
    const poseName = this.poseFor(state, d);
    const pose = POSES[poseName] ?? POSES.stand!;
    const rate = state === 'wipeout' ? 4 : state === 'air' ? 10 : 7;
    this.applyPose(pose, 1 - Math.exp(-rate * dt));
    this.lastPoseName = poseName;

    const grounded = state === 'face' || state === 'floater' || state === 'tube';
    const j = (n: JointName) => this.joints.get(n)!;

    if (grounded || state === 'air') {
      // ── compression: knees and hips carry it, and the whole body drops
      const c = d.compression;
      const knee = c * 26 * D;
      for (const side of ['l', 'r'] as const) {
        j(`${side}Thigh` as JointName).rotateX(-knee);
        j(`${side}Shin` as JointName).rotateX(knee * 1.7);
        j(`${side}Foot` as JointName).rotateX(-knee * 0.7);
      }
      this.pelvis.position.y -= c * 0.11;

      // ── rail: the body leans inside the arc, further than the board does, and the shoulders roll
      const lean = this.bodyLean.step(d.rail, dt);
      this.pelvis.rotateZ(lean * 0.3);
      j('spine').rotateZ(lean * 0.22);
      j('chest').rotateZ(lean * 0.16);
      // the inside arm reaches toward the face; on a committed rail the hand gets close to dragging
      const reach = Math.max(0, lean);
      const trail = Math.max(0, -lean);
      j('lUpper').rotateZ(-reach * 0.75 + trail * 0.25);
      j('lFore').rotateX(-reach * 0.5);
      j('rUpper').rotateZ(trail * 0.7 - reach * 0.2);
      j('rFore').rotateX(-trail * 0.45);

      // ── trim: weight visibly shifts along the board
      this.pelvis.position.x += d.trim * 0.1;
      j('spine').rotateX(-d.trim * 0.22);

      // ── twist: the shoulders lead, the board follows — this is what makes a snap read as a snap
      const counter = d.twist * 0.55 - d.boardYaw * 0.35;
      j('chest').rotateY(counter);
      const armSwing = this.armLag.step(counter, dt);
      j('lUpper').rotateX(-armSwing * 0.6);
      j('rUpper').rotateX(armSwing * 0.6);
    }

    // ── head: heavy, so it lags and settles. It also leads the turn — the character looks where it is going.
    const lookTarget = grounded ? d.rail * 0.5 + d.twist * 0.35 : 0;
    const headY = this.headYaw.step(lookTarget, dt);
    const headZ = this.headRoll.step(grounded ? -d.rail * 0.28 : 0, dt);
    j('head').rotateY(headY);
    j('head').rotateZ(headZ);
    // the hair trails whatever the head just did
    const hairT = this.hairLag.step(headY, dt);
    this.tuft.rotation.y = (headY - hairT) * 2.2;
    this.tuft.rotation.z = -0.9 + Math.min(0.5, d.speed01 * 0.5);
    this.hair.rotation.z = (headY - hairT) * 0.4;

    // ── per-state secondary motion
    if (state === 'prone') {
      const s = Math.sin(this.phase * 5);
      j('lUpper').rotateX(s * 0.5);
      j('rUpper').rotateX(-s * 0.5);
    } else if (state === 'wipeout') {
      this.pelvis.rotation.x += Math.sin(this.phase * 7) * 0.4;
      this.pelvis.rotation.z += Math.cos(this.phase * 5) * 0.3;
    } else if (grounded) {
      // a little bob at speed, and a visible shove on the frame a pump lands
      this.pelvis.position.y -= Math.abs(Math.sin(this.phase * 6)) * 0.015 * d.speed01;
      this.pelvis.position.y -= d.pumpWork * 0.03;
    }
    if (state === 'tube') this.pelvis.position.y -= d.tubeDepth * 0.08;
    this.pelvis.rotation.y += d.fakie ? Math.PI : 0;
    this.board.visible = state !== 'wipeout';
  }

  get poseName(): string {
    return this.lastPoseName;
  }
}
