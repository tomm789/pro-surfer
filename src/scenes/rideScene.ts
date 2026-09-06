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
import { SpraySystem } from '@/render/spray';
import { ChaseCamera } from '@/render/chaseCamera';
import { InputManager } from '@/input/inputManager';
import { TrickSystem, type TrickEvents } from '@/tricks/executor';
import { RunController } from '@/scoring/run';
import { Hud, type HudState } from '@/ui/hud';
import type { AudioManager } from '@/audio/audio';
import { GoalTracker, type GoalEvents, type Level } from '@/goals/goals';
import { getLevel } from '@/goals/levels';

/**
 * Playable ride: wave + rider + tricks + scoring + HUD.
 * URL params: beach=<id> ft=<n> seed=<n> auto=1 (stand automatically) cam=chase|wide assist=balance
 *             free=1 (no clock) seconds=<n> debug=1
 */
export class RideScene implements GameScene {
  readonly name = 'ride';
  private scene = new THREE.Scene();
  private renderer!: THREE.WebGLRenderer;
  private wave!: WaveModel;
  private rider!: RiderSim;
  readonly events = new EventBus<RiderEvents>();
  readonly trickEvents = new EventBus<TrickEvents>();
  readonly goalEvents = new EventBus<GoalEvents>();
  private tricks!: TrickSystem;
  run!: RunController;
  level: Level | null = null;
  goals: GoalTracker | null = null;
  private waveMesh!: WaveMesh;
  private env!: Environment;
  private uniforms!: ReturnType<typeof createWaterUniforms>;
  private riderView!: RiderView;
  private spray!: SpraySystem;
  private sprayTmp = { x: 0, y: 0, z: 0 };
  private cam!: ChaseCamera;
  private hud!: Hud;
  private inputManager = new InputManager(TUNING.input.deadzone);
  private headlessInput: RiderInput | null = null;
  private warnHook: (() => void) | null = null;
  private inputScript: { t: number; input: Partial<RiderInput> }[] = [];
  private eventLog: string[] = [];
  private pose = makePose();
  private time = 0;
  private auto = false;
  private assistBalance = false;
  private debug = false;
  private waveFt = 8;
  private lastFrameInput: Readonly<RiderInput> = NEUTRAL_INPUT;
  private prevCameraToggle = false;
  private prevCashIn = false;
  private cashInEdge = false;
  private headless = false;
  private hudState!: HudState;
  /** Optional audio manager (set by the game shell before init). */
  audio: AudioManager | null = null;
  /** Attract mode: runs behind the menus with an automatic rider and no HUD. */
  attract = false;
  /** Called once when the run ends. */
  onEnd: (() => void) | null = null;
  private externalInput: Readonly<RiderInput> | null = null;
  private attractTimer = 0;

