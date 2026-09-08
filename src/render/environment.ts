import * as THREE from 'three';
import type { Beach } from '@/world/beach';
import { oceanVertex, oceanFragment, skyVertex, skyFragment } from './waterShader';
import { SKY_PRESETS, type WaterUniforms } from './waterUniforms';

/** Sky dome + ambient ocean plane + sun light for a beach. */
export class Environment {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly ocean: THREE.Mesh;
  private sky: THREE.Mesh;
  private oceanMat: THREE.ShaderMaterial;
  private sunDir = new THREE.Vector3();

  constructor(beach: Beach, uniforms: WaterUniforms) {
    const preset = SKY_PRESETS[beach.look.sky];
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: {
          uSunDir: uniforms.uSunDir,
          uSunColor: uniforms.uSunColor,
          uSkyHorizon: uniforms.uSkyHorizon,
          uSkyZenith: uniforms.uSkyZenith,
          uHaze: uniforms.uHaze,
          uTime: uniforms.uTime,
          uCloudCover: uniforms.uCloudCover,
          uCloudTop: uniforms.uCloudTop,
          uCloudBase: uniforms.uCloudBase,
        },
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    this.oceanMat = new THREE.ShaderMaterial({ uniforms, vertexShader: oceanVertex, fragmentShader: oceanFragment });
    const geo = new THREE.PlaneGeometry(1400, 1400, 180, 180);
    geo.rotateX(-Math.PI / 2);
    this.ocean = new THREE.Mesh(geo, this.oceanMat);
    this.ocean.position.y = -0.04;
    this.ocean.frustumCulled = false;
    this.group.add(this.ocean);

    this.sun = new THREE.DirectionalLight(new THREE.Color(preset.sun), preset.sunIntensity);
    this.sunDir.copy(uniforms.uSunDir.value).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(120);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    const cam = this.sun.shadow.camera;
    cam.left = -40;
    cam.right = 40;
    cam.top = 40;
    cam.bottom = -40;
    cam.near = 20;
    cam.far = 300;
    this.group.add(this.sun, this.sun.target);
    this.group.add(new THREE.HemisphereLight(new THREE.Color(preset.ambient), new THREE.Color(beach.look.waterDeep), 0.9));
  }

  /** Keep the sky/ocean centred on the camera and the shadow frustum on the focus point. */
  update(cameraPos: THREE.Vector3, focus: THREE.Vector3): void {
    this.sky.position.copy(cameraPos);
    this.ocean.position.x = Math.round(cameraPos.x / 20) * 20;
    this.ocean.position.z = Math.round(cameraPos.z / 20) * 20;
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 120);
  }

  dispose(): void {
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.ocean.geometry.dispose();
    this.oceanMat.dispose();
  }
}
