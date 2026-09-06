/**
 * Two-player split screen: two independent rides rendered side by side.
 * Head-to-Head: fixed divider, most points at time-out wins.
 * Push (design doc §10): the divider moves toward whoever is scoring less; own the screen to win.
 */
import * as THREE from 'three';
import type { GameScene, SceneContext } from '@/app/scene';
import type { RiderInput } from '@/rider/input';
import { NEUTRAL_INPUT } from '@/rider/input';
import type { AudioManager } from '@/audio/audio';
import { PushDivider } from '@/modes/push';
import { KEYMAP_P1, KEYMAP_P2, keymapHint } from '@/input/keymaps';
import { RideScene } from './rideScene';

export type SplitMode = 'head' | 'push';

export interface SplitResult {
  winner: 1 | 2 | null;
  scores: [number, number];
  shares: [number, number];
}

export class SplitScene implements GameScene {
  readonly name = 'split';
  readonly rides: [RideScene, RideScene];
  private roots: [HTMLDivElement, HTMLDivElement];
  private divider: HTMLDivElement;
  private push: PushDivider | null;
  private share = 0.5;
  private time = 0;
  private ended = false;
  onEnd: ((r: SplitResult) => void) | null = null;
  private inputs: [Readonly<RiderInput>, Readonly<RiderInput>] = [NEUTRAL_INPUT, NEUTRAL_INPUT];
  private banner: HTMLDivElement;
  private result: SplitResult | null = null;
  private endCountdown: number | null = null;

  constructor(
    private mode: SplitMode,
    private seconds: number,
    private audio: AudioManager | null,
    /** Per-player controls hint shown at the bottom of each half. */
    private hints: [string, string] = [keymapHint(KEYMAP_P1), keymapHint(KEYMAP_P2)],
  ) {
    this.rides = [new RideScene(), new RideScene()];
    this.roots = [document.createElement('div'), document.createElement('div')];
    this.divider = document.createElement('div');
    this.banner = document.createElement('div');
    this.push = mode === 'push' ? new PushDivider({ fullScreenPoints: 60000, winShare: 0.92, minShare: 0.06 }) : null;
  }

  init(ctx: SceneContext): void {
    for (let i = 0; i < 2; i++) {
      const root = this.roots[i]!;
      root.style.cssText = 'position:absolute;top:0;bottom:0;overflow:hidden;pointer-events:none';
      ctx.uiRoot.appendChild(root);
      const params = new URLSearchParams(ctx.params);
      params.set('hosted', '1');
      params.set('seconds', String(this.seconds));
      params.delete('free');
      params.delete('level');
      params.set('hudScale', '0.62');
      params.set('player', `PLAYER ${i + 1}`);
      params.set('seed', String(ctx.seed + i * 101));
      if (ctx.params.get('rider2') && i === 1) params.set('rider', ctx.params.get('rider2')!);
      if (ctx.params.get('board2') && i === 1) params.set('board', ctx.params.get('board2')!);
      if (ctx.params.get('auto2') === '1' && i === 1) params.set('auto', '1');
      const ride = this.rides[i]!;
      ride.audio = i === 0 ? this.audio : null;
      ride.init({ ...ctx, uiRoot: root, params });
      ride.controlsHint = this.hints[i]!;
      ride.run.events.on('chainBanked', (b) => this.push?.onBank(i === 0 ? 1 : 2, b.total));
    }
    this.divider.style.cssText = 'position:absolute;top:0;bottom:0;width:6px;margin-left:-3px;background:linear-gradient(180deg,#3ef0a0,#ffe27a,#ff7a3d);box-shadow:0 0 14px rgba(0,0,0,.6);pointer-events:none';
    ctx.uiRoot.appendChild(this.divider);
    this.banner.style.cssText =
      'position:absolute;left:50%;top:12%;transform:translateX(-50%);font:900 42px/1 "Trebuchet MS",sans-serif;color:#ffe27a;text-shadow:0 3px 6px rgba(0,0,0,.7);letter-spacing:3px;opacity:0;pointer-events:none';
    ctx.uiRoot.appendChild(this.banner);
    this.layout();
  }

  setInputs(p1: Readonly<RiderInput>, p2: Readonly<RiderInput>): void {
    this.inputs = [p1, p2];
  }

  private layout(): void {
    const s = this.share;
    this.roots[0]!.style.left = '0';
    this.roots[0]!.style.width = `${s * 100}%`;
    this.roots[1]!.style.left = `${s * 100}%`;
    this.roots[1]!.style.right = '0';
    this.roots[1]!.style.width = `${(1 - s) * 100}%`;
    this.divider.style.left = `${s * 100}%`;
    this.rides[0]!.viewport = { x: 0, y: 0, w: s, h: 1 };
    this.rides[1]!.viewport = { x: s, y: 0, w: 1 - s, h: 1 };
  }

  step(dt: number): void {
    this.time += dt;
    if (this.endCountdown !== null) {
      this.endCountdown -= dt;
      if (this.endCountdown <= 0) {
        this.endCountdown = null;
        if (this.result) this.onEnd?.(this.result);
      }
    }
    for (let i = 0; i < 2; i++) {
      const r = this.rides[i]!;
      r.setInput(this.inputs[i]!);
      r.step(dt);
    }
    if (this.push) {
      this.push.step(dt);
      this.share = this.push.share;
      this.layout();
      if (this.push.winner && !this.ended) this.finish(this.push.winner);
    }
    const bothDone = this.rides[0]!.run.ended && this.rides[1]!.run.ended;
    if (bothDone && !this.ended) {
      const s1 = this.rides[0]!.run.score;
      const s2 = this.rides[1]!.run.score;
      this.finish(this.push ? this.push.decide() : s1 === s2 ? null : s1 > s2 ? 1 : 2);
    }
  }

  private finish(winner: 1 | 2 | null): void {
    this.ended = true;
    this.banner.textContent = winner ? `PLAYER ${winner} WINS` : 'DRAW';
    this.banner.style.opacity = '1';
    this.audio?.bank(80000);
    this.result = { winner, scores: [this.rides[0]!.run.score, this.rides[1]!.run.score], shares: [this.share, 1 - this.share] };
    this.endCountdown = 2.5;
  }

  render(): void {
    this.rides[0]!.render();
    this.rides[1]!.render();
  }

  cameras(): THREE.PerspectiveCamera[] {
    return [];
  }

  dispose(): void {
    for (const r of this.rides) r.dispose();
    for (const root of this.roots) root.remove();
    this.divider.remove();
    this.banner.remove();
  }

  debugState(): Record<string, unknown> {
    return { share: this.share, ended: this.ended, p1: this.rides[0]!.debugState(), p2: this.rides[1]!.debugState() };
  }
}
