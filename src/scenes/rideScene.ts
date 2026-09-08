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
import { KEYMAP_DUAL } from '@/input/keymaps';
import { TrickSystem, type TrickEvents } from '@/tricks/executor';
import { TrickRecognizer } from '@/tricks/recognizer';
import { RunController } from '@/scoring/run';
import { Hud, type HudState } from '@/ui/hud';
import type { AudioManager } from '@/audio/audio';
import { GoalTracker, type GoalEvents, type Level } from '@/goals/goals';
import { getLevel } from '@/goals/levels';
import { IconStack } from '@/goals/icons';
import { PhotoDirector } from '@/goals/photo';
import { Contest } from '@/goals/contest';
import { ObjectField, type ObjectEvents, type ObjectKind } from '@/world/objects';
import { ObjectViews } from '@/render/objectViews';
import type { Trick } from '@/tricks/catalogue';
import { getRider, getBoard, effectiveStats, listRiders, listBoards } from '@/world/roster';
import { TRICKS } from '@/tricks/catalogue';
const TRICKS_ALL = TRICKS.all;
import { Landmarks } from '@/render/landmarks';
import { HighlightTracker, InputRecorder, type Recording, type ReplayPlayer } from '@/core/replay';
import { ReplayDirector } from '@/render/replayDirector';

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
  icons: IconStack | null = null;
  photo: PhotoDirector | null = null;
  contest: Contest | null = null;
  objects!: ObjectField;
  readonly objectEvents = new EventBus<ObjectEvents>();
  private objectViews = new ObjectViews();
  private landmarks!: Landmarks;
  private lastTrickLanded: Trick | null = null;
  private lastTrickTime = -10;
  private lastLandTime = -10;
  private objTmp = new THREE.Vector3();
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
  /** Called once when the run ends (after a short sim-time beat so the final bank is readable). */
  onEnd: (() => void) | null = null;
  private endCountdown: number | null = null;
  private externalInput: Readonly<RiderInput> | null = null;
  private attractTimer = 0;
  /** Viewport in normalised screen coords (x, y, w, h); null = full canvas. */
  viewport: { x: number; y: number; w: number; h: number } | null = null;
  /** Player label for multiplayer HUDs. */
  playerLabel = '';
  /** Controls hint override (multiplayer: each player sees their own keys or pad). */
  controlsHint: string | null = null;
  /** Set before init to play back a recording instead of taking live input. */
  replay: ReplayPlayer | null = null;
  replayPoints = 0;
  private recorder = new InputRecorder();
  private highlight = new HighlightTracker();
  private frame = 0;
  private director: ReplayDirector | null = null;
  private recognizer: TrickRecognizer | null = null;
  private wasSliding = false;
  private lastZoneCallU: number | null = null;
  private lastSetCalled = -1;
  private paramsString = '';
  private seed = 1;
  private replayChrome: HTMLElement[] = [];
  /** Receives scrapbook photos (photo-goal shutters, replay snapshots). */
  onPhoto: ((p: { data: string; value: number; caption: string }) => void) | null = null;
  private photoRequest: { value: number; caption: string } | null = null;
  private thumb: HTMLCanvasElement | null = null;
  private prevSnap = false;
  private onHeadlessInput: ((e: Event) => void) | null = null;

  /** Hide/show this ride's HUD (the game shell hides a finished ride's HUD behind a replay). */
  setHudVisible(visible: boolean): void {
    this.hud.root.style.display = visible && !this.attract ? '' : 'none';
  }

  /** Sim frames stepped so far. */
  get frameIndex(): number {
    return this.frame;
  }

  /** Replay slow-motion factor (1 outside replays). */
  get replaySpeed(): number {
    return this.director?.speed ?? 1;
  }

  /** Everything needed to re-simulate this ride. */
  recording(): Recording {
    return { hz: TUNING.sim.hz, seed: this.seed, params: this.paramsString, keys: this.recorder.keys, frames: this.recorder.frames, highlight: this.highlight.best };
  }

  init(ctx: SceneContext): void {
    this.renderer = ctx.renderer;
    this.headless = ctx.headless;
    this.paramsString = ctx.params.toString();
    this.seed = ctx.seed;
    if (this.replay) this.director = new ReplayDirector(ctx.seed + 23);
    const levelId = ctx.params.get('level');
    this.level = levelId ? getLevel(levelId) : null;
    if (ctx.params.get('iconChallenge') === '1') {
      const beachId = ctx.params.get('beach') ?? 'sandbar';
      this.level = {
        id: `icons-${beachId}`,
        beach: beachId,
        name: 'Icon Challenge',
        order: 999,
        waveFt: Number(ctx.params.get('ft') ?? 8),
        seconds: Number(ctx.params.get('seconds') ?? 180),
        goals: [{ id: 'icons', type: 'icons', count: 30, score: 0, hints: true, required: true }],
        unlocks: [],
        lesson: false,
      };
    }
    const beach = getBeach(this.level?.beach ?? ctx.params.get('beach') ?? 'sandbar');
    this.waveFt = this.level ? this.level.waveFt : Number(ctx.params.get('ft') ?? 8);
    this.auto = ctx.params.get('auto') === '1';
    this.assistBalance = ctx.params.get('assist') === 'balance';
    this.debug = ctx.params.get('debug') === '1';
    // sets and lulls on the ocean breaks; lessons keep a steady wave to learn on
    const params = waveParamsFromBeach(beach, waveFeetToMetres(this.waveFt), { warnSeconds: TUNING.wave.sectionWarnSeconds, swell: !this.level?.lesson });
    this.wave = new WaveModel(params, new Rng(ctx.seed), 0);
    const riderDef = getRider(ctx.params.get('rider') ?? listRiders()[0]!.id);
    const boardDef = getBoard(ctx.params.get('board') ?? listBoards()[0]!.id);
    const boostsRaw = ctx.params.get('boosts');
    const boosts = boostsRaw ? (JSON.parse(boostsRaw) as { spin: number; speed: number; air: number; balance: number }) : { spin: 0, speed: 0, air: 0, balance: 0 };
    const stats = effectiveStats(riderDef, boardDef, boosts, TUNING.stats);
    const handicap = Number(ctx.params.get('handicap') ?? 1) || 1;
    for (const k of ['spin', 'speed', 'air', 'balance'] as const) stats[k] = Math.max(0.05, Math.min(1, stats[k] * handicap));
    this.rider = new RiderSim(this.wave, TUNING, stats, this.events, undefined, new Rng(ctx.seed + 7));
    this.tricks = new TrickSystem(this.rider, TUNING, this.trickEvents, this.events);
    // specials: the rider's own set plus any learned through career rewards; everything else is open
    const learned = (ctx.params.get('learned') ?? '').split(',').filter(Boolean);
    const specialsAllowed = new Set([...riderDef.specials, ...learned]);
    this.tricks.unlocked = ctx.params.get('alltricks') === '1' ? null : new Set(TRICKS_ALL.filter((t) => !t.special || specialsAllowed.has(t.id)).map((t) => t.id));
    const contestGoal = this.level?.goals.find((g) => g.type === 'contest');
    if (contestGoal && contestGoal.type === 'contest') {
      this.contest = new Contest(
        { heats: TUNING.clock.heatCount, heatSeconds: TUNING.clock.heatSeconds, opponentTop: contestGoal.opponentTop, opponents: 3, names: ['Mako', 'Reef', 'Juno'] },
        new Rng(ctx.seed + 13),
      );
    }
    this.run = new RunController(TUNING, this.rider, this.events, this.tricks, this.trickEvents, {
      untimed: !this.level && ctx.params.get('free') === '1',
      seconds: this.contest ? this.contest.heatSeconds : this.level ? this.level.seconds : ctx.params.has('seconds') ? Number(ctx.params.get('seconds')) : undefined,
    });
    const knownKinds: ObjectKind[] = ['windsurfer', 'tuber', 'kayak', 'jetski', 'sponger', 'turtle', 'rafter', 'pier', 'ice'];
    const hazardKinds = beach.hazards.filter((h): h is ObjectKind => (knownKinds as string[]).includes(h));
    this.objects = new ObjectField(this.attract || ctx.params.get('objects') === '0' ? [] : hazardKinds, new Rng(ctx.seed + 17), this.objectEvents, this.level ? 20 : 28);
    if (this.level) {
      const iconsGoal = this.level.goals.find((g) => g.type === 'icons');
      if (iconsGoal && iconsGoal.type === 'icons') {
        this.icons = new IconStack(
          { stackSize: TUNING.icons.stackSize, dropIntervalSeconds: TUNING.icons.dropIntervalSeconds * (iconsGoal.count > 15 ? 0.8 : 1), weights: { air: 1, face: 1, tube: beach.tube ? 0.6 : 0, special: 0.35 }, total: 0 },
          new Rng(ctx.seed + 11),
        );
      }
      const photoGoal = this.level.goals.find((g) => g.type === 'photo');
      if (photoGoal && photoGoal.type === 'photo') {
        this.photo = new PhotoDirector({ shots: photoGoal.shots, beeps: TUNING.photo.beeps, beepIntervalSeconds: TUNING.photo.beepIntervalSeconds, runSeconds: this.level.seconds });
      }
      const goalCtx = {
        run: this.run,
        riderEvents: this.events,
        trickEvents: this.trickEvents,
        runEvents: this.run.events,
        wave: this.wave,
        riderU: () => this.rider.u,
        riderState: () => this.rider.state,
        extra: {
          riderSpeed: () => this.rider.speed,
          iconsCleared: () => this.icons?.cleared ?? 0,
          iconsFailed: () => this.icons?.failed ?? false,
          photoTotal: () => this.photo?.total ?? 0,
          photoBest: () => this.photo?.best ?? 0,
          photoSpecialBest: () => this.photo?.bestSpecial ?? 0,
          contestPlace: () => (this.contest && this.contest.finished ? this.contest.place() : null),
          objectHits: (o: string, a: string) => this.objects.count(o, a),
        },
      };
      this.goals = new GoalTracker(this.level, goalCtx, this.goalEvents);
    }

    // a level can set its own time of day over the beach's default sky
    const L = this.level;
    const lit = L?.sky || L?.sunElevationDeg !== undefined || L?.sunAzimuthDeg !== undefined
      ? { ...beach, look: { ...beach.look, sky: L?.sky ?? beach.look.sky, sunElevationDeg: L?.sunElevationDeg ?? beach.look.sunElevationDeg, sunAzimuthDeg: L?.sunAzimuthDeg ?? beach.look.sunAzimuthDeg } }
      : beach;
    this.uniforms = createWaterUniforms(lit);
    this.env = new Environment(lit, this.uniforms);
    this.scene.add(this.env.group);
    this.waveMesh = new WaveMesh(this.uniforms);
    this.scene.add(this.waveMesh.mesh);
    this.riderView = new RiderView(boardDef.length, {
      suit: parseInt(riderDef.look.suit.slice(1), 16),
      accent: parseInt(riderDef.look.accent.slice(1), 16),
      skin: parseInt(riderDef.look.skin.slice(1), 16),
      hair: parseInt(riderDef.look.hair.slice(1), 16),
      board: parseInt(boardDef.colour.slice(1), 16),
      boardAccent: parseInt(riderDef.look.boardAccent.slice(1), 16),
    });
    this.scene.add(this.riderView.group);
    this.landmarks = new Landmarks(beach);
    this.scene.add(this.landmarks.group);
    this.spray = new SpraySystem();
    this.scene.add(this.spray.points);
    this.scene.add(this.objectViews.group);
    // dual-stick is the default scheme (docs/MECHANICS.md); classic stays available
    this.rider.controls = ctx.params.get('controls') === 'classic' ? 'classic' : 'dual';
    this.rider.assists = ctx.params.get('assists') !== '0';
    // face turns come from the physics rather than button combos, so this only exists for the dual scheme
    if (this.rider.controls === 'dual') this.recognizer = new TrickRecognizer(TUNING, this.trickEvents);
    if (this.rider.controls === 'dual') this.inputManager.setKeymap(KEYMAP_DUAL);
    this.cam = new ChaseCamera(TUNING);
    const camParam = ctx.params.get('cam');
    if (camParam === 'wide' || camParam === 'close' || camParam === 'shore' || camParam === 'first' || camParam === 'portrait') this.cam.mode = camParam;
    this.rider.pose(this.pose);
    this.cam.snapTo(this.pose, this.wave.params.direction);
    if (!ctx.headless && !this.attract && !ctx.params.has('hosted')) this.inputManager.attach(window);
    const applyHeadless = (d: Partial<RiderInput> | { script: { t: number; input: Partial<RiderInput> }[] } | null | undefined) => {
      if (d && 'script' in d && Array.isArray(d.script)) {
        this.inputScript = d.script.slice().sort((a, b) => a.t - b.t);
        this.headlessInput = cloneInput(NEUTRAL_INPUT);
      } else this.headlessInput = d ? { ...cloneInput(NEUTRAL_INPUT), ...(d as Partial<RiderInput>) } : null;
    };
    this.onHeadlessInput = (e: Event) => applyHeadless((e as CustomEvent).detail);
    window.addEventListener('lineup:input', this.onHeadlessInput);
    // a script sent before this ride existed (the game shell starts rides behind a wipe)
    if (ctx.headless) applyHeadless((window as unknown as { __lineupInput?: Partial<RiderInput> | { script: { t: number; input: Partial<RiderInput> }[] } | null }).__lineupInput);

    this.attract = this.attract || ctx.params.get('attract') === '1';
    this.hud = new Hud(ctx.uiRoot);
    if (this.attract) this.hud.root.style.display = 'none';
    if (this.level?.intro && !this.replay && !this.attract) this.hud.flash(this.level.intro, 'info', 6);
    if (this.replay) {
      // TV replay: letterbox bars and a recording badge; the HUD sits inside the bars
      this.hud.root.style.top = '9%';
      this.hud.root.style.bottom = '8%';
      for (const side of ['top', 'bottom'] as const) {
        const bar = document.createElement('div');
        bar.style.cssText = `position:absolute;left:0;right:0;${side}:0;height:7%;background:#000;pointer-events:none;z-index:5`;
        ctx.uiRoot.appendChild(bar);
        this.replayChrome.push(bar);
      }
      const badge = document.createElement('div');
      badge.style.cssText =
        'position:absolute;left:50%;top:8.5%;transform:translateX(-50%);font:900 15px/1 "Trebuchet MS",sans-serif;letter-spacing:5px;color:#fff;text-shadow:0 2px 4px rgba(0,0,0,.7);pointer-events:none;z-index:5';
      badge.innerHTML = '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ff3b3b;margin-right:10px;vertical-align:1px"></span>REPLAY';
      ctx.uiRoot.appendChild(badge);
      this.replayChrome.push(badge);
    }
    if (ctx.params.get('hudScale')) this.hud.root.style.zoom = ctx.params.get('hudScale')!;
    this.playerLabel = ctx.params.get('player') ?? '';
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
      objective: this.level ? [`${beach.name.toUpperCase()} · ${this.level.name.toUpperCase()}`, ...this.goals!.hudLines()] : [this.playerLabel || 'FREE SURF', `${beach.name} · ${this.waveFt} ft ${beach.breakDirection}`],
      waveHeightFt: this.waveFt,
      swell: null,
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
      icons: null,
      iconHint: '',
      photo: null,
      stance: null,
      zones: null,
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
      this.highlight.bank(this.frame, b.total, Math.round(TUNING.replay.leadSeconds * TUNING.sim.hz), Math.round(TUNING.replay.tailSeconds * TUNING.sim.hz));
      this.hud.showBank(b.total, b.cashedIn);
      this.log(`bank ${b.total} x${b.multiplier} ${b.cashedIn ? 'cash' : 'auto'} [${b.entries.map((x) => x.id).join('+')}]`);
      if (!this.headless && b.cashedIn) this.inputManager.rumble(0.6, 0.3, 180);
    });
    this.run.events.on('chainLost', (b) => this.log(`chainLost ${b.total}`));
    this.trickEvents.on('trickLand', (e) => {
      this.lastTrickLanded = e.trick;
      this.lastTrickTime = this.time;
      if (this.icons && this.icons.onTrick(e.trick, this.run.meter.isYellow)) {
        this.hud.flash('ICON', 'perfect', 0.6);
        this.audio?.uiSelect();
        if (this.icons.takeChainBonus(TUNING.scoring.iconChainCount)) {
          this.run.addBonus(TUNING.scoring.iconChainBonus);
          this.hud.showBank(TUNING.scoring.iconChainBonus, false);
          this.hud.flash('ICON CHAIN BONUS', 'info', 1.5);
        }
      }
    });
    this.events.on('land', () => (this.lastLandTime = this.time));
    this.objectEvents.on('objectHit', (e) => {
      const verb = { spray: 'Sprayed', splash: 'Splashed', smash: 'Smashed', jump: 'Jumped' }[e.action];
      const base = TUNING.scoring.base.envSecret;
      const trick: Trick = {
        id: `env-${e.object.kind}-${e.action}`,
        name: `${verb} ${e.object.kind}`,
        section: 'face',
        input: { kind: 'dir', button: 'carve', direction: 'up' },
        base: e.action === 'jump' || e.action === 'smash' ? base[1] : base[0],
        meter: 0.1,
        duration: 0,
        special: false,
      };
      this.trickEvents.emit('trickLand', { trick, section: 'face', aheadOfCurl: this.rider.aheadOfCurl, rotation: 0, atLip: false });
      this.hud.flash(`${verb.toUpperCase()} ${e.object.kind.toUpperCase()}!`, 'info', 1.0);
      this.audio?.land();
      this.log(`objectHit ${e.object.kind} ${e.action}`);
    });
    this.objectEvents.on('objectCollision', (e) => {
      this.log(`objectCollision ${e.object.kind}`);
      this.rider.wipeout('hazard');
    });
    if (this.contest) {
      this.run.events.on('chainBanked', (b) => this.contest!.addToWave(b.total));
      this.events.on('wipeout', () => this.contest!.endWave());
      this.events.on('stand', () => this.contest!.endWave());
    }
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
      if (this.contest && e.reason === 'time') {
        const heat = this.contest.endHeat();
        this.log(`heatEnd ${this.contest.heat} score=${heat.score} place=${this.contest.place()}`);
        if (!this.contest.finished) {
          this.hud.flash(`HEAT ${this.contest.heat} DONE · ${heat.score.toLocaleString('en-US')} · HEAT ${this.contest.heat + 1} OF ${this.contest.totalHeats}`, 'info', 3);
          this.run.resetHeat(this.contest.heatSeconds);
          this.rider.respawn();
          this.audio?.meterFull();
          return;
        }
        this.hud.flash(`CONTEST OVER · ${['1ST', '2ND', '3RD', '4TH'][this.contest.place() - 1]}`, 'info', 6);
      } else this.hud.flash(`TIME · ${e.score.toLocaleString('en-US')}`, 'info', 6);
      this.log(`runEnd ${e.score}`);
      this.audio?.bank(e.score);
      this.endCountdown = 1.8;
    });
    // sounds
    const a = () => this.audio;
    this.events.on('launch', (e) => {
      a()?.launch();
      // the pop is a body movement the player made; give it a thump the button jump never had
      if (this.rider.dual) a()?.pop(e.power);
    });
    this.events.on('land', (e) => {
      a()?.land();
      if (e.rating === 'perfect') a()?.perfect();
      else if (e.rating === 'sloppy') a()?.sloppy();
      // the face reads the landing before the score does
      this.riderView.react(e.rating === 'perfect' ? 'delight' : e.rating === 'sloppy' ? 'strain' : 'delight', e.rating === 'perfect' ? 1.6 : 0.9);
    });
    this.events.on('wipeout', (e) => {
      if (e.reason !== 'exit') a()?.wipeout();
      if (e.reason !== 'exit') this.riderView.react('shock', 2.5);
    });
    this.events.on('tubeEnter', () => a()?.tubeEnter());
    this.events.on('tubeExit', (e) => {
      if (e.spit) a()?.spit();
    });
    this.trickEvents.on('trickLand', (e) => {
      const worth = TUNING.recognizer.worth[e.trick.id];
      // a recognised turn (docs/MECHANICS.md §3) has a worth; catalogue tricks keep their old cues
      if (this.rider.dual && e.section === 'face' && worth !== undefined) a()?.turnNamed(worth);
      else if (e.trick.special) a()?.special();
      else a()?.trick();
      // a big named turn gets a grin and a puff of spray over the tail as the rail releases
      if (worth !== undefined && worth >= 1.3) {
        this.riderView.react('delight', 1.1);
        const p = this.pose;
        this.burst(p.pos.x - p.forward.x * 0.9, p.pos.y + 0.1, p.pos.z - p.forward.z * 0.9, 18, -p.forward.x * 2, 3.5, -p.forward.z * 2, 0.9, 0.7);
      }
    });
    this.events.on('wipeout', (e) => {
      if (e.reason === 'slide') a()?.slide(1);
    });
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
    let bank: boolean;
    if (this.replay) {
      // replays re-simulate the recorded inputs; auto/assist were already baked into them
      const k = this.replay.inputAt(this.frame);
      const live = input;
      input = k.input;
      bank = k.cashIn;
      // grab during a replay takes a snapshot for the scrapbook
      if (live.grab && !this.prevSnap) {
        this.photoRequest = { value: 0, caption: 'Replay snapshot' };
        this.hud.flash('SNAP · saved to the scrapbook', 'info', 1.2);
        this.audio?.shutter();
      }
      this.prevSnap = live.grab;
    } else {
      if (this.auto && this.rider.state === 'prone' && this.rider.stateTime > 0.8) input = { ...input, stand: true };
      if (this.assistBalance && this.rider.state === 'tube') {
        const b = this.rider.tube.balance;
        const frame = Math.floor(this.time * 60);
        input = { ...input, stickX: Math.abs(b) > 0.08 && frame % 6 < 3 ? Math.sign(b) : 0 };
      }
      bank = (input.cashIn && !this.prevCashIn) || this.cashInEdge;
      this.prevCashIn = input.cashIn;
      this.recorder.record(input, bank);
    }
    this.cashInEdge = false;
    if (this.director) {
      this.director.update(dt, this.rider.state, this.rider.airTime);
      if (this.director.cut) this.cam.cut(this.director.mode);
    } else {
      // third person → first person → wide → back
      if (input.cameraToggle && !this.prevCameraToggle) {
        this.cam.mode = this.cam.mode === 'chase' ? 'first' : this.cam.mode === 'first' ? 'wide' : 'chase';
      }
      this.prevCameraToggle = input.cameraToggle;
    }
    if (!this.run.ended) {
      this.wave.step(dt, this.rider.state === 'wipeout' ? null : this.rider.u);
      this.rider.step(dt, input);
      this.tricks.step(dt, input);
      // with the sticks driving the body, face turns are recognised from the physics rather than combos
      this.recognizer?.step(dt, this.rider);
    }
    this.run.step(dt, bank);
    this.highlight.step(this.frame, this.run.chain.open);
    this.frame++;
    if (this.endCountdown !== null) {
      this.endCountdown -= dt;
      if (this.endCountdown <= 0) {
        this.endCountdown = null;
        this.onEnd?.();
      }
    }
    if (!this.run.ended) {
      const r = this.rider;
      this.icons?.step(dt, this.run.meter.isYellow);
      if (this.photo) {
        const cue = this.photo.step(dt, this.run.time, () => ({
          trick: this.tricks.activeTrick ?? this.tricks.pendingAirTricks[this.tricks.pendingAirTricks.length - 1] ?? (this.time - this.lastTrickTime < 0.6 ? this.lastTrickLanded : null),
          multiplier: this.run.chain.multiplier,
          inTube: r.state === 'tube',
          tubeDepth: r.tube.depth,
          inAir: r.state === 'air',
          landedRecently: this.time - this.lastLandTime < 0.5,
          wipedOut: r.state === 'wipeout',
        }));
        if (cue === 'beep') this.audio?.countdownBeep(this.photo.beep >= TUNING.photo.beeps - 1);
        else if (cue === 'shutter') {
          this.audio?.shutter();
          this.log(`photo ${this.photo.lastValue}`);
          const shot = this.photo.shots[this.photo.shots.length - 1];
          this.photoRequest = { value: this.photo.lastValue, caption: shot?.trick || 'Photo' };
        }
      }
      const carving = (input.carve || Math.abs(r.heading) > 0.5) && r.state === 'face';
      this.objects.step(dt, r.u, r.v, r.state === 'air', carving, this.time - this.lastLandTime < 0.15, this.wave.curlU, r.speed);
      const near = this.objects.nearestAhead(r.u, 30);
      if (input.objectCam && near) {
        this.wave.position(near.u, near.v, this.sprayTmp);
        this.cam.objectTarget = this.objTmp.set(this.sprayTmp.x, this.sprayTmp.y + 0.8, this.sprayTmp.z);
      } else this.cam.objectTarget = null;
      this.hudState.hazard = !!near && near.u - r.u > 0;
    }
    if (this.goals && !this.run.ended) this.goals.update(dt);
    this.warnHook?.();
    if (this.audio && !this.attract) {
      const r = this.rider;
      const nearCurl = Math.max(0, 1 - Math.max(0, r.aheadOfCurl) / 12);
      const ww = r.state === 'wipeout' ? 1 : r.state === 'floater' ? 0.8 : 0.35 + nearCurl * 0.5;
      const spray = r.state === 'face' ? Math.min(1, r.speed / 14) * (0.4 + Math.abs(Math.sin(r.heading)) * 0.8) : r.state === 'tube' ? 0.5 : 0;
      // rail bite: how much rail is buried, louder when the rider is also pressing down into it
      const onFace = r.state === 'face' || r.state === 'tube';
      const bite = onFace && r.dual ? Math.abs(r.stance.rail) * (0.55 + 0.45 * Math.max(0, r.stance.compression)) : 0;
      this.audio.ambience(ww, spray, r.state === 'tube' ? 1 : 0, bite, Math.min(1, r.speed / TUNING.rider.maxSpeed));
      // the tail breaking loose scrubs once as it starts, not every frame it is out
      const sliding = r.slideSeconds > 0.05;
      if (sliding && !this.wasSliding) this.audio.slide(0.6);
      this.wasSliding = sliding;
      // zone callout once as the next section comes into range (30 m: about three seconds at pool speed)
      const next = this.hudState.zones?.next ?? null;
      if (next && next.metres < 30 && next.metres > 2 && (next.name === 'barrel' || next.name === 'ramp')) {
        const startU = r.u + next.metres;
        if (this.lastZoneCallU === null || Math.abs(startU - this.lastZoneCallU) > 5) {
          this.audio.zone(next.name);
          this.lastZoneCallU = startU;
        }
      }
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
      compression: r.stance.compression,
      trim: r.stance.trim,
      rail: r.stance.rail,
      twist: r.stance.twist,
      pumpWork: r.stance.pumpWork,
      boardYaw: r.boardYaw,
    });
    this.updateSpray(dt, lean, speed01);
    this.spray.update(dt);
    this.cam.stance.rail = r.stance.rail;
    this.cam.stance.compression = r.stance.compression;
    this.riderView.setFirstPerson(this.cam.firstPerson);
    this.cam.update(this.pose, this.wave.params.direction, this.rider.state, speed01, dt);
    this.updateHudState();
    this.hud.update(this.hudState, dt);
  }

  private updateSpray(dt: number, lean: number, speed01: number): void {
    const r = this.rider;
    const p = this.pose;
    const dir = this.wave.params.direction;
    // Rail spray off the tail. How much rail is buried is the thing the player is controlling, so the
    // spray is driven by that rather than by the heading alone — a committed carve should throw a sheet.
    if ((r.state === 'face' || r.state === 'floater') && r.speed > 4.5) {
      const rail = r.dual ? r.stance.rail : lean;
      const bite = Math.min(1, Math.abs(rail) * (0.55 + 0.45 * Math.max(0, r.stance.compression)));
      const slip = Math.min(1, Math.abs(r.boardYaw) * 1.6);
      const n = Math.floor(speed01 * 2 + bite * speed01 * 11 + slip * speed01 * 6);
      const tx = p.pos.x - p.forward.x * 0.9;
      const ty = p.pos.y - p.forward.y * 0.9 + 0.05;
      const tz = p.pos.z - p.forward.z * 0.9;
      const side = -Math.sign(rail || lean || 1) * dir;
      const throwOut = 3.5 * bite + 2.2 * slip;
      for (let i = 0; i < n; i++) {
        this.spray.emit(
          tx,
          ty,
          tz,
          -p.forward.x * 2 + p.right.x * side * throwOut,
          2 + 3.5 * bite + 1.5 * slip,
          -p.forward.z * 2 + p.right.z * side * throwOut,
          0.5 + Math.random() * (0.9 + bite),
          0.45 + Math.random() * 0.3,
        );
      }
      // the tail thrown out high on the face fans a sheet of spray over the lip: the snap's signature
      if (slip > 0.35 && r.v > 0.55) {
        const fan = Math.floor((slip - 0.35) * speed01 * 14);
        const out = -Math.sign(r.boardYaw || 1) * dir;
        for (let i = 0; i < fan; i++) {
          const k = Math.random();
          this.spray.emit(
            tx,
            ty + 0.1,
            tz,
            -p.forward.x * 1.5 + p.right.x * out * (2 + k * 4),
            3.5 + k * 3,
            -p.forward.z * 1.5 + p.right.z * out * (2 + k * 4),
            0.8 + Math.random() * 1.4,
            0.6 + Math.random() * 0.4,
          );
        }
      }
      // the inside hand dragging: a small wake off the fingers wherever the hand is in the water
      const hand = this.riderView.hand;
      if (this.riderView.handReach > 0.3 && hand.height < 0.12) {
        const wet = Math.min(1, (0.12 - hand.height) / 0.2);
        const m = Math.floor(1 + wet * speed01 * 5);
        for (let i = 0; i < m; i++) {
          this.spray.emit(hand.world.x, hand.world.y + 0.03, hand.world.z, -p.forward.x * (1.5 + speed01 * 2), 1.2 + wet, -p.forward.z * (1.5 + speed01 * 2), 0.35 + Math.random() * 0.4, 0.3 + Math.random() * 0.25, 0.5);
        }
      }
    }
    // The lip: where the wave is throwing, a sheet of spray comes off the crest ahead of the curl —
    // thrown forward with the lip and blown back up over the crest by the wind it makes — and a
    // finer mist hangs along the crest behind it. Hollow water throws harder than a crumbling one.
    const throwLen = this.wave.params.throwLength;
    // inside the barrel the lip is right in front of the lens, so the sheet is thinned and shrunk there
    const inTube = r.state === 'tube';
    for (let i = 0; i < (inTube ? 3 : 6); i++) {
      const k = Math.random();
      const u = this.wave.curlU - 1 + k * throwLen * 0.9;
      const hollow = this.wave.fields(u).hollow;
      if (hollow < 0.2 && Math.random() > 0.35) continue;
      this.wave.position(u, 1, this.sprayTmp);
      const sheet = hollow * hollow;
      // the sheet: forward (−z, with the lip) and up, big, short-lived
      this.spray.emit(
        this.sprayTmp.x,
        this.sprayTmp.y + 0.2,
        this.sprayTmp.z - 0.3,
        dir * (1 + k * 2),
        1.5 + sheet * 3.5,
        -3 - sheet * 4,
        (0.9 + Math.random() * (1.4 + sheet * 1.6)) * (inTube ? 0.6 : 1),
        0.5 + Math.random() * 0.5,
        1.6,
      );
      // the blowback: a lighter mist lifted up and back over the crest
      if (Math.random() < 0.5 + sheet * 0.5) this.spray.emit(this.sprayTmp.x, this.sprayTmp.y + 0.5, this.sprayTmp.z + 0.4, dir * 1.5, 2.2 + sheet * 2, 1.5 + sheet * 1.5, 1.4 + Math.random() * 2.2, 1.0 + Math.random() * 0.8, 2.2);
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
    s.waveHeightFt = this.waveFt * this.wave.swellFactor;
    if (this.wave.params.swell) {
      const sw = this.wave.swellInfo();
      s.swell = { inSet: sw.inSet, nextSetIn: sw.nextSetIn };
      // one call per set, as it comes into range
      if (!sw.inSet && sw.nextSetIn < 8 && sw.setIndex !== this.lastSetCalled && !this.attract) {
        this.lastSetCalled = sw.setIndex;
        this.hud.flash('SET COMING', 'info', 2.5);
        this.audio?.warning();
      }
    } else s.swell = null;
    if (this.goals && this.level) {
      s.objective = [`${this.level.name.toUpperCase()}`, ...this.goals.hudLines()];
      if (this.contest) {
        s.objective.push('', `HEAT ${Math.min(this.contest.heat + 1, this.contest.totalHeats)} / ${this.contest.totalHeats} · best two waves`);
        for (const row of this.contest.standings()) s.objective.push(`${row.you ? '▶ ' : '   '}${row.name.padEnd(6)} ${row.total.toLocaleString('en-US')}`);
      }
    }
    s.icons = this.icons ? [...this.icons.stack] : null;
    const iconsGoal = this.level?.goals.find((g) => g.type === 'icons');
    const showHints = iconsGoal && iconsGoal.type === 'icons' ? iconsGoal.hints : true;
    const bottom = this.icons?.stack[0];
    s.iconHint = bottom && showHints ? { air: 'air: grab or flip in the air', face: 'face: e.g. double-tap carve', tube: 'tube: slide + direction in the barrel', special: 'special: needs the flashing meter' }[bottom] : '';
    s.photo = this.photo ? { phase: this.photo.phase, beep: this.photo.beep, beeps: TUNING.photo.beeps, value: this.photo.lastValue } : null;
    s.sectionsAhead = this.wave.sections.map((sec) => sec.u - r.u).sort((a, b) => a - b).slice(0, 4);
    if (this.wave.params.zones) {
      const bands = this.wave.zoneBands(r.u - 20, r.u + 60).map((b) => ({ name: b.name, from: b.u0 - r.u, to: b.u1 - r.u }));
      const ahead = bands.find((b) => b.name !== 'wall' && b.from > 1);
      s.zones = {
        bands,
        current: this.wave.zoneAt(r.u),
        next: ahead && ahead.name !== 'wall' ? { name: ahead.name, metres: ahead.from } : null,
      };
    } else s.zones = null;
    s.warning = this.wave.warnings().some((w) => w.u > r.u && w.u - r.u < 45);
    // stance readout: only useful for the scheme it describes, and only while actually surfing
    const feet = this.currentInput();
    s.stance =
      this.rider.dual && !this.attract && !this.replay
        ? { backX: feet.backX, backY: feet.backY, frontX: feet.frontX, frontY: feet.frontY, rail: r.stance.rail, compression: r.stance.compression, load: r.stance.load }
        : null;
    s.balance = r.state === 'tube' ? r.tube.balance : null;
    s.tubeDepth = r.tube.depth;
    s.tubeState = r.state;
    if (this.replay) {
      s.objective = ['REPLAY', `best chain · ${this.replayPoints.toLocaleString('en-US')}`];
      s.hint = 'A / Space: skip';
      s.debug = '';
      return;
    }
    const lessonHint = this.goals?.activeHint(this.rider.controls) ?? null;
    s.hint =
      lessonHint ??
      (this.controlsHint
        ? this.controlsHint
        : this.inputManager.gamepadName
          ? `pad: ${this.inputManager.gamepadName.slice(0, 40)}`
          : this.rider.dual
            ? r.state === 'prone'
              ? 'left stick = back foot, right stick = front foot · press both down then flick up to pop to your feet'
              : 'both sticks lean = carve · both down/up = crouch & pop · opposite = pivot · press the nose to drive, the tail to stall · K grab · Enter cash in · Shift camera'
            : r.state === 'prone'
              ? 'L / Y: stand up · ←→: paddle along the wave'
              : 'arrows: turn · ↑ pump · ↓ stall (↓↓ super stall) · Space jump (hold, release at lip) · J carve · K grab · L slide/floater · Q/E spin · Enter cash in · Shift camera');
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
    this.objectViews.update(this.objects, this.wave);
    // the pool's carriage runs ahead of the curl: the wave peels back from the foil
    this.landmarks.update(this.cam.camera.position.x, this.wave.params.direction * (this.wave.curlU + TUNING.wave.faceLengthAhead * 0.8));
    this.env.update(this.cam.camera.position, this.riderView.group.position);
    if (this.viewport) {
      const size = this.renderer.getSize(new THREE.Vector2());
      const px = Math.round(this.viewport.x * size.x);
      const py = Math.round(this.viewport.y * size.y);
      const pw = Math.max(1, Math.round(this.viewport.w * size.x));
      const ph = Math.max(1, Math.round(this.viewport.h * size.y));
      this.renderer.setViewport(px, py, pw, ph);
      this.renderer.setScissor(px, py, pw, ph);
      this.renderer.setScissorTest(true);
      const cam = this.cam.camera;
      if (Math.abs(cam.aspect - pw / ph) > 1e-3) {
        cam.aspect = pw / ph;
        cam.updateProjectionMatrix();
      }
      this.renderer.render(this.scene, cam);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, size.x, size.y);
    } else this.renderer.render(this.scene, this.cam.camera);
    if (this.photoRequest) this.capturePhoto();
  }

  /** Copy the freshly rendered frame into a 16:9 JPEG thumbnail for the scrapbook. */
  private capturePhoto(): void {
    const req = this.photoRequest!;
    this.photoRequest = null;
    if (!this.onPhoto) return;
    try {
      const src = this.renderer.domElement;
      if (!this.thumb) {
        this.thumb = document.createElement('canvas');
        this.thumb.width = 480;
        this.thumb.height = 270;
      }
      const c = this.thumb.getContext('2d');
      if (!c) return;
      const sw = src.width;
      const sh = src.height;
      let cw = sw;
      let ch = sh;
      if (sw / sh > 16 / 9) cw = sh * (16 / 9);
      else ch = sw / (16 / 9);
      c.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, this.thumb.width, this.thumb.height);
      this.onPhoto({ data: this.thumb.toDataURL('image/jpeg', 0.72), value: req.value, caption: req.caption });
    } catch {
      /* canvas read blocked */
    }
  }

  cameras(): THREE.PerspectiveCamera[] {
    return [this.cam.camera];
  }

  dispose(): void {
    this.waveMesh.dispose();
    this.spray.dispose();
    this.objectViews.dispose();
    this.landmarks.dispose();
    this.env.dispose();
    this.inputManager.detach(window);
    if (this.onHeadlessInput) window.removeEventListener('lineup:input', this.onHeadlessInput);
    this.hud.dispose();
    for (const el of this.replayChrome) el.remove();
    this.replayChrome = [];
  }

  debugState(): Record<string, unknown> {
    return { t: this.time, curlU: this.wave.curlU, rider: this.rider.snapshot(), run: this.run.snapshot(), sections: this.wave.sections.length, events: this.eventLog };
  }
}
