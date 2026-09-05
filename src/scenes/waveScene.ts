import * as THREE from 'three';
import type { GameScene, SceneContext } from '@/app/scene';
import { Rng } from '@/core/rng';
import { TUNING } from '@/core/tuning';
import { WaveModel, waveParamsFromBeach } from '@/wave/wave';
import { getBeach } from '@/world/beaches';
import { waveFeetToMetres } from '@/world/beach';
import { WaveMesh } from '@/render/waveMesh';
import { Environment } from '@/render/environment';
import { createWaterUniforms } from '@/render/waterUniforms';

/**
 * M1 scene: a peeling wave with sections, viewed from a debug camera.
 * URL params: beach=<id> ft=<height feet> cam=chase|side|tube|top|lip t=<seconds> seed=<n>
 */
export class WaveScene implements GameScene {
  readonly name = 'wave';
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(TUNING.camera.fov, 16 / 9, 0.3, 1500);
  private renderer!: THREE.WebGLRenderer;
  private wave!: WaveModel;
  private waveMesh!: WaveMesh;
  private env!: Environment;
  private uniforms!: ReturnType<typeof createWaterUniforms>;
  private camMode = 'chase';
  private time = 0;
  private marker!: THREE.Mesh;
  private riderU = 0;

  init(ctx: SceneContext): void {
    this.renderer = ctx.renderer;
    const beach = getBeach(ctx.params.get('beach') ?? 'sandbar');
    const ft = Number(ctx.params.get('ft') ?? 8);
    this.camMode = ctx.params.get('cam') ?? 'chase';
    const params = waveParamsFromBeach(beach, waveFeetToMetres(ft), { warnSeconds: TUNING.wave.sectionWarnSeconds });
    this.wave = new WaveModel(params, new Rng(ctx.seed), 0);
    this.uniforms = createWaterUniforms(beach);
    this.env = new Environment(beach, this.uniforms);
    this.scene.add(this.env.group);
    this.waveMesh = new WaveMesh(this.uniforms);
    this.scene.add(this.waveMesh.mesh);
    // a stand-in "rider" marker on the face so scale reads in screenshots
    this.marker = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.3, 4, 8), new THREE.MeshStandardMaterial({ color: 0xff7a3d }));
    this.marker.castShadow = true;
    this.scene.add(this.marker);
    this.riderU = this.wave.curlU + 10;
  }

  step(dt: number): void {
    this.time += dt;
    // the stand-in rider trims along the face just ahead of the curl
    this.riderU = this.wave.curlU + 9 + Math.sin(this.time * 0.4) * 3;
    this.wave.step(dt, this.riderU);
  }

  render(): void {
    this.uniforms.uTime.value = this.time;
    this.waveMesh.update(this.wave);
    const dir = this.wave.params.direction;
    const pos = new THREE.Vector3();
    const p = { x: 0, y: 0, z: 0 };
    this.wave.position(this.riderU, 0.42, p);
    pos.set(p.x, p.y, p.z);
    this.marker.position.copy(pos).addScaledVector(new THREE.Vector3(0, 1, 0), 0.9);
    const focus = pos.clone();
    const cam = this.camera;
    switch (this.camMode) {
      case 'side': // from the beach looking out to sea along the crest
        cam.position.set(pos.x - dir * 6, 3.5, pos.z - 26);
        cam.lookAt(pos.x + dir * 10, 1.5, pos.z + 6);
        break;
      case 'top':
        cam.position.set(pos.x, 60, pos.z - 10);
        cam.lookAt(pos.x + dir * 20, 0, pos.z);
        break;
      case 'lip': // from behind the wave looking over the lip
        cam.position.set(pos.x - dir * 14, 7, pos.z + 22);
        cam.lookAt(pos.x + dir * 12, 1, pos.z - 6);
        break;
      case 'tube': {
        this.wave.position(this.riderU + 1.5, 0.25, p);
        cam.position.set(p.x - dir * 6, p.y + 1.4, p.z - 0.5);
        cam.lookAt(p.x + dir * 20, 1.2, p.z - 2);
        break;
      }
      default: {
        const c = TUNING.camera;
        cam.position.set(pos.x - dir * c.chaseDistance * 0.75, pos.y + c.chaseHeight, pos.z - c.chaseDistance * 0.75);
        cam.lookAt(pos.x + dir * c.lookAheadU, pos.y + 1, pos.z + 2);
      }
    }
    this.env.update(cam.position, focus);
    this.renderer.render(this.scene, cam);
  }

  cameras(): THREE.PerspectiveCamera[] {
    return [this.camera];
  }

  dispose(): void {
    this.waveMesh.dispose();
    this.env.dispose();
  }

  debugState(): Record<string, unknown> {
    const f = this.wave.fields(this.riderU);
    return {
      t: this.time,
      curlU: this.wave.curlU,
      riderU: this.riderU,
      sections: this.wave.sections.length,
      merged: this.wave.mergedSections,
      fieldsAtRider: f,
    };
  }
}
