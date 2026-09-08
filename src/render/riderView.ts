import * as THREE from 'three';
import type { RiderPose, RiderState } from '@/rider/rider';
import { SurferModel, DEFAULT_LOOK, type SurferLook, type Reaction } from './surfer';

export interface RiderViewInput {
  speed01: number;
  /** Signed lean: + toward the wall (toe side for a right-hander), − away. */
  lean: number;
  carve: boolean;
  grab: boolean;
  slide: boolean;
  trickId: string | null;
  tubeDepth: number;
  airTime: number;
  /** Stance quantities the body reacts to (docs/MECHANICS.md §7). */
  compression: number;
  trim: number;
  rail: number;
  twist: number;
  pumpWork: number;
  /** Board yaw relative to travel, radians. */
  boardYaw: number;
}

/** Where a hand is and how far above the water it is, for spray where it drags. */
export interface HandReadout {
  world: THREE.Vector3;
  /** Height above the (unbanked) surface under the board, metres; negative = in the water. */
  height: number;
}

/** Places and poses the surfer model from the sim's world pose. */
export class RiderView {
  readonly group = new THREE.Group();
  readonly model: SurferModel;
  /** The inside hand this frame — the one reaching for the water on a hard rail. */
  readonly hand: HandReadout = { world: new THREE.Vector3(), height: 1 };
  /** How committed the reach is, 0…1 (from the model). */
  handReach = 0;
  private basis = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private tumble = 0;
  private f = new THREE.Vector3();
  private u = new THREE.Vector3();
  private r = new THREE.Vector3();
  private surfaceUp = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(boardLength = 1.9, look: SurferLook = DEFAULT_LOOK) {
    this.model = new SurferModel(look, boardLength);
    this.group.add(this.model.group);
  }

  /** Hide the head and torso when the camera sits inside them. */
  setFirstPerson(on: boolean): void {
    this.model.setFirstPerson(on);
  }

  /** Something happened: show it on the face. */
  react(kind: Reaction, seconds?: number): void {
    this.model.react(kind, seconds);
  }

  update(pose: RiderPose, state: RiderState, dt: number, input: RiderViewInput): void {
    const p = pose.pos;
    this.group.position.set(p.x, p.y, p.z);
    this.f.set(pose.forward.x, pose.forward.y, pose.forward.z);
    if (pose.fakie) this.f.negate();
    this.u.set(pose.up.x, pose.up.y, pose.up.z);
    this.surfaceUp.copy(this.u);
    // bank the board onto its rail; a committed rail buries it further than the steering alone
    if (state === 'face' || state === 'floater') {
      const rail = Math.abs(input.rail) > Math.abs(input.lean) ? input.rail : input.lean;
      const bank = new THREE.Quaternion().setFromAxisAngle(this.f, -rail * 0.7);
      this.u.applyQuaternion(bank);
    }
    this.r.crossVectors(this.u, this.f).normalize();
    this.u.crossVectors(this.f, this.r).normalize();
    this.basis.makeBasis(this.f, this.u, this.r);
    this.q.setFromRotationMatrix(this.basis);
    if (state === 'wipeout') {
      this.tumble += dt * 6;
      const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.tumble * 0.7, this.tumble, this.tumble * 0.4));
      this.q.multiply(spin);
    }
    this.group.quaternion.copy(this.q);
    this.model.update(dt, state, { ...input, fakie: pose.fakie });

    // the inside hand: its height above the surface plane through the board, ignoring the bank
    this.handReach = this.model.handReach;
    if (this.handReach > 0) {
      this.model.handWorld(this.model.handSide, this.hand.world);
      this.tmp.copy(this.hand.world).sub(this.group.position);
      this.hand.height = this.tmp.dot(this.surfaceUp);
    } else this.hand.height = 1;
  }
}
