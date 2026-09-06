import * as THREE from 'three';
import type { GameScene, SceneContext } from '@/app/scene';
import { Rng } from '@/core/rng';
import { EventBus } from '@/core/events';
import { TUNING } from '@/core/tuning';
import { WaveModel, waveParamsFromBeach } from '@/wave/wave';
import { getBeach } from '@/world/beaches';
import { waveFeetToMetres } from '@/world/beach';
import { RiderSim, makePose, type RiderEvents } from '@/rider/rider';
import { NEUTRAL_INPUT, cloneInput, type RiderInput } from '@/rider/input';
import { WaveMesh } from '@/render/waveMesh';
import { Environment } from '@/render/environment';
import { createWaterUniforms } from '@/render/waterUniforms';
import { RiderView } from '@/render/riderView';
import { ChaseCamera } from '@/render/chaseCamera';
import { InputManager } from '@/input/inputManager';

/**
 * M2 playable: wave + rider + chase camera + debug HUD.
 * URL params: beach=<id> ft=<n> seed=<n> auto=1 (stand automatically) cam=chase|wide
 */
export class RideScene implements GameScene {
  readonly name = 'ride';
  private scene = new THREE.Scene();
  private renderer!: THREE.WebGLRenderer;
  private wave!: WaveModel;
  private rider!: RiderSim;
  private events = new EventBus<RiderEvents>();
  private waveMesh!: WaveMesh;
  private env!: Environment;
  private uniforms!: ReturnType<typeof createWaterUniforms>;
  private riderView!: RiderView;
  private cam!: ChaseCamera;
  private inputManager = new InputManager(TUNING.input.deadzone);
  private headlessInput: RiderInput | null = null;
  /** Time-keyed input script for headless captures: at sim time ≥ t the input switches. */
  private inputScript: { t: number; input: Partial<RiderInput> }[] = [];
  private eventLog: string[] = [];
  private pose = makePose();
  private time = 0;
  private hud!: HTMLElement;
  private flash = '';
  private flashT = 0;
  private auto = false;
  private assistBalance = false;
  private lastFrameInput: Readonly<RiderInput> = NEUTRAL_INPUT;
  private prevCameraToggle = false;
  private headless = false;

  init(ctx: SceneContext): void {
    this.renderer = ctx.renderer;
    this.headless = ctx.headless;
    const beach = getBeach(ctx.params.get('beach') ?? 'sandbar');
    const ft = Number(ctx.params.get('ft') ?? 8);
    this.auto = ctx.params.get('auto') === '1';
    this.assistBalance = ctx.params.get('assist') === 'balance';
    const params = waveParamsFromBeach(beach, waveFeetToMetres(ft), { warnSeconds: TUNING.wave.sectionWarnSeconds });
    this.wave = new WaveModel(params, new Rng(ctx.seed), 0);
    this.rider = new RiderSim(this.wave, TUNING, { spin: 0.5, speed: 0.5, air: 0.5, balance: 0.5 }, this.events);
    this.uniforms = createWaterUniforms(beach);
    this.env = new Environment(beach, this.uniforms);
    this.scene.add(this.env.group);
    this.waveMesh = new WaveMesh(this.uniforms);
    this.scene.add(this.waveMesh.mesh);
    this.riderView = new RiderView(TUNING.rider.boardLength);
    this.scene.add(this.riderView.group);
    this.cam = new ChaseCamera(TUNING);
    if (ctx.params.get('cam') === 'wide') this.cam.mode = 'wide';
    this.rider.pose(this.pose);
    this.cam.snapTo(this.pose, this.wave.params.direction);
    if (!ctx.headless) this.inputManager.attach(window);
    window.addEventListener('lineup:input', (e) => {
      const d = (e as CustomEvent).detail as Partial<RiderInput> | { script: { t: number; input: Partial<RiderInput> }[] } | null;
      if (d && 'script' in d && Array.isArray(d.script)) {
        this.inputScript = d.script.slice().sort((a, b) => a.t - b.t);
        this.headlessInput = cloneInput(NEUTRAL_INPUT);
      } else this.headlessInput = d ? { ...cloneInput(NEUTRAL_INPUT), ...(d as Partial<RiderInput>) } : null;
    });
    this.events.on('land', (e) => this.setFlash(e.rating === 'perfect' ? 'PERFECT' : e.rating === 'sloppy' ? 'SLOPPY' : 'WIPEOUT', 1.2));
    this.events.on('wipeout', (e) => this.setFlash(`WIPEOUT · ${e.reason}`, 1.6));
    this.events.on('launch', () => this.setFlash('AIR', 0.5));
    for (const name of ['stand', 'launch', 'land', 'wipeout', 'respawn', 'tubeEnter', 'tubeExit', 'floaterStart', 'floaterEnd'] as const) {
      this.events.on(name, (e) => {
        this.eventLog.push(`${this.time.toFixed(2)} ${name} ${JSON.stringify(e)}`);
        if (this.eventLog.length > 40) this.eventLog.shift();
      });
    }
    this.hud = document.createElement('div');
    this.hud.style.cssText =
      'position:absolute;left:16px;top:12px;font:14px/1.5 ui-monospace,Menlo,monospace;color:#eaf6ff;text-shadow:0 1px 2px #000;white-space:pre;pointer-events:none';
    ctx.uiRoot.appendChild(this.hud);
  }

