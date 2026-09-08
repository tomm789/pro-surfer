import * as THREE from 'three';
import type { Tuning } from '@/core/tuning';
import type { RiderPose, RiderState } from '@/rider/rider';

export type CameraMode = 'chase' | 'wide' | 'tube' | 'object' | 'close' | 'shore' | 'beach' | 'first' | 'portrait';

/** Stance readout the camera reacts to (docs/MECHANICS.md §8). */
export interface CameraStance {
  rail: number;
  compression: number;
}

/**
 * Third-person camera that lives shoreward of the rider, looks down the line, and frames the curl.
 * Design doc §11.2: pulled back and up compared with the original; look-ahead scales with speed.
 */
export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'chase';
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private desiredPos = new THREE.Vector3();
  private desiredLook = new THREE.Vector3();
  private initialised = false;
  private tmp = new THREE.Vector3();
  /** When set, the camera keeps its position but looks at this point (object cam). */
  objectTarget: THREE.Vector3 | null = null;
  /** Fixed tripod position for the beach camera; set on the first update after a cut. */
  private anchor: THREE.Vector3 | null = null;
  /** Stance the camera leans with; the scene refreshes it each frame. */
  stance: CameraStance = { rail: 0, compression: 0 };
  private fov = 0;

  /** True while the rider's own head and torso should be hidden (they would fill the lens). */
  get firstPerson(): boolean {
    return this.mode === 'first';
  }

  /** Hard cut to a camera mode (replays): no glide from the previous shot. */
  cut(mode: CameraMode): void {
    this.mode = mode;
    this.anchor = null;
    this.initialised = false;
  }

  constructor(
    private tuning: Tuning,
    aspect = 16 / 9,
  ) {
    this.camera = new THREE.PerspectiveCamera(tuning.camera.fov, aspect, 0.2, 1500);
  }

  snapTo(pose: RiderPose, dir: 1 | -1): void {
    this.computeDesired(pose, dir, 'face', 0, 0);
    this.pos.copy(this.desiredPos);
    this.look.copy(this.desiredLook);
    this.initialised = true;
    this.apply();
  }

  private computeDesired(pose: RiderPose, dir: 1 | -1, state: RiderState, speed01: number, curlAheadBias: number): void {
    const C = this.tuning.camera;
    // default is the skate camera: low, close and just off the tail, so speed and rail angle read
    let dist = C.skateDistance;
    let height = C.skateHeight;
    if (this.mode === 'wide') {
      dist = C.wideDistance;
      height = C.wideHeight;
    } else if (this.mode === 'close') {
      // a character-inspection lens: close enough to read the face and the stance
      dist = 2.6;
      height = 1.0;
    } else if (this.mode === 'tube') {
      dist = C.tubeDistance;
      height = C.tubeHeight;
    }
    if (state === 'air') {
      dist *= 1.25;
      height *= 1.15;
    }
    const p = pose.pos;
    if (this.mode === 'first') {
      // Eye just behind and above the front foot, tilted down far enough that the front foot and the
      // nose of the board sit in the bottom of the frame — without that anchor the rail angle is unreadable.
      const f = pose.forward;
      const up = pose.up;
      this.desiredPos.set(p.x - f.x * C.fpBack + up.x * C.fpEyeHeight, p.y - f.y * C.fpBack + up.y * C.fpEyeHeight, p.z - f.z * C.fpBack + up.z * C.fpEyeHeight);
      const down = Math.tan((C.fpLookDownDeg * Math.PI) / 180);
      const reach = 8;
      this.desiredLook.set(
        this.desiredPos.x + f.x * reach - up.x * reach * down,
        this.desiredPos.y + f.y * reach - up.y * reach * down,
        this.desiredPos.z + f.z * reach - up.z * reach * down,
      );
      return;
    }
    if (this.mode === 'beach') {
      // a photographer standing shoreward and down the line; the rider surfs toward and past the lens
      if (!this.anchor) this.anchor = new THREE.Vector3(p.x + dir * 26, Math.max(p.y, 0) + 5.5, p.z - 34);
      this.desiredPos.copy(this.anchor);
      this.desiredLook.set(p.x, p.y + 0.8, p.z);
      return;
    }
    if (this.mode === 'shore') {
      // debug: look from the rider toward the beach
      this.desiredPos.set(p.x, p.y + 6, p.z + 14);
      this.desiredLook.set(p.x + dir * 40, 4, p.z - 160);
      return;
    }
    if (this.mode === 'portrait') {
      // on the wall side just ahead of the rider, looking back at the face: the scrapbook's close-up
      const up = pose.up;
      this.desiredPos.set(p.x + dir * 1.6 + up.x * 1.1, p.y + up.y * 1.1, p.z + 2.3 + up.z * 1.1);
      this.desiredLook.set(p.x + up.x * 1.15, p.y + up.y * 1.15, p.z + up.z * 1.15);
      return;
    }
    if (state === 'tube' || (this.mode === 'tube' && state !== 'air')) {
      // inside the barrel: low and just behind the rider, looking out toward the exit
      this.desiredPos.set(p.x - dir * C.tubeDistance, p.y + C.tubeHeight, p.z - 0.4);
      this.desiredLook.set(p.x + dir * 14, p.y + 0.9, p.z - 1.0);
      return;
    }
    // sit behind (−dir·x) and shoreward (−z) of the rider, above the water
    const skate = this.mode === 'chase';
    const back = skate ? C.skateBack : 0.72;
    const side = skate ? C.skateSide : 0.62;
    // §8: the camera reads the stance — it swings wider on a committed rail and drops on compression
    const swing = skate ? this.stance.rail * C.railSwing : 0;
    const drop = skate ? Math.max(0, this.stance.compression) * C.compressionDrop : 0;
    const dolly = skate ? 1 + C.speedDolly * 0.1 * speed01 : 1;
    this.desiredPos.set(
      p.x - dir * dist * back * dolly,
      Math.max(p.y + height - drop, skate ? 0.9 : 1.4),
      p.z - dist * side * dolly - swing,
    );
    const lookAhead = C.lookAheadU * (0.55 + C.lookAheadSpeedScale * speed01 * 2);
    this.desiredLook.set(p.x + dir * lookAhead + dir * curlAheadBias, p.y + (skate ? 0.9 : 1.1), p.z + (skate ? 2.2 : 1.5));
  }

  /** Field of view for the current mode; first person opens up to sell the speed. */
  private modeFov(): number {
    const C = this.tuning.camera;
    if (this.mode === 'first') return C.fpFov;
    if (this.mode === 'chase') return C.skateFov;
    return C.fov;
  }

  update(pose: RiderPose, dir: 1 | -1, state: RiderState, speed01: number, dt: number, curlAheadBias = 0): void {
    this.computeDesired(pose, dir, state, speed01, curlAheadBias);
    // first person is rigidly attached: any smoothing at all shows up as the camera trailing metres
    // behind a rider doing 11 m/s, which would put the lens outside the head
    if (this.mode === 'first') {
      this.pos.copy(this.desiredPos);
      this.look.copy(this.desiredLook);
      this.initialised = true;
      this.apply();
      return;
    }
    if (!this.initialised) {
      this.pos.copy(this.desiredPos);
      this.look.copy(this.desiredLook);
      this.initialised = true;
    } else {
      const k = 1 - Math.exp(-this.tuning.camera.smoothing * dt);
      this.pos.lerp(this.desiredPos, k);
      this.look.lerp(this.desiredLook, k * 1.4);
    }
    this.apply();
  }

  private apply(): void {
    const want = this.modeFov();
    if (want !== this.fov) {
      this.fov = want;
      this.camera.fov = want;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.pos);
    this.tmp.copy(this.objectTarget ?? this.look);
    this.camera.lookAt(this.tmp);
  }
}