  init(ctx: SceneContext): void {
    this.renderer = ctx.renderer;
    this.headless = ctx.headless;
    const levelId = ctx.params.get('level');
    this.level = levelId ? getLevel(levelId) : null;
    const beach = getBeach(this.level?.beach ?? ctx.params.get('beach') ?? 'sandbar');
    this.waveFt = this.level ? this.level.waveFt : Number(ctx.params.get('ft') ?? 8);
    this.auto = ctx.params.get('auto') === '1';
    this.assistBalance = ctx.params.get('assist') === 'balance';
    this.debug = ctx.params.get('debug') === '1';
    const params = waveParamsFromBeach(beach, waveFeetToMetres(this.waveFt), { warnSeconds: TUNING.wave.sectionWarnSeconds });
    this.wave = new WaveModel(params, new Rng(ctx.seed), 0);
    const statsRaw = ctx.params.get('stats');
    const stats = statsRaw ? (JSON.parse(statsRaw) as { spin: number; speed: number; air: number; balance: number }) : { spin: 0.5, speed: 0.5, air: 0.5, balance: 0.5 };
    this.rider = new RiderSim(this.wave, TUNING, stats, this.events, undefined, new Rng(ctx.seed + 7));
    this.tricks = new TrickSystem(this.rider, TUNING, this.trickEvents, this.events);
    this.run = new RunController(TUNING, this.rider, this.events, this.tricks, this.trickEvents, {
      untimed: !this.level && ctx.params.get('free') === '1',
      seconds: this.level ? this.level.seconds : ctx.params.has('seconds') ? Number(ctx.params.get('seconds')) : undefined,
    });
    if (this.level) {
      this.goals = new GoalTracker(
        this.level,
        { run: this.run, riderEvents: this.events, trickEvents: this.trickEvents, runEvents: this.run.events, wave: this.wave, riderU: () => this.rider.u, riderState: () => this.rider.state },
        this.goalEvents,
      );
    }

    this.uniforms = createWaterUniforms(beach);
    this.env = new Environment(beach, this.uniforms);
    this.scene.add(this.env.group);
    this.waveMesh = new WaveMesh(this.uniforms);
    this.scene.add(this.waveMesh.mesh);
    this.riderView = new RiderView(TUNING.rider.boardLength);
    this.scene.add(this.riderView.group);
    this.spray = new SpraySystem();
    this.scene.add(this.spray.points);
    this.cam = new ChaseCamera(TUNING);
    const camParam = ctx.params.get('cam');
    if (camParam === 'wide' || camParam === 'close') this.cam.mode = camParam;
    this.rider.pose(this.pose);
    this.cam.snapTo(this.pose, this.wave.params.direction);
    if (!ctx.headless && !this.attract && !ctx.params.has('hosted')) this.inputManager.attach(window);
    window.addEventListener('lineup:input', (e) => {
      const d = (e as CustomEvent).detail as Partial<RiderInput> | { script: { t: number; input: Partial<RiderInput> }[] } | null;
      if (d && 'script' in d && Array.isArray(d.script)) {
        this.inputScript = d.script.slice().sort((a, b) => a.t - b.t);
        this.headlessInput = cloneInput(NEUTRAL_INPUT);
      } else this.headlessInput = d ? { ...cloneInput(NEUTRAL_INPUT), ...(d as Partial<RiderInput>) } : null;
    });

    this.attract = this.attract || ctx.params.get('attract') === '1';
    this.hud = new Hud(ctx.uiRoot);
    if (this.attract) this.hud.root.style.display = 'none';
    this.hudState = {
      score: 0,
      clock: this.run.clock,
      meter: 0,
      meterState: 'empty',
      specialTime: 0,
      chainLabel: '',
      chainBase: 0,
      chainMultiplier: 0,
      chainOpen: false,
      objective: this.level ? [`${beach.name.toUpperCase()} · ${this.level.name.toUpperCase()}`, ...this.goals!.hudLines()] : ['FREE SURF', `${beach.name} · ${this.waveFt} ft ${beach.breakDirection}`],
      waveHeightFt: this.waveFt,
      nextWaveFt: null,
      sectionsAhead: [],
      warning: false,
      balance: null,
      tubeDepth: 0,
      tubeState: 'prone',
      hint: '',
      debug: '',
      flash: '',
      hazard: false,
    };
    this.wireEvents();
  }

  private log(line: string): void {
    this.eventLog.push(`${this.time.toFixed(2)} ${line}`);
    if (this.eventLog.length > 60) this.eventLog.shift();
  }