  private setFlash(text: string, seconds: number): void {
    this.flash = text;
    this.flashT = seconds;
  }

  private currentInput(): Readonly<RiderInput> {
    if (this.headlessInput) return this.headlessInput;
    if (this.headless) return NEUTRAL_INPUT;
    return this.lastFrameInput;
  }

  step(dt: number): void {
    this.time += dt;
    while (this.inputScript.length && this.inputScript[0]!.t <= this.time) {
      const next = this.inputScript.shift()!;
      this.headlessInput = { ...cloneInput(NEUTRAL_INPUT), ...next.input };
    }
    let input = this.currentInput();
    if (this.auto && this.rider.state === 'prone' && this.rider.stateTime > 0.8) input = { ...input, stand: true };
    if (this.assistBalance && this.rider.state === 'tube') {
      // accessibility assist / capture helper: tap against the balance marker's drift
      const b = this.rider.tube.balance;
      const frame = Math.floor(this.time * 60);
      input = { ...input, stickX: Math.abs(b) > 0.08 && frame % 6 < 3 ? Math.sign(b) : 0 };
    }
    this.wave.step(dt, this.rider.state === 'wipeout' ? null : this.rider.u);
    this.rider.step(dt, input);
    if (this.flashT > 0) this.flashT -= dt;
    // camera and rider pose advance with sim time so headless captures and replays are exact
    this.rider.pose(this.pose);
    const speed01 = Math.min(1, this.rider.speed / TUNING.rider.maxSpeed);
    this.riderView.update(this.pose, this.rider.state, dt, speed01);
    this.cam.update(this.pose, this.wave.params.direction, this.rider.state, speed01, dt);
  }

  render(): void {
    if (!this.headless) {
      const inp = this.inputManager.poll();
      // camera toggle on press
      if (inp.cameraToggle && !this.prevCameraToggle) this.cam.mode = this.cam.mode === 'chase' ? 'wide' : 'chase';
      this.prevCameraToggle = inp.cameraToggle;
      this.lastFrameInput = cloneInput(inp);
    }
    this.uniforms.uTime.value = this.time;
    this.waveMesh.update(this.wave);
    this.uniforms.uAmpMask0.value = (this.waveMesh.zMin + this.waveMesh.zMax) / 2;
    this.uniforms.uAmpMask1.value = (this.waveMesh.zMax - this.waveMesh.zMin) / 2 - 8;
    this.env.update(this.cam.camera.position, this.riderView.group.position);
    this.renderer.render(this.scene, this.cam.camera);
    this.updateHud();
  }

  private updateHud(): void {
    const r = this.rider;
    const lines = [
      `state ${r.state}   speed ${r.speed.toFixed(1)} m/s   heading ${r.headingDeg.toFixed(0)}°`,
      `u ${r.u.toFixed(1)}  v ${r.v.toFixed(2)}  ahead of curl ${r.aheadOfCurl.toFixed(1)} m  load ${(r.jumpLoad * 100).toFixed(0)}%`,
      `sections ${this.wave.sections.length}  warnings ${this.wave.warnings().length}  wipeouts ${r.wipeouts}` +
        (r.state === 'tube' ? `   TUBE depth ${(r.tube.depth * 100).toFixed(0)}%  balance ${r.tube.balance.toFixed(2)}  ${r.tube.seconds.toFixed(1)}s` : '') +
        (r.state === 'floater' ? `   FLOATER ${r.floaterSeconds.toFixed(1)}s` : ''),
      this.inputManager.gamepadName ? `pad: ${this.inputManager.gamepadName}` : 'keyboard: arrows/WASD move · Space jump · J carve · K grab · L slide/stand · Q/E spin',
    ];
    if (this.flashT > 0) lines.push('', `>>> ${this.flash} <<<`);
    this.hud.textContent = lines.join('\n');
  }

  cameras(): THREE.PerspectiveCamera[] {
    return [this.cam.camera];
  }

  dispose(): void {
    this.waveMesh.dispose();
    this.env.dispose();
    this.inputManager.detach(window);
    this.hud.remove();
  }

  debugState(): Record<string, unknown> {
    return { t: this.time, curlU: this.wave.curlU, rider: this.rider.snapshot(), sections: this.wave.sections.length, events: this.eventLog };
  }
}
