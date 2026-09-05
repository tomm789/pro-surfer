import type * as THREE from 'three';

/** A runnable scene: owns a three.js Scene + camera and a deterministic sim it advances at fixed dt. */
export interface GameScene {
  readonly name: string;
  /** Called once with the shared renderer; build objects here. */
  init(ctx: SceneContext): Promise<void> | void;
  /** Advance the simulation by exactly dt seconds. Must be deterministic for a given input stream. */
  step(dt: number): void;
  /** Update presentation for interpolation alpha in [0,1) and render into the renderer. */
  render(alpha: number): void;
  /** Free GPU resources. */
  dispose(): void;
  /** Optional: report cameras for aspect updates. */
  cameras(): THREE.PerspectiveCamera[];
  /** Optional debug snapshot exposed to headless tooling. */
  debugState?(): Record<string, unknown>;
}

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  container: HTMLElement;
  uiRoot: HTMLElement;
  params: URLSearchParams;
  headless: boolean;
  seed: number;
}

export type SceneFactory = () => GameScene;