  private wireEvents(): void {
    this.events.on('land', (e) => {
      if (e.rating === 'perfect') this.hud.flash('PERFECT', 'perfect');
      else if (e.rating === 'sloppy') this.hud.flash('SLOPPY', 'sloppy');
      this.log(`land ${e.rating} spins180=${e.spins180} air=${e.airTime.toFixed(2)}`);
    });
    this.events.on('wipeout', (e) => {
      if (e.reason !== 'exit') this.hud.flash('WIPEOUT', 'wipeout', 1.4);
      this.log(`wipeout ${e.reason}`);
    });
    this.events.on('launch', (e) => this.log(`launch power=${e.power.toFixed(2)} speed=${e.speed.toFixed(1)}`));
    this.events.on('stand', () => this.log('stand'));
    this.events.on('respawn', () => this.log('respawn'));
    this.events.on('tubeEnter', (e) => this.log(`tubeEnter ${e.passive ? 'passive' : 'stall'}`));
    this.events.on('tubeExit', (e) => {
      this.log(`tubeExit ${e.seconds.toFixed(1)}s depth=${e.maxDepth.toFixed(2)} spit=${e.spit}`);
      if (e.spit) {
        this.hud.flash('SPIT!', 'info', 0.9);
        const p = this.pose.pos;
        this.burst(p.x, p.y + 0.8, p.z, 160, this.wave.params.direction * 9, 2.5, -2, 2.4, 1.2);
      }
    });
    this.events.on('wipeout', (e) => {
      if (e.reason === 'exit') return;
      const p = this.pose.pos;
      this.burst(p.x, p.y + 0.3, p.z, 90, 0, 4, 0, 1.6, 0.9);
    });
    this.events.on('land', (e) => {
      if (e.rating === 'wipeout') return;
      const p = this.pose.pos;
      this.burst(p.x, p.y + 0.1, p.z, 40, 0, 2.5, 0, 1.0, 0.6);
    });
    this.events.on('floaterStart', () => this.log('floaterStart'));
    this.events.on('floaterEnd', (e) => this.log(`floaterEnd ${e.overSection ? 'section' : 'face'}`));
    this.trickEvents.on('trickLand', (e) => this.log(`trickLand ${e.trick.id}`));
    this.trickEvents.on('trickFail', (e) => this.log(`trickFail ${e.trick.id} ${e.reason}`));
    this.trickEvents.on('specialLocked', (e) => this.hud.flash(`${e.trick.name} needs the special meter`, 'info', 1.2));
    this.trickEvents.on('exitMove', (e) => {
      this.hud.flash(`EXIT · ${e.trick.name}`, 'info', 1.5);
      this.rider.wipeout('exit');
    });
    this.run.events.on('chainBanked', (b) => {
      this.hud.showBank(b.total, b.cashedIn);
      this.log(`bank ${b.total} x${b.multiplier} ${b.cashedIn ? 'cash' : 'auto'} [${b.entries.map((x) => x.id).join('+')}]`);
      if (!this.headless && b.cashedIn) this.inputManager.rumble(0.6, 0.3, 180);
    });
    this.run.events.on('chainLost', (b) => this.log(`chainLost ${b.total}`));
    this.goalEvents.on('goalDone', (e) => {
      this.hud.flash(`GOAL · ${e.progress.label}`, 'perfect', 1.8);
      this.audio?.bank(50000);
      this.log(`goalDone ${e.goal.id}`);
    });
    this.goalEvents.on('goalFailed', (e) => {
      this.hud.flash(`FAILED · ${e.reason}`, 'wipeout', 1.8);
      this.log(`goalFailed ${e.goal.id}`);
    });
    this.run.events.on('meterYellow', () => {
      this.hud.flash('SPECIAL!', 'info', 0.8);
      this.log('meterYellow');
    });
    this.run.events.on('runEnd', (e) => {
      this.hud.flash(`TIME · ${e.score.toLocaleString('en-US')}`, 'info', 6);
      this.log(`runEnd ${e.score}`);
      this.audio?.bank(e.score);
      if (this.onEnd) setTimeout(() => this.onEnd?.(), 1800);
    });
    // sounds
    const a = () => this.audio;
    this.events.on('launch', () => a()?.launch());
    this.events.on('land', (e) => {
      a()?.land();
      if (e.rating === 'perfect') a()?.perfect();
      else if (e.rating === 'sloppy') a()?.sloppy();
    });
    this.events.on('wipeout', (e) => {
      if (e.reason !== 'exit') a()?.wipeout();
    });
    this.events.on('tubeEnter', () => a()?.tubeEnter());
    this.events.on('tubeExit', (e) => {
      if (e.spit) a()?.spit();
    });
    this.trickEvents.on('trickLand', (e) => (e.trick.special ? a()?.special() : a()?.trick()));
    this.run.events.on('chainBanked', (b) => a()?.bank(b.total));
    this.run.events.on('meterYellow', () => a()?.meterFull());
    let warned = 0;
    this.run.events.on('scoreChanged', () => undefined);
    this.events.on('respawn', () => (warned = 0));
    this.warnHook = () => {
      const w = this.wave.warnings().length;
      if (w > warned) a()?.warning();
      warned = w;
    };
  }

  /** The game shell feeds input here (so menus can swallow it). */
  setInput(input: Readonly<RiderInput>): void {
    this.externalInput = input;
  }

  get runController(): RunController {
    return this.run;
  }

  private currentInput(): Readonly<RiderInput> {
    if (this.headlessInput) return this.headlessInput;
    if (this.attract) return this.attractInput();
    if (this.externalInput) return this.externalInput;
    if (this.headless) return NEUTRAL_INPUT;
    return this.lastFrameInput;
  }

