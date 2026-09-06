/** Pooled point-sprite spray: rail spray behind the board, lip mist along the curl, tube spit. One draw call. */
import * as THREE from 'three';

const MAX = 1800;

const vert = /* glsl */ `
attribute float aSize;
attribute float aLife;
attribute float aSeed;
varying float vLife;
varying float vSeed;
void main() {
  vLife = aLife;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (260.0 / max(1.0, -mv.z)) * (0.6 + 0.8 * (1.0 - aLife));
  gl_Position = projectionMatrix * mv;
}
`;
const frag = /* glsl */ `
precision highp float;
varying float vLife;
varying float vSeed;
uniform vec3 uColor;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float r = length(p);
  if (r > 0.5) discard;
  float soft = smoothstep(0.5, 0.15 + 0.2 * vSeed, r);
  float a = soft * vLife * 0.55;
  gl_FragColor = vec4(uColor, a);
}
`;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  decay: number;
  size: number;
}

export class SpraySystem {
  readonly points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private size: Float32Array;
  private life: Float32Array;
  private seed: Float32Array;
  private particles: Particle[] = [];
  private next = 0;
  private gravity = 6.5;

  constructor(color = 0xf4fbff) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.seed = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) {
      this.particles.push({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0, decay: 1, size: 1 });
      this.seed[i] = Math.random();
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, lifeSeconds: number, jitter = 1): void {
    const p = this.particles[this.next]!;
    this.next = (this.next + 1) % MAX;
    p.x = x + (Math.random() - 0.5) * 0.3 * jitter;
    p.y = y + (Math.random() - 0.5) * 0.2 * jitter;
    p.z = z + (Math.random() - 0.5) * 0.3 * jitter;
    p.vx = vx + (Math.random() - 0.5) * 1.5 * jitter;
    p.vy = vy + (Math.random() - 0.5) * 1.0 * jitter;
    p.vz = vz + (Math.random() - 0.5) * 1.5 * jitter;
    p.life = 1;
    p.decay = 1 / Math.max(0.1, lifeSeconds);
    p.size = size;
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      const p = this.particles[i]!;
      if (p.life <= 0) {
        this.life[i] = 0;
        continue;
      }
      p.life -= p.decay * dt;
      p.vy -= this.gravity * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vz *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.size[i] = p.size;
      this.life[i] = Math.max(0, p.life);
    }
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.attributes.aSize!.needsUpdate = true;
    this.geo.attributes.aLife!.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
