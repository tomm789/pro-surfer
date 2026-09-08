import * as THREE from 'three';
import { createRenderer, resizeRendererToContainer } from '@/render/renderer';
import { createFixedStepper } from '@/core/loop';
import { TUNING } from '@/core/tuning';
import type { GameScene, SceneContext, SceneFactory } from './scene';

declare global {
  interface Window {
    __lineup?: HeadlessApi;
  }
}

/** API exposed to headless tooling (tools/screenshot.mjs) and debugging. */
export interface HeadlessApi {
  ready: Promise<void>;
  /** Step the sim N fixed steps and render once. */
  step(n: number): void;
  /** Advance sim time to an absolute number of seconds (no-op if already past). */
  stepTo(seconds: number): void;
  render(): void;
  time(): number;
  scene(): string;
  state(): Record<string, unknown>;
  stats(): { frameMs: number; drawCalls: number; triangles: number };
  setInput(input: Record<string, unknown>): void;
}

export class App {
  private renderer: THREE.WebGLRenderer;
  private scene: GameScene | null = null;
  private stepper = createFixedStepper(TUNING.sim.hz, TUNING.sim.maxSubSteps);
  private simTime = 0;
  private lastFrame = 0;
  private running = false;
  private headless: boolean;
  private container: HTMLElement;
  private uiRoot: HTMLElement;
  private params: URLSearchParams;
  private lastFrameMs = 0;
  private inputOverride: Record<string, unknown> | null = null;
  private needsResize = true;
  private lastCamera: unknown = null;
  readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;

  constructor(private registry: Record<string, SceneFactory>) {
    this.container = document.getElementById('app')!;
    this.uiRoot = document.getElementById('ui')!;
    this.params = new URLSearchParams(location.search);
    this.headless = this.params.get('headless') === '1';
    this.renderer = createRenderer({ container: this.container, pixelRatioCap: this.headless ? 1 : 2 });
    this.readyPromise = new Promise((r) => (this.resolveReady = r));
    window.__lineup = this.headlessApi();
  }

  async start(): Promise<void> {
    const name = this.params.get('scene') ?? 'game';
    const factory = this.registry[name] ?? this.registry['game'] ?? this.registry['placeholder'];
    if (!factory) throw new Error(`No scenes registered`);
    const seed = Number(this.params.get('seed') ?? 1) || 1;
    this.scene = factory();
    const ctx: SceneContext = {
      renderer: this.renderer,
      container: this.container,
      uiRoot: this.uiRoot,
      params: this.params,
      headless: this.headless,
      seed,
    };
    await this.scene.init(ctx);
    resizeRendererToContainer(this.renderer, this.container, this.scene.cameras());
    window.addEventListener('resize', () => {
      this.needsResize = true;
    });
    const t = Number(this.params.get('t') ?? 0);
    if (t > 0) this.stepTo(t);
    this.renderOnce(0);
    this.resolveReady();
    if (!this.headless) this.run();
  }

  private run(): void {
    this.running = true;
    this.lastFrame = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const elapsed = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      const t0 = performance.now();
      const { alpha } = this.stepper.advance(elapsed, (dt) => this.stepSim(dt));
      this.renderOnce(alpha);
      this.lastFrameMs = performance.now() - t0;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private stepSim(dt: number): void {
    this.scene?.step(dt);
    this.simTime += dt;
  }

  private renderOnce(alpha: number): void {
    if (!this.scene) return;
    // reading the container's size forces a layout, so only do it after a resize or a camera change
    const cams = this.scene.cameras();
    if (this.needsResize || cams[0] !== this.lastCamera) {
      resizeRendererToContainer(this.renderer, this.container, cams);
      this.needsResize = false;
      this.lastCamera = cams[0];
    }
    this.scene.render(alpha);
  }

  private stepTo(seconds: number): void {
    const dt = this.stepper.dt;
    let guard = 0;
    while (this.simTime + dt * 0.5 < seconds && guard++ < 1_000_000) this.stepSim(dt);
  }

  private headlessApi(): HeadlessApi {
    return {
      ready: this.readyPromise,
      step: (n) => {
        for (let i = 0; i < n; i++) this.stepSim(this.stepper.dt);
        this.renderOnce(0);
      },
      stepTo: (s) => {
        this.stepTo(s);
        this.renderOnce(0);
      },
      render: () => this.renderOnce(0),
      time: () => this.simTime,
      scene: () => this.scene?.name ?? '',
      state: () => this.scene?.debugState?.() ?? {},
      stats: () => ({
        frameMs: this.lastFrameMs,
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
      }),
      setInput: (input) => {
        this.inputOverride = input;
        // scenes created later (behind a transition) read the pending value on init
        (window as unknown as { __lineupInput?: unknown }).__lineupInput = input;
        window.dispatchEvent(new CustomEvent('lineup:input', { detail: input }));
      },
    };
  }
}