  /** A gentle automatic surfer for the menu background: trims, pumps and occasionally climbs. */
  private attractInput(): Readonly<RiderInput> {
    const t = this.time;
    const dir = this.wave.params.direction;
    const phase = t % 9;
    const inp = cloneInput(NEUTRAL_INPUT);
    if (this.rider.state === 'prone') inp.stand = this.rider.stateTime > 0.8;
    else if (phase < 5) inp.stickY = 0.7;
    else if (phase < 6.2) {
      inp.stickX = dir * 0.9;
      inp.stickY = 0.2;
    } else if (phase < 7.4) {
      inp.stickX = -dir * 0.8;
      inp.stickY = 0.6;
      inp.carve = true;
    } else inp.stickY = 0.4;
    return inp;
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
      const b = this.rider.tube.balance;
      const frame = Math.floor(this.time * 60);
      input = { ...input, stickX: Math.abs(b) > 0.08 && frame % 6 < 3 ? Math.sign(b) : 0 };
    }
    const cashIn = input.cashIn && !this.prevCashIn;
    this.prevCashIn = input.cashIn;
    if (input.cameraToggle && !this.prevCameraToggle) this.cam.mode = this.cam.mode === 'chase' ? 'wide' : 'chase';
    this.prevCameraToggle = input.cameraToggle;
    if (!this.run.ended) {
      this.wave.step(dt, this.rider.state === 'wipeout' ? null : this.rider.u);
      this.rider.step(dt, input);
      this.tricks.step(dt, input);
    }
    this.run.step(dt, cashIn || this.cashInEdge);
    this.cashInEdge = false;
    if (this.goals && !this.run.ended) this.goals.update(dt);
    this.warnHook?.();
    if (this.audio && !this.attract) {
      const r = this.rider;
      const nearCurl = Math.max(0, 1 - Math.max(0, r.aheadOfCurl) / 12);
      const ww = r.state === 'wipeout' ? 1 : r.state === 'floater' ? 0.8 : 0.35 + nearCurl * 0.5;
      const spray = r.state === 'face' ? Math.min(1, r.speed / 14) * (0.4 + Math.abs(Math.sin(r.heading)) * 0.8) : r.state === 'tube' ? 0.5 : 0;
      this.audio.ambience(ww, spray, r.state === 'tube' ? 1 : 0);
    }
    this.rider.pose(this.pose);
    const speed01 = Math.min(1, this.rider.speed / TUNING.rider.maxSpeed);
    const r = this.rider;
    const lean = Math.max(-1, Math.min(1, r.heading / 0.9)) * (r.state === 'face' ? 1 : 0);
    this.riderView.update(this.pose, r.state, dt, {
      speed01,
      lean,
      carve: input.carve,
      grab: input.grab,
      slide: input.slide,
      trickId: this.tricks.activeTrick?.id ?? this.tricks.pendingAirTricks[this.tricks.pendingAirTricks.length - 1]?.id ?? null,
      tubeDepth: r.tube.depth,
      airTime: r.airTime,
    });
    this.updateSpray(dt, lean, speed01);
    this.spray.update(dt);
    this.cam.update(this.pose, this.wave.params.direction, this.rider.state, speed01, dt);
    this.updateHudState();
    this.hud.update(this.hudState, dt);
  }

  private updateSpray(dt: number, lean: number, speed01: number): void {
    const r = this.rider;
    const p = this.pose;
    const dir = this.wave.params.direction;
    // rail spray off the tail when carving hard or moving fast
    if ((r.state === 'face' || r.state === 'floater') && r.speed > 4.5) {
      const n = Math.floor(speed01 * 2 + Math.abs(lean) * speed01 * 7 + (this.riderView.model.poseName.startsWith('carve') ? 3 : 0));
      const tx = p.pos.x - p.forward.x * 0.9;
      const ty = p.pos.y - p.forward.y * 0.9 + 0.05;
      const tz = p.pos.z - p.forward.z * 0.9;
      const side = -Math.sign(lean || 1) * dir;
      for (let i = 0; i < n; i++) {
        this.spray.emit(tx, ty, tz, -p.forward.x * 2 + p.right.x * side * 3.5 * Math.abs(lean), 2 + 3.5 * Math.abs(lean), -p.forward.z * 2 + p.right.z * side * 3.5 * Math.abs(lean), 0.5 + Math.random() * 0.9, 0.45 + Math.random() * 0.3);
      }
    }
    // lip mist blown back along the crest near the curl
    for (let i = 0; i < 2; i++) {
      const u = this.wave.curlU - 2 + Math.random() * 12;
      this.wave.position(u, 1, this.sprayTmp);
      this.spray.emit(this.sprayTmp.x, this.sprayTmp.y + 0.3, this.sprayTmp.z, dir * 1.5, 1.2, -2.5, 1.6 + Math.random() * 2.2, 1.0 + Math.random() * 0.6, 2);
    }
    void dt;
  }

  private burst(x: number, y: number, z: number, count: number, vx: number, vy: number, vz: number, size: number, life: number): void {
    for (let i = 0; i < count; i++) this.spray.emit(x, y, z, vx, vy, vz, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), 2.5);
  }

  private updateHudState(): void {
    const s = this.hudState;
    const r = this.rider;
    s.score = this.run.score;
    s.clock = this.run.ended || this.run.clock === undefined ? this.run.clock : this.run.clock;
    if (this.run['untimed' as keyof RunController]) s.clock = null;
    s.meter = this.run.meter.value;
    s.meterState = this.run.meter.state;
    s.specialTime = this.run.meter.isYellow ? this.run.meter.yellowSeconds : 0;
    s.chainOpen = this.run.chain.open;
    s.chainLabel = this.run.chain.label();
    s.chainBase = this.run.chain.base;
    s.chainMultiplier = this.run.chain.multiplier;
    s.waveHeightFt = this.waveFt;
    if (this.goals && this.level) s.objective = [`${this.level.name.toUpperCase()}`, ...this.goals.hudLines()];
    s.sectionsAhead = this.wave.sections.map((sec) => sec.u - r.u).sort((a, b) => a - b).slice(0, 4);
    s.warning = this.wave.warnings().some((w) => w.u > r.u && w.u - r.u < 45);
    s.balance = r.state === 'tube' ? r.tube.balance : null;
    s.tubeDepth = r.tube.depth;
    s.tubeState = r.state;
    s.hint = this.inputManager.gamepadName
      ? `pad: ${this.inputManager.gamepadName.slice(0, 40)}`
      : r.state === 'prone'
        ? 'L / Y: stand up · ←→: paddle along the wave'
        : 'arrows: turn · ↑ pump · ↓ stall (↓↓ super stall) · Space jump (hold, release at lip) · J carve · K grab · L slide/floater · Q/E spin · Enter cash in · Shift camera';
    s.debug = this.debug
      ? `state ${r.state}  speed ${r.speed.toFixed(1)}  v ${r.v.toFixed(2)}  ahead ${r.aheadOfCurl.toFixed(1)}  heading ${r.headingDeg.toFixed(0)}°  load ${(r.jumpLoad * 100).toFixed(0)}%\n` +
        `sections ${this.wave.sections.length}  yellow ${this.run.meter.totalYellowSeconds.toFixed(1)}s  best ${this.run.bestChain}\n` +
        this.eventLog.slice(-6).join('\n')
      : '';
  }

  render(): void {
    if (!this.headless && !this.attract && !this.externalInput) this.lastFrameInput = cloneInput(this.inputManager.poll());
    this.uniforms.uTime.value = this.time;
    this.waveMesh.update(this.wave);
    this.uniforms.uAmpMask0.value = (this.waveMesh.zMin + this.waveMesh.zMax) / 2;
    this.uniforms.uAmpMask1.value = (this.waveMesh.zMax - this.waveMesh.zMin) / 2 - 8;
    this.env.update(this.cam.camera.position, this.riderView.group.position);
    this.renderer.render(this.scene, this.cam.camera);
  }

  cameras(): THREE.PerspectiveCamera[] {
    return [this.cam.camera];
  }

  dispose(): void {
    this.waveMesh.dispose();
    this.spray.dispose();
    this.env.dispose();
    this.inputManager.detach(window);
    this.hud.dispose();
  }

  debugState(): Record<string, unknown> {
    return { t: this.time, curlU: this.wave.curlU, rider: this.rider.snapshot(), run: this.run.snapshot(), sections: this.wave.sections.length, events: this.eventLog };
  }
}
