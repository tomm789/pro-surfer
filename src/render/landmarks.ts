/**
 * Beach identity (design doc §11.2): a shoreline and low-poly landmarks per beach, repeated along the
 * coast so they stay in view over a long ride. All procedural primitives.
 */
import * as THREE from 'three';
import type { Beach } from '@/world/beach';
import { SKY_PRESETS } from './waterUniforms';

const SHORE_Z = -150;
const REPEAT = 260;

function mat(color: number | string, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hills(rng: () => number, width: number, height: number, color: number | string, count = 7): THREE.Group {
  const g = new THREE.Group();
  const m = mat(color);
  for (let i = 0; i < count; i++) {
    const h = height * (0.5 + rng() * 0.8);
    const r = width * (0.12 + rng() * 0.2);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6 + Math.floor(rng() * 4)), m);
    cone.position.set((rng() - 0.5) * width, h / 2 - 2, (rng() - 0.3) * 60);
    cone.rotation.y = rng() * Math.PI;
    cone.castShadow = false;
    g.add(cone);
  }
  return g;
}

function palms(rng: () => number, count: number, spread: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = mat(0x6b4a2a);
  const leaf = mat(0x2f8f4a, 0.8);
  for (let i = 0; i < count; i++) {
    const h = 5 + rng() * 4;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, h, 6), trunk);
    const x = (rng() - 0.5) * spread;
    const z = (rng() - 0.5) * 18;
    t.position.set(x, h / 2, z);
    t.rotation.z = (rng() - 0.5) * 0.3;
    g.add(t);
    for (let k = 0; k < 6; k++) {
      const fr = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.2, 4), leaf);
      const a = (k / 6) * Math.PI * 2;
      fr.position.set(x + Math.cos(a) * 1.2, h, z + Math.sin(a) * 1.2);
      fr.rotation.set(Math.PI / 2 - 0.4, 0, -a);
      fr.rotation.order = 'YXZ';
      fr.rotation.y = -a;
      fr.rotation.x = 1.25;
      g.add(fr);
    }
  }
  return g;
}

export class Landmarks {
  readonly group = new THREE.Group();
  private tiles: THREE.Group[] = [];
  private tileTemplate: () => THREE.Group;

