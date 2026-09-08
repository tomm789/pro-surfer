/** Simple primitive models for wave objects (windsurfers, tubers, kayaks, jet-skis, spongers, turtles, pier pylons, ice). */
import * as THREE from 'three';
import type { WaveModel } from '@/wave/wave';
import type { ObjectField, WaveObject, ObjectKind } from '@/world/objects';

function mat(color: number, roughness = 0.7): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function build(kind: ObjectKind): THREE.Group {
  const g = new THREE.Group();
  const add = (m: THREE.Mesh) => {
    m.castShadow = true;
    g.add(m);
    return m;
  };
  switch (kind) {
    case 'windsurfer': {
      add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.7), mat(0xf2f2f2))).position.y = 0.06;
      const mast = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.2, 6), mat(0x333333)));
      mast.position.set(0.2, 2.1, 0);
      const sail = new THREE.Shape();
      sail.moveTo(0, 0);
      sail.lineTo(0, 4);
      sail.lineTo(2.2, 0.6);
      sail.lineTo(0, 0);
      const sailMesh = add(new THREE.Mesh(new THREE.ShapeGeometry(sail), new THREE.MeshStandardMaterial({ color: 0xff7a3d, roughness: 0.6, side: THREE.DoubleSide })));
      sailMesh.position.set(0.2, 0.15, 0);
      sailMesh.rotation.y = -0.4;
      const body = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 1.0, 4, 8), mat(0x1d2b3a)));
      body.position.set(-0.3, 0.8, 0.1);
      break;
    }
    case 'tuber': {
      add(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.22, 8, 16), mat(0x222222))).rotation.x = Math.PI / 2;
      const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(0xd9a066)));
      head.position.y = 0.35;
      const hat = add(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 8), mat(0xffe27a)));
      hat.position.y = 0.52;
      break;
    }
    case 'kayak': {
      add(new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 2.6, 4, 8), mat(0xffd23f))).rotation.z = Math.PI / 2;
      const body = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.6, 4, 8), mat(0x2a6f97)));
      body.position.y = 0.55;
      const paddle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6), mat(0x8a5a2a)));
      paddle.position.y = 0.8;
      paddle.rotation.x = Math.PI / 2;
      paddle.rotation.z = 0.3;
      break;
    }
    case 'jetski': {
      add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.0), mat(0xff5a5a))).position.y = 0.25;
      add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.5), mat(0x222222))).position.set(-0.2, 0.7, 0);
      const body = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.7, 4, 8), mat(0x1d2b3a)));
      body.position.set(-0.6, 1.15, 0);
      break;
    }
    case 'sponger': {
      add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.55), mat(0x3ec6c2))).position.y = 0.04;
      const body = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.7, 4, 8), mat(0x1d2b3a)));
      body.rotation.z = Math.PI / 2;
      body.position.y = 0.22;
      break;
    }
    case 'turtle': {
      const shell = add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mat(0x4a6b2a)));
      shell.scale.set(1, 0.4, 0.8);
      shell.position.y = 0.15;
      const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat(0x6b8f3a)));
      head.position.set(0.55, 0.2, 0);
      break;
    }
    case 'rafter': {
      add(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.3, 8, 16), mat(0xffd23f))).rotation.x = Math.PI / 2;
      const body = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 4, 8), mat(0x2a6f97)));
      body.position.y = 0.45;
      break;
    }
    case 'pier': {
      for (const z of [-2.5, 0, 2.5]) {
        const pylon = add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 7, 8), mat(0x5a4632)));
        pylon.position.set(0, 3.2, z);
      }
      const deck = add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 7), mat(0x8a6a4a)));
      deck.position.y = 6.7;
      break;
    }
    case 'ice': {
      const berg = add(new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), new THREE.MeshStandardMaterial({ color: 0xdff6ff, roughness: 0.3 })));
      berg.position.y = 0.6;
      berg.scale.set(1.3, 0.8, 1);
      break;
    }
  }
  return g;
}

export class ObjectViews {
  readonly group = new THREE.Group();
  private views = new Map<number, THREE.Group>();
  private tmp = { x: 0, y: 0, z: 0 };

  update(field: ObjectField, wave: WaveModel): void {
    const seen = new Set<number>();
    for (const o of field.objects) {
      seen.add(o.id);
      let v = this.views.get(o.id);
      if (!v) {
        v = build(o.kind);
        this.views.set(o.id, v);
        this.group.add(v);
      }
      this.place(v, o, wave);
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.group.remove(v);
        disposeTree(v);
        this.views.delete(id);
      }
    }
  }

  private place(v: THREE.Group, o: WaveObject, wave: WaveModel): void {
    wave.position(o.u, o.v, this.tmp);
    v.position.set(this.tmp.x, this.tmp.y, this.tmp.z);
    v.rotation.set(0, wave.params.direction > 0 ? 0 : Math.PI, 0);
    if (o.kind === 'pier') {
      v.position.y = 0;
      v.position.z = this.tmp.z - 1.5;
    }
    if (o.hit && o.kind !== 'pier') {
      const t = o.hitTime;
      if (o.hit === 'smash') {
        v.rotation.x = Math.min(Math.PI * 0.9, t * 4);
        v.rotation.z = t * 3;
        v.position.y -= Math.min(1.2, t * 0.8);
      } else if (o.hit === 'splash' || o.hit === 'spray') {
        v.rotation.z = Math.sin(t * 8) * 0.35 * Math.max(0, 1 - t * 0.6);
        v.position.y += Math.max(0, 0.4 - t * 0.5);
      }
    }
  }

  dispose(): void {
    for (const v of this.views.values()) {
      this.group.remove(v);
      disposeTree(v);
    }
    this.views.clear();
  }
}

/** Free the GL buffers of everything under an object; every view builds its own geometries and materials. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) for (const x of mat) x.dispose();
    else if (mat) mat.dispose();
  });
}
