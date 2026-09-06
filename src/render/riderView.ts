import * as THREE from 'three';
import type { RiderPose, RiderState } from '@/rider/rider';

/** Placeholder rider: a board and a capsule body, posed from the sim's world pose. Replaced by a rigged model in M9. */
export class RiderView {
  readonly group = new THREE.Group();
  private board: THREE.Mesh;
  private body: THREE.Mesh;
  private basis = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private tumble = 0;

  constructor(boardLength = 1.9) {
    const boardGeo = new THREE.BoxGeometry(boardLength, 0.06, 0.5, 1, 1, 1);
    this.board = new THREE.Mesh(boardGeo, new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.4, metalness: 0.05 }));
    this.board.castShadow = true;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0xff7a3d, roughness: 0.5 }));
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = boardLength / 2 + 0.15;
    nose.scale.set(1, 1, 0.25);
    this.board.add(nose);
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 1.15, 4, 10), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.7 }));
    this.body.castShadow = true;
    this.body.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 }));
    head.position.y = 0.78;
    this.body.add(head);
    this.group.add(this.board, this.body);
  }

  update(pose: RiderPose, state: RiderState, dt: number, speed01: number): void {
    const p = pose.pos;
    this.group.position.set(p.x, p.y, p.z);
    const f = pose.fakie ? new THREE.Vector3(-pose.forward.x, -pose.forward.y, -pose.forward.z) : new THREE.Vector3(pose.forward.x, pose.forward.y, pose.forward.z);
    const u = new THREE.Vector3(pose.up.x, pose.up.y, pose.up.z);
    const r = new THREE.Vector3().crossVectors(u, f).normalize();
    // columns: x = forward (board length), y = up, z = right
    this.basis.makeBasis(f, u, r);
    this.q.setFromRotationMatrix(this.basis);
    this.group.quaternion.copy(this.q);
    switch (state) {
      case 'prone':
        this.body.rotation.set(0, 0, Math.PI / 2 - 0.1);
        this.body.position.set(-0.1, 0.25, 0);
        this.board.visible = true;
        break;
      case 'wipeout':
        this.tumble += dt * 9;
        this.body.rotation.set(this.tumble, this.tumble * 0.7, 0);
        this.body.position.set(0, 0.4, 0);
        this.board.visible = false;
        break;
      case 'air':
        this.body.rotation.set(0, 0, 0.25);
        this.body.position.set(0, 0.7, 0);
        this.board.visible = true;
        break;
      default: {
        // crouch a little at speed
        this.body.rotation.set(0, Math.PI / 2 - 0.5, 0.12);
        this.body.position.set(0, 0.85 - speed01 * 0.18, 0);
        this.board.visible = true;
      }
    }
  }
}
