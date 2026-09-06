/**
 * Procedural low-poly surfer: a small hierarchical skeleton of rounded boxes posed from the sim state.
 * Poses are joint rotations; the view blends between them so stance changes read as animation.
 * Original stylised character (no licensed model or likeness).
 */
import * as THREE from 'three';
import type { RiderState } from '@/rider/rider';

type JointName = 'pelvis' | 'spine' | 'chest' | 'head' | 'lThigh' | 'lShin' | 'lFoot' | 'rThigh' | 'rShin' | 'rFoot' | 'lUpper' | 'lFore' | 'lHand' | 'rUpper' | 'rFore' | 'rHand';

type Pose = Partial<Record<JointName, [number, number, number]>> & { pelvisY?: number; pelvisZ?: number; pelvisX?: number };

const D = Math.PI / 180;

/** Joint rotations in degrees (x = pitch forward/back, y = twist, z = roll sideways). Board +x = nose, +y = up, +z = right rail. */
export const POSES: Record<string, Pose> = {
  // regular stance: left foot forward toward the nose, body facing the right rail (+z), knees bent
  stand: {
    pelvisY: 0.74,
    pelvis: [0, 90, 0],
    spine: [12, -20, 0],
    chest: [10, -15, 0],
    head: [-8, 30, 0],
    lThigh: [-35, 0, -12],
    lShin: [55, 0, 0],
    lFoot: [-20, -30, 0],
    rThigh: [-30, 0, 14],
    rShin: [50, 0, 0],
    rFoot: [-20, 30, 0],
    lUpper: [-20, 0, -70],
    lFore: [-40, 0, -10],
    lHand: [0, 0, 0],
    rUpper: [-10, 0, 70],
    rFore: [-45, 0, 10],
    rHand: [0, 0, 0],
  },
  crouch: {
    pelvisY: 0.55,
    pelvis: [0, 90, 0],
    spine: [28, -25, 0],
    chest: [18, -15, 0],
    head: [-20, 35, 0],
    lThigh: [-70, 0, -14],
    lShin: [105, 0, 0],
    lFoot: [-35, -30, 0],
    rThigh: [-65, 0, 16],
    rShin: [100, 0, 0],
    rFoot: [-35, 30, 0],
    lUpper: [-30, 0, -60],
    lFore: [-50, 0, -10],
    rUpper: [-10, 0, 60],
    rFore: [-60, 0, 10],
  },
  carveToe: {
    pelvisY: 0.62,
    pelvis: [0, 90, 22],
    spine: [22, -30, 18],
    chest: [12, -10, 10],
    head: [-15, 40, -10],
    lThigh: [-55, 0, -10],
    lShin: [85, 0, 0],
    lFoot: [-30, -30, 0],
    rThigh: [-50, 0, 18],
    rShin: [80, 0, 0],
    rFoot: [-30, 30, 0],
    lUpper: [-30, 0, -95],
    lFore: [-20, 0, -10],
    rUpper: [20, 0, 45],
    rFore: [-70, 0, 20],
  },
  carveHeel: {
    pelvisY: 0.62,
    pelvis: [0, 90, -22],
    spine: [8, -20, -18],
    chest: [4, -10, -10],
    head: [-5, 30, 10],
    lThigh: [-50, 0, -18],
    lShin: [80, 0, 0],
    lFoot: [-30, -30, 0],
    rThigh: [-55, 0, 10],
    rShin: [85, 0, 0],
    rFoot: [-30, 30, 0],
    lUpper: [-10, 0, -40],
    lFore: [-60, 0, -20],
    rUpper: [-40, 0, 95],
    rFore: [-20, 0, 10],
  },
  air: {
    pelvisY: 0.6,
    pelvis: [0, 90, 0],
    spine: [25, -20, 0],
    chest: [15, -10, 0],
    head: [-10, 30, 0],
    lThigh: [-75, 0, -12],
    lShin: [110, 0, 0],
    lFoot: [-35, -30, 0],
    rThigh: [-70, 0, 14],
    rShin: [105, 0, 0],
    rFoot: [-35, 30, 0],
    lUpper: [-40, 0, -80],
    lFore: [-30, 0, -10],
    rUpper: [-30, 0, 80],
    rFore: [-30, 0, 10],
  },
  grabFront: {
    pelvisY: 0.5,
    pelvis: [0, 90, 0],
    spine: [40, -30, 10],
    chest: [25, -10, 0],
    head: [-25, 35, 0],
    lThigh: [-85, 0, -12],
    lShin: [120, 0, 0],
    lFoot: [-35, -30, 0],
    rThigh: [-80, 0, 14],
    rShin: [115, 0, 0],
    rFoot: [-35, 30, 0],
    lUpper: [-20, 0, -40],
    lFore: [-60, 0, -10],
    rUpper: [70, 0, 35],
    rFore: [-20, 0, 0],
  },
  grabBack: {
    pelvisY: 0.5,
    pelvis: [0, 90, 0],
    spine: [40, -30, -10],
    chest: [25, -10, 0],
    head: [-25, 35, 0],
    lThigh: [-85, 0, -12],
    lShin: [120, 0, 0],
    lFoot: [-35, -30, 0],
    rThigh: [-80, 0, 14],
    rShin: [115, 0, 0],
    rFoot: [-35, 30, 0],
    lUpper: [70, 0, -35],
    lFore: [-20, 0, 0],
    rUpper: [-20, 0, 40],
    rFore: [-60, 0, 10],
  },
  tube: {
    pelvisY: 0.52,
    pelvis: [0, 90, 8],
    spine: [30, -35, 5],
    chest: [15, -15, 0],
    head: [-20, 50, 0],
    lThigh: [-70, 0, -14],
    lShin: [105, 0, 0],
    lFoot: [-35, -30, 0],
    rThigh: [-70, 0, 16],
    rShin: [105, 0, 0],
    rFoot: [-35, 30, 0],
    lUpper: [-20, 0, -110],
    lFore: [-10, 0, -20],
    rUpper: [10, 0, 30],
    rFore: [-80, 0, 20],
  },
  prone: {
    pelvisY: 0.16,
    pelvisX: -0.1,
    pelvis: [-90, 0, 0],
    spine: [-10, 0, 0],
    chest: [-12, 0, 0],
    head: [-40, 0, 0],
    lThigh: [0, 0, -6],
    lShin: [15, 0, 0],
    lFoot: [10, 0, 0],
    rThigh: [0, 0, 6],
    rShin: [15, 0, 0],
    rFoot: [10, 0, 0],
    lUpper: [-160, 0, -30],
    lFore: [-30, 0, 0],
    rUpper: [-160, 0, 30],
    rFore: [-30, 0, 0],
  },
  wipeout: {
    pelvisY: 0.5,
    pelvis: [30, 40, 20],
    spine: [-20, 0, 15],
    chest: [-10, 0, 5],
    head: [-20, 0, 0],
    lThigh: [-40, 0, -35],
    lShin: [60, 0, 0],
    rThigh: [30, 0, 35],
    rShin: [20, 0, 0],
    lUpper: [-120, 0, -70],
    lFore: [-60, 0, 0],
    rUpper: [-90, 0, 80],
    rFore: [-40, 0, 0],
  },
  floater: {
    pelvisY: 0.7,
    pelvis: [0, 90, 0],
    spine: [10, -10, 0],
    chest: [8, -5, 0],
    head: [-10, 20, 0],
    lThigh: [-40, 0, -12],
    lShin: [60, 0, 0],
    rThigh: [-40, 0, 14],
    rShin: [60, 0, 0],
    lUpper: [-30, 0, -100],
    lFore: [-20, 0, 0],
    rUpper: [-30, 0, 100],
    rFore: [-20, 0, 0],
  },
  layback: {
    pelvisY: 0.45,
    pelvis: [0, 90, -35],
    spine: [-25, -20, -20],
    chest: [-15, 0, -10],
    head: [10, 25, 15],
    lThigh: [-60, 0, -14],
    lShin: [95, 0, 0],
    rThigh: [-60, 0, 16],
    rShin: [95, 0, 0],
    lUpper: [-40, 0, -30],
    lFore: [-30, 0, 0],
    rUpper: [-100, 0, 110],
    rFore: [-10, 0, 0],
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

function box(w: number, h: number, d: number, mat: THREE.Material, y = 0): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const m = new THREE.Mesh(g, mat);
  m.position.y = y;
  m.castShadow = true;
  return m;
}

export interface SurferLook {
  suit: number;
  accent: number;
  skin: number;
  hair: number;
  board: number;
  boardAccent: number;
}

export const DEFAULT_LOOK: SurferLook = { suit: 0x1d2b3a, accent: 0x3ef0a0, skin: 0xd9a066, hair: 0x3a2a1a, board: 0xf4f0e6, boardAccent: 0xff7a3d };

export class SurferModel {
  readonly group = new THREE.Group();
  readonly board: THREE.Group;
  private joints = new Map<JointName, THREE.Object3D>();
  private pelvis: THREE.Group;
  private current: Pose = {};
  private target: Pose = POSES.stand!;
  private blend = 1;
  private blendFrom: Pose = POSES.stand!;
  private blendRate = 8;
  private phase = 0;
  private curQ = new Map<JointName, THREE.Quaternion>();
  private tmpE = new THREE.Euler();
  private tmpQa = new THREE.Quaternion();
  private tmpQb = new THREE.Quaternion();
  private pelvisOffset = new THREE.Vector3();
  private pelvisFrom = new THREE.Vector3();
  private pelvisTo = new THREE.Vector3();
  private lastPoseName = 'stand';

  constructor(look: SurferLook = DEFAULT_LOOK, boardLength = 1.9) {
    const suit = new THREE.MeshStandardMaterial({ color: look.suit, roughness: 0.75 });
    const accent = new THREE.MeshStandardMaterial({ color: look.accent, roughness: 0.6 });
    const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.85 });
    const hair = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.9 });

    this.board = this.makeBoard(boardLength, look);
    this.group.add(this.board);

    // skeleton
    const mk = (name: JointName, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
      const j = new THREE.Group();
      j.position.set(x, y, z);
      parent.add(j);
      this.joints.set(name, j);
      return j;
    };
    this.pelvis = mk('pelvis', this.group, 0, 0.74, 0);
    this.pelvis.add(box(0.26, 0.16, 0.2, suit, 0.02));
    const spine = mk('spine', this.pelvis, 0, 0.1, 0);
    spine.add(box(0.24, 0.2, 0.18, suit, 0.1));
    const chest = mk('chest', spine, 0, 0.2, 0);
    const chestBox = box(0.34, 0.26, 0.2, suit, 0.13);
    chest.add(chestBox);
    const stripe = box(0.35, 0.05, 0.21, accent, 0.05);
    chest.add(stripe);
    const head = mk('head', chest, 0, 0.3, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), skin);
    skull.position.y = 0.1;
    skull.castShadow = true;
    head.add(skull);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    cap.position.y = 0.115;
    head.add(cap);

    const leg = (side: 'l' | 'r', sx: number) => {
      const thigh = mk(`${side}Thigh` as JointName, this.pelvis, 0, -0.02, sx * 0.1);
      thigh.add(box(0.13, 0.36, 0.13, suit, -0.18));
      const shin = mk(`${side}Shin` as JointName, thigh, 0, -0.36, 0);
      shin.add(box(0.11, 0.36, 0.11, suit, -0.18));
      const foot = mk(`${side}Foot` as JointName, shin, 0, -0.36, 0);
      foot.add(box(0.11, 0.06, 0.24, skin, -0.03));
    };
    leg('l', -1);
    leg('r', 1);
    const arm = (side: 'l' | 'r', sx: number) => {
      const upper = mk(`${side}Upper` as JointName, chest, 0, 0.22, sx * 0.2);
      upper.add(box(0.1, 0.3, 0.1, suit, -0.15));
      const fore = mk(`${side}Fore` as JointName, upper, 0, -0.3, 0);
      fore.add(box(0.09, 0.28, 0.09, suit, -0.14));
      const hand = mk(`${side}Hand` as JointName, fore, 0, -0.28, 0);
      hand.add(box(0.08, 0.1, 0.06, skin, -0.05));
    };
    arm('l', -1);
    arm('r', 1);

    for (const name of this.joints.keys()) this.curQ.set(name, new THREE.Quaternion());
    this.applyPose(POSES.stand!, 1);
  }

  private makeBoard(len: number, look: SurferLook): THREE.Group {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    const half = len / 2;
    const w = 0.26;
    // outline: pointed nose (+x), rounded tail (−x)
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
    // accent stripe along the stringer and a nose flash
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.004, 0.03), new THREE.MeshStandardMaterial({ color: look.boardAccent, roughness: 0.5 }));
    stripe.position.y = 0.065;
    g.add(stripe);
    const flash = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.004, 0.22), new THREE.MeshStandardMaterial({ color: look.boardAccent, roughness: 0.5 }));
    flash.position.set(half - 0.35, 0.065, 0);
    g.add(flash);
    // fins (thruster)
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
      fin.rotation.x = Math.PI; // hang below the board
      fin.rotation.z = 0;
      fin.position.set(x, 0.0, z);
      fin.scale.y = 1;
      g.add(fin);
    }
    return g;
  }

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
    const py = pose.pelvisY ?? 0.7;
    const px = pose.pelvisX ?? 0;
    const pz = pose.pelvisZ ?? 0;
    this.pelvis.position.x += (px - this.pelvis.position.x) * alpha;
    this.pelvis.position.y += (py - this.pelvis.position.y) * alpha;
    this.pelvis.position.z += (pz - this.pelvis.position.z) * alpha;
  }

  /** Pick a pose from the sim state and blend toward it. */
  update(dt: number, state: RiderState, opts: { speed01: number; lean: number; carve: boolean; grab: boolean; slide: boolean; trickId: string | null; tubeDepth: number; airTime: number; fakie: boolean }): void {
    this.phase += dt;
    let poseName = 'stand';
    switch (state) {
      case 'prone':
        poseName = 'prone';
        break;
      case 'wipeout':
        poseName = 'wipeout';
        break;
      case 'air':
        poseName = opts.trickId && TRICK_POSE[opts.trickId] ? TRICK_POSE[opts.trickId]! : 'air';
        break;
      case 'tube':
        poseName = 'tube';
        break;
      case 'floater':
        poseName = 'floater';
        break;
      default: {
        if (opts.trickId && TRICK_POSE[opts.trickId]) poseName = TRICK_POSE[opts.trickId]!;
        else if (opts.carve && Math.abs(opts.lean) > 0.2) poseName = opts.lean > 0 ? 'carveToe' : 'carveHeel';
        else if (Math.abs(opts.lean) > 0.45) poseName = opts.lean > 0 ? 'carveToe' : 'carveHeel';
        else poseName = opts.speed01 > 0.55 || opts.grab ? 'crouch' : 'stand';
      }
    }
    const pose = POSES[poseName] ?? POSES.stand!;
    const rate = state === 'wipeout' ? 4 : state === 'air' ? 10 : 7;
    this.applyPose(pose, 1 - Math.exp(-rate * dt));
    // secondary motion: paddling arms when prone, subtle bob at speed, flail in wipeout
    if (state === 'prone') {
      const l = this.joints.get('lUpper')!;
      const r = this.joints.get('rUpper')!;
      const s = Math.sin(this.phase * 5);
      l.rotateX(s * 0.5);
      r.rotateX(-s * 0.5);
    } else if (state === 'wipeout') {
      this.pelvis.rotation.x += Math.sin(this.phase * 7) * 0.4;
      this.pelvis.rotation.z += Math.cos(this.phase * 5) * 0.3;
    } else if (state === 'face' || state === 'tube') {
      this.pelvis.position.y -= Math.abs(Math.sin(this.phase * 6)) * 0.02 * opts.speed01;
    }
    // in the tube, crouch deeper with depth
    if (state === 'tube') this.pelvis.position.y -= opts.tubeDepth * 0.1;
    // fakie: turn the body to face the other rail
    this.pelvis.rotation.y += opts.fakie ? Math.PI : 0;
    this.board.visible = state !== 'wipeout';
    this.lastPoseName = poseName;
  }

  get poseName(): string {
    return this.lastPoseName;
  }
}
