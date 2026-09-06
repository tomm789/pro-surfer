import * as THREE from 'three';
import type { Tuning } from '@/core/tuning';
import type { RiderPose, RiderState } from '@/rider/rider';

export type CameraMode = 'chase' | 'wide' | 'tube' | 'object';

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
    let dist = C.chaseDistance;
    let height = C.chaseHeight;
    if (this.mode === 'wide') {
      dist = C.wideDistance;
      height = C.wideHeight;
    } else if (this.mode === 'tube') {
      dist = C.tubeDistance;
      height = C.tubeHeight;
    }
    if (state === 'air') {
      dist *= 1.25;
      height *= 1.15;
    }
    const p = pose.pos;
    // sit behind (−dir·x) and shoreward (−z) of the rider, above the water
    const back = 0.72;
    const side = 0.62;
    this.desiredPos.set(p.x - dir * dist * back, Math.max(p.y + height, 1.4), p.z - dist * side);
    const lookAhead = C.lookAheadU * (0.55 + C.lookAheadSpeedScale * speed01 * 2);
    this.desiredLook.set(p.x + dir * lookAhead + dir * curlAheadBias, p.y + 1.1, p.z + 1.5);
  }

  update(pose: RiderPose, dir: 1 | -1, state: RiderState, speed01: number, dt: number, curlAheadBias = 0): void {
    this.computeDesired(pose, dir, state, speed01, curlAheadBias);
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
    this.camera.position.copy(this.pos);
    this.tmp.copy(this.look);
    this.camera.lookAt(this.tmp);
  }
}
