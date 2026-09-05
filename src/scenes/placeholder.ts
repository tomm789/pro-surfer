import * as THREE from 'three';
import type { GameScene, SceneContext } from '@/app/scene';

/** M0 smoke scene: sky, sea plane, a capsule rider and a light. Proves the render + headless pipeline. */
export class PlaceholderScene implements GameScene {
  readonly name = 'placeholder';
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
  private renderer!: THREE.WebGLRenderer;
  private rider!: THREE.Mesh;
  private t = 0;

  init(ctx: SceneContext): void {
    this.renderer = ctx.renderer;
    this.scene.background = new THREE.Color(0x8ec9ea);
    this.scene.fog = new THREE.Fog(0x8ec9ea, 60, 220);

    const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    this.scene.add(sun, new THREE.HemisphereLight(0xbfe6ff, 0x0a3550, 0.8));

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x1b6f8f, roughness: 0.35, metalness: 0.1 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.receiveShadow = true;
    this.scene.add(sea);

    this.rider = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 1.1, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0xff7a3d, roughness: 0.6 }),
    );
    this.rider.position.set(0, 0.9, 0);
    this.rider.castShadow = true;
    this.scene.add(this.rider);

    this.camera.position.set(-6, 3.5, 8);
    this.camera.lookAt(0, 1, 0);
  }

  step(dt: number): void {
    this.t += dt;
    this.rider.position.x = Math.sin(this.t * 0.8) * 3;
    this.rider.rotation.y = this.t;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  cameras(): THREE.PerspectiveCamera[] {
    return [this.camera];
  }

  dispose(): void {
    this.scene.clear();
  }

  debugState(): Record<string, unknown> {
    return { t: this.t, riderX: this.rider.position.x };
  }
}
