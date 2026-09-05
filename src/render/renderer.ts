import * as THREE from 'three';

export interface RendererOptions {
  container: HTMLElement;
  pixelRatioCap?: number;
  antialias?: boolean;
}

export function createRenderer(opts: RendererOptions): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: opts.antialias ?? true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true, // needed for headless screenshots
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.pixelRatioCap ?? 2));
  renderer.setSize(opts.container.clientWidth, opts.container.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  opts.container.appendChild(renderer.domElement);
  return renderer;
}

export function resizeRendererToContainer(renderer: THREE.WebGLRenderer, container: HTMLElement, cameras: THREE.PerspectiveCamera[]): boolean {
  const w = container.clientWidth;
  const h = container.clientHeight;
  const canvas = renderer.domElement;
  const pr = renderer.getPixelRatio();
  if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
    renderer.setSize(w, h, false);
    for (const cam of cameras) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    return true;
  }
  return false;
}
