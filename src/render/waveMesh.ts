import * as THREE from 'three';
import type { WaveModel } from '@/wave/wave';
import { allocRows, buildProfileRows, ROW_COUNT, type ProfileRow } from '@/wave/profile';
import { waveVertex, waveFragment } from './waterShader';
import type { WaterUniforms } from './waterUniforms';

export interface WaveMeshOptions {
  columns: number;
  behind: number;
  ahead: number;
  skirt: number;
}

/** Dynamic wave strip: a (columns × ROW_COUNT) grid rebuilt on the CPU each frame from the WaveModel profile. */
export class WaveMesh {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private foam: Float32Array;
  private height: Float32Array;
  private face: Float32Array;
  private tube: Float32Array;
  private vv: Float32Array;
  private rows: ProfileRow[] = allocRows();
  private opts: WaveMeshOptions;
  private du: number;
  /** World-z extent of the strip after the last update (for blending the ambient ocean). */
  zMin = 0;
  zMax = 0;

  constructor(uniforms: WaterUniforms, opts: Partial<WaveMeshOptions> = {}) {
    this.opts = { columns: 176, behind: 42, ahead: 92, skirt: 40, ...opts };
    this.du = (this.opts.behind + this.opts.ahead) / (this.opts.columns - 1);
    const n = this.opts.columns * ROW_COUNT;
    this.positions = new Float32Array(n * 3);
    this.foam = new Float32Array(n);
    this.height = new Float32Array(n);
    this.face = new Float32Array(n);
    this.tube = new Float32Array(n);
    this.vv = new Float32Array(n);
    this.geometry = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(this.positions, 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', pos);
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aFoam', new THREE.BufferAttribute(this.foam, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aHeight', new THREE.BufferAttribute(this.height, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aFace', new THREE.BufferAttribute(this.face, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aTube', new THREE.BufferAttribute(this.tube, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aV', new THREE.BufferAttribute(this.vv, 1).setUsage(THREE.DynamicDrawUsage));
    // static index: quads between adjacent columns
    const cols = this.opts.columns;
    const idx = new Uint32Array((cols - 1) * (ROW_COUNT - 1) * 6);
    let k = 0;
    for (let c = 0; c < cols - 1; c++) {
      for (let r = 0; r < ROW_COUNT - 1; r++) {
        const a = c * ROW_COUNT + r;
        const b = a + ROW_COUNT;
        idx[k++] = a;
        idx[k++] = b;
        idx[k++] = a + 1;
        idx[k++] = a + 1;
        idx[k++] = b;
        idx[k++] = b + 1;
      }
    }
    this.geometry.setIndex(new THREE.BufferAttribute(idx, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uFoamScroll: { value: 0 } },
      vertexShader: waveVertex,
      fragmentShader: waveFragment,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }

  /** Rebuild all vertices from the wave model. The u-window snaps to the column spacing so columns don't swim. */
  update(wave: WaveModel): void {
    const { columns, behind, skirt } = this.opts;
    const du = this.du;
    const u0 = Math.floor((wave.curlU - behind) / du) * du;
    const dir = wave.params.direction;
    const rows = this.rows;
    let vi = 0;
    let zMin = Infinity;
    let zMax = -Infinity;
    for (let c = 0; c < columns; c++) {
      const u = u0 + c * du;
      const prof = wave.profileAt(u);
      buildProfileRows(prof, rows, skirt);
      for (let r = 0; r < ROW_COUNT; r++) {
        const row = rows[r]!;
        const p = vi * 3;
        const z = -row.d;
        if (z < zMin) zMin = z;
        if (z > zMax) zMax = z;
        this.positions[p] = dir * u;
        this.positions[p + 1] = row.y;
        this.positions[p + 2] = z;
        this.foam[vi] = row.foam;
        this.height[vi] = row.height01;
        this.face[vi] = row.faceMask;
        this.tube[vi] = row.tubeMask;
        this.vv[vi] = row.v;
        vi++;
      }
    }
    this.zMin = zMin;
    this.zMax = zMax;
    const g = this.geometry;
    g.attributes.position!.needsUpdate = true;
    g.attributes.aFoam!.needsUpdate = true;
    g.attributes.aHeight!.needsUpdate = true;
    g.attributes.aFace!.needsUpdate = true;
    g.attributes.aTube!.needsUpdate = true;
    g.attributes.aV!.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