  constructor(beach: Beach) {
    const preset = SKY_PRESETS[beach.look.sky];
    const kinds = new Set(beach.look.landmarks);
    const rng = seeded(beach.id.length * 7919 + 17);
    // template of one coastline tile
    this.tileTemplate = () => {
      const tile = new THREE.Group();
      // beach sand strip + dunes
      const sand = new THREE.Mesh(new THREE.BoxGeometry(REPEAT + 2, 1.2, 90), mat(kinds.has('icebergs') ? 0xe8f4ff : 0xe6d3a3, 1));
      sand.position.set(0, 0.2, SHORE_Z - 45);
      tile.add(sand);
      const wet = new THREE.Mesh(new THREE.BoxGeometry(REPEAT + 2, 0.2, 12), mat(kinds.has('icebergs') ? 0xcfe6f7 : 0xc9b27e, 0.6));
      wet.position.set(0, 0.35, SHORE_Z + 5);
      tile.add(wet);
      if (kinds.has('headland')) {
        const h = hills(rng, REPEAT, 60, 0x4a5a3a, 6);
        h.position.set(0, 0, SHORE_Z - 110);
        tile.add(h);
        const cliff = new THREE.Mesh(new THREE.BoxGeometry(70, 26, 40), mat(0x6b5a48));
        cliff.position.set(REPEAT * 0.3, 12, SHORE_Z - 30);
        tile.add(cliff);
      }
      if (kinds.has('reef-mountains')) {
        const m = hills(rng, REPEAT * 1.2, 140, 0x2f5a3f, 8);
        m.position.set(0, 0, SHORE_Z - 220);
        tile.add(m);
      }
      if (kinds.has('palms')) {
        const p = palms(rng, 14, REPEAT);
        p.position.set(0, 0.8, SHORE_Z - 30);
        tile.add(p);
      }
      if (kinds.has('pier')) {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 120), mat(0x8a6a4a));
        deck.position.set(REPEAT * 0.25, 6.5, SHORE_Z + 60);
        tile.add(deck);
        for (let i = 0; i < 10; i++) {
          for (const dx of [-2.2, 2.2]) {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 7, 8), mat(0x5a4632));
            p.position.set(REPEAT * 0.25 + dx, 3.2, SHORE_Z + 6 + i * 12);
            tile.add(p);
          }
        }
        const hut = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 8), mat(0xf4efe0));
        hut.position.set(REPEAT * 0.25, 9.2, SHORE_Z + 115);
        tile.add(hut);
      }
      if (kinds.has('icebergs')) {
        for (let i = 0; i < 4; i++) {
          const berg = new THREE.Mesh(new THREE.DodecahedronGeometry(6 + rng() * 10, 0), new THREE.MeshStandardMaterial({ color: 0xdff6ff, roughness: 0.4, flatShading: true }));
          berg.position.set((rng() - 0.5) * REPEAT, 2 + rng() * 3, 140 + rng() * 120);
          berg.scale.set(1.4, 0.8 + rng() * 0.6, 1);
          tile.add(berg);
        }
        const ice = hills(rng, REPEAT, 40, 0xf4fbff, 5);
        ice.position.set(0, 0, SHORE_Z - 90);
        tile.add(ice);
      }
      if (!kinds.has('headland') && !kinds.has('reef-mountains') && !kinds.has('icebergs') && !kinds.has('palms')) {
        // default: low dunes and a few houses so no beach is empty
        const d = hills(rng, REPEAT, 10, 0xd8c48a, 6);
        d.position.set(0, 0, SHORE_Z - 70);
        tile.add(d);
        for (let i = 0; i < 4; i++) {
          const house = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), mat(0xf4efe0));
          house.position.set((rng() - 0.5) * REPEAT, 2.5, SHORE_Z - 60 - rng() * 20);
          tile.add(house);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(5, 2.5, 4), mat(0xb54a3a));
          roof.position.set(house.position.x, 5.7, house.position.z);
          roof.rotation.y = Math.PI / 4;
          tile.add(roof);
        }
      }
      // forward features: something ahead-left every tile so the beach is in the chase view
      const px = REPEAT * 0.38;
      if (kinds.has('headland') || kinds.has('palms') || (!kinds.has('icebergs') && !kinds.has('pier'))) {
        // rocky promontory reaching out toward the line-up
        const rock = mat(kinds.has('palms') ? 0x5a4a3a : 0x6b5a48);
        for (let i = 0; i < 5; i++) {
          const w = 30 + rng() * 25;
          const h = 6 + rng() * 10;
          const r = new THREE.Mesh(new THREE.BoxGeometry(w, h, 30 + rng() * 20), rock);
          r.position.set(px + (rng() - 0.5) * 40, h / 2 - 1, SHORE_Z + 30 + i * 18);
          r.rotation.y = (rng() - 0.5) * 0.5;
          tile.add(r);
        }
        const tip = new THREE.Mesh(new THREE.DodecahedronGeometry(9, 0), rock);
        tip.position.set(px, 4, SHORE_Z + 118);
        tip.scale.set(2.2, 0.7, 1.4);
        tile.add(tip);
        if (kinds.has('headland')) {
          const light = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 12, 8), mat(0xf4f4f4, 0.6));
          light.position.set(px, 9, SHORE_Z + 70);
          tile.add(light);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(2, 2.5, 8), mat(0xb54a3a, 0.6));
          cap.position.set(px, 16, SHORE_Z + 70);
          tile.add(cap);
        }
        if (kinds.has('palms')) {
          const p = palms(rng, 6, 30);
          p.position.set(px, 4, SHORE_Z + 60);
          tile.add(p);
        }
      }
      if (kinds.has('pier')) {
        // the pier already reaches to SHORE_Z+120; add a fishing platform at its end
        const plat = new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 10), mat(0x8a6a4a));
        plat.position.set(REPEAT * 0.25, 6.6, SHORE_Z + 124);
        tile.add(plat);
      }
      if (kinds.has('reef-mountains')) {
        // offshore island chain out the back, on the seaward side of the wave
        const isl = hills(rng, REPEAT * 1.4, 90, 0x3a6a45, 6);
        isl.position.set(0, 0, 300);
        tile.add(isl);
      }
      // a couple of boats out the back for scale
      for (let i = 0; i < 2; i++) {
        const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 2.6), mat(0xf4f4f4, 0.5));
        hull.position.set((rng() - 0.5) * REPEAT, 0.6, 90 + rng() * 50);
        tile.add(hull);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.6, 2.2), mat(0x2a6f97, 0.5));
        cabin.position.set(hull.position.x - 0.5, 2.1, hull.position.z);
        tile.add(cabin);
      }
      tile.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = false;
      });
      void preset;
      return tile;
    };
    for (let i = 0; i < 3; i++) {
      const t = this.tileTemplate();
      this.tiles.push(t);
      this.group.add(t);
    }
  }

  /** Keep three tiles around the camera along x. */
  update(cameraX: number): void {
    const base = Math.floor(cameraX / REPEAT) - 1;
    for (let i = 0; i < this.tiles.length; i++) this.tiles[i]!.position.x = (base + i) * REPEAT + REPEAT / 2;
  }

  dispose(): void {
    for (const t of this.tiles) this.group.remove(t);
  }
}
