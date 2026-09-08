/**
 * RiderSim: the rider state machine and physics, entirely in wave space.
 *   u along the crest, v up the face (0 trough … 1 lip), speed (m/s), heading ψ (radians from +u toward +v).
 * Air is integrated in world space and re-projected onto the face on landing.
 */
import { clamp, damp, lerp, smoothstep, wrapAngle, angleDelta, type Vec3, v3, v3Set } from '@/core/math';
import type { EventBus } from '@/core/events';
import type { Tuning } from '@/core/tuning';
import { Rng } from '@/core/rng';
import { WaveModel, makeSurfaceSample, type SurfaceSample } from '@/wave/wave';
import { facePoint } from '@/wave/profile';
import { cloneInput, InputEdges, NEUTRAL_INPUT, type RiderInput } from './input';
import { judgeLanding, type LandingJudgement } from './landing';
import { StanceModel, stanceFromClassic, type StanceState } from './stance';

/** Which control scheme drives the rider (docs/MECHANICS.md). */
export type ControlScheme = 'classic' | 'dual';

export type RiderState = 'prone' | 'face' | 'air' | 'tube' | 'floater' | 'wipeout';

export interface RiderStats {
  spin: number;
  speed: number;
  air: number;
  balance: number;
}

export type WipeoutReason = 'curl' | 'bogged' | 'over-the-back' | 'bad-landing' | 'caught-prone' | 'tube-balance' | 'closeout' | 'timeout' | 'exit' | 'hazard' | 'slide';

export interface RiderEvents extends Record<string, unknown> {
  stand: { u: number; v: number };
  launch: { speed: number; heading: number; power: number; u: number; v: number };
  land: LandingJudgement & { u: number; v: number; airTime: number; speed: number };
  wipeout: { reason: WipeoutReason; u: number };
  respawn: { u: number };
  jumpLoad: { power: number };
  tubeEnter: { u: number; passive: boolean };
  tubeExit: { seconds: number; maxDepth: number; spit: boolean; u: number };
  floaterStart: { u: number };
  floaterEnd: { seconds: number; overSection: boolean; u: number };
}

export interface TubeState {
  /** u offset ahead of the curl (the foam ball is at 0). */
  offset: number;
  /** 0 = at the exit, 1 = deepest. */
  depth: number;
  /** Balance marker −1..1; |b| ≥ 1 is a fall. */
  balance: number;
  driftDir: 1 | -1;
  driftTimer: number;
  seconds: number;
  maxDepth: number;
}

export interface RiderPose {
  pos: Vec3;
  forward: Vec3;
  up: Vec3;
  right: Vec3;
  /** Board reversed (fakie). */
  fakie: boolean;
}

const TWO_PI = Math.PI * 2;

export class RiderSim {
  state: RiderState = 'prone';
  u: number;
  v: number;
  speed = 0;
  /** Velocity heading in the tangent plane, radians from +u toward +v. */
  heading = 0;
  /** Extra board yaw relative to heading (slides); 0 for now. */
  boardYaw = 0;
  fakie = false;
  jumpLoad = 0;
  stateTime = 0;
  totalTime = 0;
  // air
  readonly airPos = v3();
  readonly airVel = v3();
  airYaw = 0;
  launchHeading = 0;
  airTime = 0;
  private launchUp = v3(0, 1, 0);
  private launchForward = v3(1, 0, 0);
  private stats: RiderStats;
  private edges = new InputEdges();
  private sample: SurfaceSample = makeSurfaceSample();
  private p2 = { d: 0, y: 0 };
  lastLanding: LandingJudgement | null = null;
  lastWipeout: WipeoutReason | null = null;
  wipeouts = 0;
  readonly tube: TubeState = { offset: 0, depth: 0, balance: 0, driftDir: 1, driftTimer: 0, seconds: 0, maxDepth: 0 };
  floaterSeconds = 0;
  private rng: Rng;
  private lastDownTap = -10;
  private prevStickY = 0;
  private prevStickDir = 0;
  private superStallUntil = -1;
  /** Which scheme is driving: set by the scene from options / URL params. */
  controls: ControlScheme = 'classic';
  /**
   * Assists on (default) is the tuned experience. Turning them off is Pro mode, which only ever
   * removes help — the physics is identical either way (docs/MECHANICS.md §9).
   */
  assists = true;
  private stanceModel: StanceModel;
  private classicFeet: RiderInput = cloneInput(NEUTRAL_INPUT);
  /** Seconds the board has been sliding beyond grip (a soft failure that can be steered out of). */
  slideSeconds = 0;

  constructor(
    readonly wave: WaveModel,
    private tuning: Tuning,
    stats: RiderStats,
    private events: EventBus<RiderEvents>,
    start?: { u?: number; v?: number; state?: RiderState },
    rng?: Rng,
  ) {
    this.stats = stats;
    this.stanceModel = new StanceModel(tuning);
    this.rng = rng ?? new Rng(0x5eed);
    this.u = start?.u ?? wave.curlU + wave.params.breakSpeed * tuning.rider.respawnAheadSeconds;
    this.v = start?.v ?? tuning.rider.respawnV;
    if (start?.state) this.state = start.state;
    if (this.state === 'face') this.speed = tuning.rider.trimSpeed * 0.8;
  }

  setStats(stats: RiderStats): void {
    this.stats = stats;
  }

  get input(): Readonly<RiderInput> {
    return this.edges.current;
  }

  /** Signed stick component toward the wave wall (+ = up the face), independent of break direction. */
  private toWall(input: Readonly<RiderInput>): number {
    return this.wave.params.direction * input.stickX;
  }

  /** The five stance quantities this frame (docs/MECHANICS.md §2). Read by the physics and the character. */
  get stance(): Readonly<StanceState> {
    return this.stanceModel.state;
  }

  get dual(): boolean {
    return this.controls === 'dual';
  }

  /** In classic mode the single stick is expressed as feet so the character still reacts. */
  private feet(input: Readonly<RiderInput>): Readonly<RiderInput> {
    if (this.controls === 'dual') return input;
    const f = this.classicFeet;
    f.stickX = input.stickX;
    f.stickY = input.stickY;
    stanceFromClassic(f);
    return f;
  }

  step(dt: number, input: Readonly<RiderInput> = NEUTRAL_INPUT): void {
    this.edges.update(input);
    this.totalTime += dt;
    this.stateTime += dt;
    this.stanceModel.update(dt, this.feet(input), this.wave.params.direction, Math.sin(this.heading));
    switch (this.state) {
      case 'prone':
        this.stepProne(dt, input);
        break;
      case 'face':
        this.stepFace(dt, input);
        break;
      case 'air':
        this.stepAir(dt, input);
        break;
      case 'wipeout':
        this.stepWipeout(dt);
        break;
      case 'tube':
        this.stepTube(dt, input);
        break;
      case 'floater':
        this.stepFloater(dt, input);
        break;
    }
    this.prevStickY = input.stickY;
  }

  /** Double-tap down = Super Stall (design doc §4.1); dual just sits hard on the tail. */
  private detectSuperStall(input: Readonly<RiderInput>): void {
    if (this.dual) {
      if (this.stanceModel.state.trim < -0.75) this.superStallUntil = this.totalTime + 0.15;
      return;
    }
    if (input.stickY < -0.5 && this.prevStickY >= -0.5) {
      const window = this.tuning.input.doubleTapWindowMs / 1000;
      if (this.totalTime - this.lastDownTap < window) this.superStallUntil = this.totalTime + 0.6;
      this.lastDownTap = this.totalTime;
    }
  }

  get superStalling(): boolean {
    return this.totalTime < this.superStallUntil;
  }

  private setState(s: RiderState): void {
    this.state = s;
    this.stateTime = 0;
  }

  // ───────────────────────────── prone ─────────────────────────────
  private stepProne(dt: number, input: Readonly<RiderInput>): void {
    const R = this.tuning.rider;
    // the wave lifts you up the face as it approaches; paddling left/right shifts you along the line
    this.v = clamp(this.v + R.proneLiftRate * dt, 0, 1);
    // paddling: the sticks are arms; leaning them together pulls you along the line
    const lateral = this.dual ? this.stanceModel.state.rail : this.toWall(input);
    this.u += lateral * R.proneSpeed * dt;
    this.speed = R.proneSpeed;
    this.heading = 0;
    const behind = this.u - this.wave.curlU;
    if (behind < R.curlCatchMarginU * 0.5) {
      this.wipeout('caught-prone');
      return;
    }
    const [lo, hi] = R.standWindowV;
    // popping up is the same explosive extension as an ollie
    const poppedUp = this.dual && this.stanceModel.state.pop > 0;
    if (this.edges.pressed('stand') || poppedUp || (this.v >= hi && input.stand)) {
      if (this.v >= lo) this.stand();
    } else if (this.v >= 0.92) {
      // too late: over the falls
      this.wipeout('caught-prone');
    }
  }

  private stand(): void {
    const R = this.tuning.rider;
    this.setState('face');
    this.speed = R.proneSpeed + R.dropSpeedBoost + this.stats.speed * 2;
    this.heading = -0.3; // angled down the face, down the line
    this.fakie = false;
    this.events.emit('stand', { u: this.u, v: this.v });
  }

  // ───────────────────────────── face ─────────────────────────────
  /** 1 in the pocket, falling toward (1 - shoulderSpeedLoss) far ahead of the curl where the wave has no push. */
  private wavePower(): number {
    const R = this.tuning.rider;
    const ahead = this.u - this.wave.curlU;
    return 1 - R.shoulderSpeedLoss * smoothstep(R.shoulderStartU, R.shoulderEndU, ahead);
  }

  private trimTarget(power: number): number {
    const R = this.tuning.rider;
    const ahead = this.u - this.wave.curlU;
    const powerZone = clamp(1 - Math.abs(this.v - 0.45) / 0.55, 0, 1); // 1 mid-face, ~0 at trough/lip
    let target = R.trimSpeed * (0.65 + 0.55 * powerZone);
    target *= power;
    target *= 1 + R.pocketSpeedGain * (1 - smoothstep(0, 8, ahead));
    target *= 1 + this.stats.speed * 0.25;
    return target;
  }

  private stepFace(dt: number, input: Readonly<RiderInput>): void {
    const R = this.tuning.rider;
    const A = this.tuning.air;
    const S = this.tuning.stance;
    const st = this.stanceModel.state;
    const dual = this.dual;
    const s = this.wave.sample(this.u, this.v, this.sample);
    const toWall = this.toWall(input);
    this.detectSuperStall(input);

    // steering: both feet leaning the same way engages the rail; a compressed rail carves harder
    const turnIn = dual ? st.rail : toWall;
    let rate = R.turnRate;
    if (input.carve) rate = R.carveTurnRate;
    else if (input.grab) rate = R.grabTurnRate;
    if (dual) rate *= 1 + S.compressionTurnBonus * Math.max(0, st.compression) + S.railCarveBonus * Math.abs(st.rail) * Math.max(0, st.compression);
    // Auto-trim: with the sticks *at rest* the board finds a line again. Pressing the tail to stall is
    // not at rest — straightening that out would stop a beginner ever setting up for the barrel.
    const levelRate = R.headingLevelRate * (this.assists ? 1 : S.proLevelRate);
    const quiet = !dual || (Math.abs(st.trim) < 0.3 && Math.abs(st.compression) < 0.5);
    if (Math.abs(turnIn) < 0.15 && quiet) this.heading = damp(this.heading, 0, levelRate, dt);
    else this.heading = wrapAngle(this.heading + rate * turnIn * dt);

    // board yaw: feet twisting opposite ways pivot the board out from under the direction of travel
    if (dual) {
      this.boardYaw = clamp(this.boardYaw + S.twistTorque * st.twist * dt, -S.twistMaxRad, S.twistMaxRad);
      const before = this.boardYaw;
      this.boardYaw = damp(this.boardYaw, 0, S.twistRecover, dt);
      // the rail biting again carries the pivot into the direction of travel: that is what a snap is
      this.heading = wrapAngle(this.heading + (before - this.boardYaw) * S.twistSteer);
      const slip = Math.max(0, Math.abs(this.boardYaw) - S.twistGrip);
      if (slip > 0) {
        this.speed = Math.max(0, this.speed - S.slideScrub * slip * dt);
        this.slideSeconds += dt;
        if (this.slideSeconds > S.slideFailSeconds * (0.7 + this.stats.balance * 0.6)) {
          this.wipeout('slide');
          return;
        }
      } else this.slideSeconds = Math.max(0, this.slideSeconds - dt * 2);
    }

    // forces along the heading
    const sinH = Math.sin(this.heading);
    const gAlong = -R.gravityAlongFace * Math.sin(s.slope) * sinH;
    const power = this.wavePower();
    let trim = this.trimTarget(power);
    let relax = this.speed < trim ? R.relaxBelowTrim : R.relaxAboveTrim;
    const stallAmount = dual ? clamp(-st.trim, 0, 1) : clamp(-input.stickY, 0, 1);
    const stalling = dual ? st.trim < S.stallTrim : input.stickY < -0.3;
    if (stalling) {
      // weight on the tail drags it: the wave still carries you, but at a fraction of trim
      const frac = this.superStalling ? R.superStallSpeedFraction : R.stallSpeedFraction;
      trim = Math.min(trim, R.trimSpeed * frac);
      relax = R.stallRelax * stallAmount;
    }
    let a = gAlong + (trim - this.speed) * relax;
    if (dual) {
      // §4: energy comes from pumping in phase with the face, plus a smaller continuous drive off the nose
      a += R.pumpAccel * S.pumpAccelScale * st.pumpWork * power * power;
      a += R.pumpAccel * S.trimDriveScale * (this.assists ? 1 : S.proTrimDrive) * Math.max(0, st.trim) * power * power;
    } else if (input.stickY > 0.3) {
      const pumpEff = sinH < 0 ? 1 + R.pumpDescendBonus * -sinH : 1 - 0.7 * sinH;
      a += R.pumpAccel * input.stickY * pumpEff * power * power;
    }
    if (input.carve && Math.abs(turnIn) > 0.2) a += R.carveAccel * Math.abs(turnIn);
    const maxSpeed = R.maxSpeed * (1 + this.stats.speed * 0.2);
    this.speed = clamp(this.speed + a * dt, 0, maxSpeed);

    // jump loading: dual reads the crouch itself; classic holds the button (design doc §4.1)
    if (dual) this.jumpLoad = st.load;
    else if (input.jump) {
      if (input.stickY > 0.5) this.jumpLoad = 0;
      else this.jumpLoad = clamp(this.jumpLoad + dt / A.loadMaxSeconds, 0, 1);
    }

    // move in wave space
    const du = this.speed * Math.cos(this.heading) * dt;
    const dv = (this.speed * sinH * dt) / s.vScale;
    this.u += du;
    this.v += dv;

    // bogging: too slow high on the face → slide down; too slow anywhere → fall
    if (this.speed < R.bogSpeed && this.v > 0.35) this.v -= ((R.bogSpeed - this.speed) / R.bogSpeed) * 0.35 * dt;
    if (this.speed < R.minStandSpeed && this.stateTime > 0.5 && this.v > 0.25) {
      this.wipeout('bogged');
      return;
    }

    // trough boundary: the board levels out on flat water
    if (this.v < 0.03) {
      this.v = 0.03;
      if (this.heading < 0) this.heading = damp(this.heading, 0, 12, dt);
    }

    // lip boundary: launch, floater, or fall over the back
    const releasedJump = this.edges.released('jump');
    // dual: an explosive extension out of a crouch is the pop — the surfing equivalent of an ollie
    const popped = dual && st.pop > 0;
    const wantsLaunch = (releasedJump || popped || (this.v >= 1 && input.jump)) && this.v >= A.launchMinV && sinH >= A.launchMinHeading;
    if (wantsLaunch) {
      const power = Math.max(popped ? st.pop : this.jumpLoad, A.loadMinFraction);
      this.jumpLoad = 0;
      this.launch(power);
      return;
    }
    if (releasedJump) this.jumpLoad = 0;
    const F = this.tuning.floater;
    const unweighted = dual && st.compression < -0.4;
    if ((input.slide || unweighted) && this.v >= F.entryMinV && sinH > -0.1) {
      this.startFloater();
      return;
    }
    if (this.v > 1) {
      // only a fast, near-vertical hit at the lip throws you over the back; otherwise you bounce off the lip
      if (sinH > R.overTheBackSin && this.speed > R.overTheBackMinSpeed) {
        this.wipeout('over-the-back');
        return;
      }
      this.v = 1;
      this.heading = damp(this.heading, -0.25, 9, dt);
      this.speed *= 1 - 1.2 * dt;
    }

    // tube entry: in the pocket under a roof, slow enough (stalling makes it deliberate)
    const T = this.tuning.tube;
    const fields = s.fields;
    const ahead = this.u - this.wave.curlU;
    const tubeLen = this.wave.tubeLength(T.lengthFactor);
    if (fields.tube > 0.35 && ahead >= T.minOffsetU && ahead <= tubeLen && this.v < 0.55) {
      const stalling = (dual ? st.trim < -0.45 : input.stickY < -0.5) || this.superStalling;
      if ((stalling && this.speed <= T.entrySpeedMax) || this.speed <= T.entrySpeedMax * 0.75) {
        this.enterTube(!stalling);
        return;
      }
    }

    // whitewater: fall behind the curl or run into a close-out
    const brk = this.wave.distanceToBreak(this.u);
    const mainBehind = this.u - this.wave.curlU;
    if (mainBehind < -R.curlCatchMarginU) {
      this.wipeout('curl');
      return;
    }
    // inside a section's whitewater by more than the catch margin (its soft leading edge is survivable)
    if (brk.inside && brk.behind < -R.curlCatchMarginU) {
      this.wipeout('closeout');
      return;
    }
  }

  // ───────────────────────────── tube ─────────────────────────────
  private enterTube(passive: boolean): void {
    const T = this.tuning.tube;
    const t = this.tube;
    t.offset = this.u - this.wave.curlU;
    t.balance = 0;
    t.driftDir = this.rng.chance(0.5) ? 1 : -1;
    t.driftTimer = this.rng.range(T.driftFlipMinSeconds, T.driftFlipMaxSeconds);
    t.seconds = 0;
    t.maxDepth = 0;
    t.depth = 0;
    this.heading = 0;
    this.prevStickDir = 0;
    this.setState('tube');
    this.events.emit('tubeEnter', { u: this.u, passive });
  }

  private stepTube(dt: number, input: Readonly<RiderInput>): void {
    const T = this.tuning.tube;
    const R = this.tuning.rider;
    const t = this.tube;
    const len = this.wave.tubeLength(T.lengthFactor);
    t.seconds += dt;
    // depth control: stall = deeper (the curl gains on you), up/jump = speed out; the barrel pulls you back a little
    const st = this.stanceModel.state;
    let rel = -0.25;
    if (this.dual) rel += T.depthRate * st.trim;
    else if (input.stickY < -0.3) rel -= T.depthRate * -input.stickY;
    else if (input.stickY > 0.3) rel += T.depthRate * input.stickY;
    if (input.jump) rel += T.escapeAccel;
    // quick cuts reposition instantly
    if (this.edges.pressed('spinLeft')) {
      t.offset -= T.quickCutOffsetU * this.wave.params.direction;
      t.balance += T.quickCutBalanceKick * t.driftDir;
    }
    if (this.edges.pressed('spinRight')) {
      t.offset += T.quickCutOffsetU * this.wave.params.direction;
      t.balance -= T.quickCutBalanceKick * t.driftDir;
    }
    t.offset += rel * dt;
    this.u = this.wave.curlU + t.offset;
    this.speed = this.wave.params.breakSpeed + rel;
    this.v = damp(this.v, 0.24, 6, dt);
    t.depth = clamp(1 - (t.offset - T.minOffsetU) / Math.max(0.5, len - T.minOffsetU), 0, 1);
    t.maxDepth = Math.max(t.maxDepth, t.depth);

    // balance: the marker drifts, harder when deep; tap/hold left-right to centre it; rail grab damps it
    t.driftTimer -= dt;
    if (t.driftTimer <= 0) {
      t.driftDir = t.driftDir === 1 ? -1 : 1;
      t.driftTimer = this.rng.range(T.driftFlipMinSeconds, T.driftFlipMaxSeconds);
    }
    // drift grows with depth and, slowly, with time in the barrel (design doc §14: 6 s comfortable, 15 s expert)
    let drift = (T.balanceDriftBase + T.balanceDriftDepthScale * t.depth) * (1 + t.seconds * T.balanceDriftTimeScale) * (1 - this.stats.balance * T.balanceStatScale);
    if (input.grab) drift *= T.railGrabDriftFactor;
    t.balance += t.driftDir * drift * dt;
    // balance is corrected in screen space, with the rail rather than a single stick when dual
    const railRaw = this.dual ? (input.backX + input.frontX) / 2 : input.stickX;
    const stickDir = railRaw > 0.5 ? 1 : railRaw < -0.5 ? -1 : 0;
    if (stickDir !== 0 && stickDir !== this.prevStickDir) t.balance -= stickDir * T.balanceTapImpulse;
    if (stickDir !== 0) t.balance -= stickDir * T.balanceHoldRate * dt;
    this.prevStickDir = stickDir;
    if (Math.abs(t.balance) >= T.balanceFailThreshold) {
      this.wipeout('tube-balance');
      return;
    }

    // exits
    if (t.offset <= T.minOffsetU * 0.4) {
      this.wipeout('curl');
      return;
    }
    // crouching makes you smaller: a tight barrel that would clip you standing tall lets you through
    const crouch = this.dual ? Math.max(0, st.compression) : 0;
    const roof = this.wave.fields(this.u).tube;
    if (t.offset >= len || roof < 0.12 - 0.05 * crouch) this.exitTube();
    if (this.speed < R.minStandSpeed * 0.5 && this.state === 'tube') this.wipeout('bogged');
  }

  private exitTube(): void {
    const T = this.tuning.tube;
    const t = this.tube;
    this.setState('face');
    this.speed = Math.max(this.speed, T.exitSpeed);
    this.heading = -0.15;
    this.v = Math.max(this.v, 0.3);
    this.events.emit('tubeExit', { seconds: t.seconds, maxDepth: t.maxDepth, spit: t.maxDepth >= T.spitDepth, u: this.u });
  }

  // ───────────────────────────── floater ─────────────────────────────
  private startFloater(): void {
    this.floaterSeconds = 0;
    this.v = 1;
    this.heading = 0;
    this.jumpLoad = 0;
    this.setState('floater');
    this.events.emit('floaterStart', { u: this.u });
  }

  private stepFloater(dt: number, input: Readonly<RiderInput>): void {
    const F = this.tuning.floater;
    const R = this.tuning.rider;
    this.floaterSeconds += dt;
    this.v = 1;
    this.heading = 0;
    this.speed *= 1 - F.speedLossPerSecond * dt;
    this.u += this.speed * dt;
    const done = !input.slide || this.floaterSeconds >= F.maxSeconds || this.speed < R.minStandSpeed;
    if (done) this.endFloater();
  }

  private endFloater(): void {
    const F = this.tuning.floater;
    const overSection = this.wave.distanceToBreak(this.u).inside || this.wave.fields(this.u).broken > 0.5;
    this.events.emit('floaterEnd', { seconds: this.floaterSeconds, overSection, u: this.u });
    if (overSection) {
      this.wipeout('closeout');
      return;
    }
    this.setState('face');
    this.v = 0.62;
    this.heading = -0.5;
    this.speed += F.dropSpeedGain;
  }

  // ───────────────────────────── air ─────────────────────────────
  private launch(power: number): void {
    const A = this.tuning.air;
    const s = this.wave.sample(this.u, this.v, this.sample);
    const cosH = Math.cos(this.heading);
    const sinH = Math.sin(this.heading);
    const dir = this.wave.params.direction;
    // Explicit launch model (not the raw face tangent, which is nearly vertical at the lip):
    //   up    = base pop + loaded pop + a slice of speed, scaled by the Air stat
    //   along = carry down the line
    //   shore = drift toward the shore so the arc comes back down onto the face
    const up = (A.launchBase + A.launchPerPower * power + this.speed * A.launchSpeedScale * sinH * power) * (1 + this.stats.air * A.hangTimeStatScale);
    const along = this.speed * (Math.max(cosH, 0.15) * 0.85 + 0.15);
    const shore = 0.9 + up * 0.28 + this.speed * sinH * 0.12;
    v3Set(this.airVel, dir * along, up, -shore);
    v3Set(this.airPos, s.pos.x + s.n.x * 0.15, s.pos.y + s.n.y * 0.15, s.pos.z + s.n.z * 0.15);
    v3Set(this.launchUp, s.n.x, s.n.y, s.n.z);
    v3Set(this.launchForward, cosH * s.tu.x + sinH * s.tv.x, cosH * s.tu.y + sinH * s.tv.y, cosH * s.tu.z + sinH * s.tv.z);
    this.launchHeading = this.heading;
    this.airYaw = 0;
    this.airTime = 0;
    this.setState('air');
    this.events.emit('launch', { speed: this.speed, heading: this.heading, power, u: this.u, v: this.v });
  }

  private stepAir(dt: number, input: Readonly<RiderInput>): void {
    const A = this.tuning.air;
    this.airTime += dt;
    this.airVel.y -= A.gravity * dt;
    this.airPos.x += this.airVel.x * dt;
    this.airPos.y += this.airVel.y * dt;
    this.airPos.z += this.airVel.z * dt;
    // spin: feet twisting opposite ways rotate the board; tucking (crouching) spins faster
    const S = this.tuning.stance;
    const st = this.stanceModel.state;
    const spinRate = A.spinRateBase + this.stats.spin * A.spinRateStatScale;
    let spinIn = 0;
    // rotation assist: the spin buttons stand in for twisting the feet. Pro mode uses the feet only.
    if (this.assists || !this.dual) {
      if (input.spinLeft) spinIn -= 1;
      if (input.spinRight) spinIn += 1;
    }
    if (spinIn === 0) spinIn = this.dual ? clamp(st.twist * S.airTwistScale, -1, 1) : input.stickX;
    const tuck = this.dual ? 1 + S.tuckSpinBonus * Math.max(0, st.compression) : 1;
    this.airYaw += spinRate * tuck * spinIn * dt;
    // track wave-space u so the wave/camera know where we are
    this.u = this.wave.params.direction * this.airPos.x;
    const dTarget = -this.airPos.z;
    const { v, behindLip } = this.solveV(this.u, dTarget);
    this.v = v;
    if (this.airVel.y < 0) {
      if (behindLip) {
        // came down behind the lip / into the roof
        this.wipeout('over-the-back');
        return;
      }
      this.wave.position(this.u, v, this.sample.pos);
      if (this.airPos.y <= this.sample.pos.y + 0.05) {
        this.land();
        return;
      }
    }
    if (this.airTime > A.airTimeoutSeconds) this.wipeout('timeout');
  }

  /** Find the face coordinate v whose shoreward distance matches d (metres from the trough line). */
  private solveV(u: number, d: number): { v: number; behindLip: boolean } {
    const prof = this.wave.profileAt(u);
    if (d >= 0) return { v: 0.03, behindLip: false };
    // d(v) decreases monotonically up to the vertical point; bisect there
    const vVert = Math.min(1, Math.PI / 2 / prof.phiFace);
    facePoint(prof, vVert, this.p2);
    if (d < this.p2.d) return { v: vVert, behindLip: true };
    let lo = 0;
    let hi = vVert;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      facePoint(prof, mid, this.p2);
      if (this.p2.d > d) lo = mid;
      else hi = mid;
    }
    return { v: (lo + hi) / 2, behindLip: false };
  }

  private land(): void {
    const A = this.tuning.air;
    // The board pitches with the arc, so with no spin it comes down at the mirror angle by itself;
    // what gets judged is the spin residual: multiples of 180° (fakie included) are Perfect.
    const boardYaw = wrapAngle(-this.launchHeading + this.airYaw);
    // landing with the legs loaded absorbs it; landing locked out does not
    const S = this.tuning.stance;
    const absorb = (this.dual ? 1 + S.landAbsorb * Math.max(0, this.stanceModel.state.compression) : 1) * (this.assists ? 1 : S.proLandingWindow);
    const j = judgeLanding(this.launchHeading, boardYaw, A.perfectWindowDeg * absorb, A.sloppyWindowDeg * absorb, this.airYaw);
    this.lastLanding = j;
    const airTime = this.airTime;
    if (j.rating === 'wipeout') {
      this.events.emit('land', { ...j, u: this.u, v: this.v, airTime, speed: 0 });
      this.wipeout('bad-landing');
      return;
    }
    this.fakie = j.fakie;
    // ride away in the direction of travel projected onto the face, plus the residual error
    const s = this.wave.sample(this.u, this.v, this.sample);
    const alongU = this.airVel.x * s.tu.x + this.airVel.y * s.tu.y + this.airVel.z * s.tu.z;
    const alongV = this.airVel.x * s.tv.x + this.airVel.y * s.tv.y + this.airVel.z * s.tv.z;
    const travel = Math.atan2(alongV, Math.max(alongU, 0.5));
    this.heading = wrapAngle(clamp(travel, -1.2, 0.2) + j.errorRad * 0.5);
    const horiz = Math.hypot(alongU, alongV);
    const keep = j.rating === 'perfect' ? A.landSpeedKeepPerfect : A.landSpeedKeepSloppy;
    this.speed = Math.max(this.tuning.rider.minStandSpeed + 1.5, horiz * keep);
    this.setState('face');
    this.events.emit('land', { ...j, u: this.u, v: this.v, airTime, speed: this.speed });
  }

  // ───────────────────────────── wipeout ─────────────────────────────
  wipeout(reason: WipeoutReason): void {
    if (this.state === 'wipeout') return;
    this.lastWipeout = reason;
    this.wipeouts++;
    this.setState('wipeout');
    this.speed = 0;
    this.jumpLoad = 0;
    this.events.emit('wipeout', { reason, u: this.u });
  }

  private stepWipeout(dt: number): void {
    const R = this.tuning.rider;
    // tumble in the whitewater just behind the curl
    this.u = damp(this.u, this.wave.curlU - 2.5, 3, dt);
    this.v = damp(this.v, 0.12, 4, dt);
    if (this.stateTime >= R.wipeoutTumbleSeconds) {
      // catch the next wave: reappear prone ahead of the curl
      this.u = this.wave.curlU + this.wave.params.breakSpeed * R.respawnAheadSeconds;
      this.v = R.respawnV;
      this.heading = 0;
      this.fakie = false;
      this.setState('prone');
      this.events.emit('respawn', { u: this.u });
    }
  }

  /** Reposition prone ahead of the curl (new heat / retry) without a wipeout penalty. */
  respawn(): void {
    const R = this.tuning.rider;
    this.u = this.wave.curlU + this.wave.params.breakSpeed * R.respawnAheadSeconds;
    this.v = R.respawnV;
    this.heading = 0;
    this.speed = 0;
    this.fakie = false;
    this.jumpLoad = 0;
    this.setState('prone');
    this.events.emit('respawn', { u: this.u });
  }

  // ───────────────────────────── queries ─────────────────────────────
  /** World-space pose for rendering (allocation-free into `out`). */
  pose(out: RiderPose): RiderPose {
    const s = this.sample;
    if (this.state === 'air') {
      v3Set(out.pos, this.airPos.x, this.airPos.y, this.airPos.z);
      // the board pitches to follow the arc: forward blends from the launch direction to the velocity
      const t = clamp(this.airTime * 1.6, 0, 1);
      const vl = Math.hypot(this.airVel.x, this.airVel.y, this.airVel.z) || 1;
      const f = {
        x: lerp(this.launchForward.x, this.airVel.x / vl, t),
        y: lerp(this.launchForward.y, this.airVel.y / vl, t),
        z: lerp(this.launchForward.z, this.airVel.z / vl, t),
      };
      const up = this.launchUp;
      const c = Math.cos(this.airYaw);
      const sn = Math.sin(this.airYaw);
      // Rodrigues rotation
      const dot = f.x * up.x + f.y * up.y + f.z * up.z;
      const cx = up.y * f.z - up.z * f.y;
      const cy = up.z * f.x - up.x * f.z;
      const cz = up.x * f.y - up.y * f.x;
      v3Set(out.forward, f.x * c + cx * sn + up.x * dot * (1 - c), f.y * c + cy * sn + up.y * dot * (1 - c), f.z * c + cz * sn + up.z * dot * (1 - c));
      // blend up toward world up mid-air
      const tu = clamp(this.airTime * 2, 0, 0.6);
      v3Set(out.up, lerp(up.x, 0, tu), lerp(up.y, 1, tu), lerp(up.z, 0, tu));
    } else {
      this.wave.sample(this.u, this.v, s);
      const lift = this.state === 'wipeout' ? 0.05 : 0.12;
      v3Set(out.pos, s.pos.x + s.n.x * lift, s.pos.y + s.n.y * lift, s.pos.z + s.n.z * lift);
      const h = this.state === 'prone' ? 0 : this.heading + this.boardYaw;
      const cH = Math.cos(h);
      const sH = Math.sin(h);
      v3Set(out.forward, cH * s.tu.x + sH * s.tv.x, cH * s.tu.y + sH * s.tv.y, cH * s.tu.z + sH * s.tv.z);
      v3Set(out.up, s.n.x, s.n.y, s.n.z);
    }
    // orthonormalise
    const f = out.forward;
    const u = out.up;
    const fl = Math.hypot(f.x, f.y, f.z) || 1;
    f.x /= fl;
    f.y /= fl;
    f.z /= fl;
    const ul = Math.hypot(u.x, u.y, u.z) || 1;
    u.x /= ul;
    u.y /= ul;
    u.z /= ul;
    const rx = f.y * u.z - f.z * u.y;
    const ry = f.z * u.x - f.x * u.z;
    const rz = f.x * u.y - f.y * u.x;
    const rl = Math.hypot(rx, ry, rz) || 1;
    v3Set(out.right, rx / rl, ry / rl, rz / rl);
    // re-derive forward from right × up to keep it orthogonal
    v3Set(out.forward, u.y * out.right.z - u.z * out.right.y, u.z * out.right.x - u.x * out.right.z, u.x * out.right.y - u.y * out.right.x);
    out.fakie = this.fakie;
    return out;
  }

  /** Heading relative to the +u tangent, as seen on screen (positive = toward the wall). */
  get headingDeg(): number {
    return (this.heading * 180) / Math.PI;
  }

  get aheadOfCurl(): number {
    return this.u - this.wave.curlU;
  }

  snapshot(): Record<string, unknown> {
    return {
      state: this.state,
      u: +this.u.toFixed(2),
      v: +this.v.toFixed(3),
      speed: +this.speed.toFixed(2),
      headingDeg: +this.headingDeg.toFixed(1),
      ahead: +this.aheadOfCurl.toFixed(2),
      jumpLoad: +this.jumpLoad.toFixed(2),
      boardYawDeg: +((this.boardYaw * 180) / Math.PI).toFixed(0),
      stance: this.dual
        ? {
            compression: +this.stance.compression.toFixed(2),
            trim: +this.stance.trim.toFixed(2),
            rail: +this.stance.rail.toFixed(2),
            twist: +this.stance.twist.toFixed(2),
            pump: +this.stance.pumpWork.toFixed(2),
          }
        : null,
      airTime: +this.airTime.toFixed(2),
      airYawDeg: +((this.airYaw * 180) / Math.PI).toFixed(0),
      lastLanding: this.lastLanding?.rating ?? null,
      lastWipeout: this.lastWipeout,
      wipeouts: this.wipeouts,
      fakie: this.fakie,
      tube: this.state === 'tube' ? { depth: +this.tube.depth.toFixed(2), balance: +this.tube.balance.toFixed(2), seconds: +this.tube.seconds.toFixed(2) } : null,
      floater: this.state === 'floater' ? +this.floaterSeconds.toFixed(2) : null,
    };
  }
}

export function makePose(): RiderPose {
  return { pos: v3(), forward: v3(1, 0, 0), up: v3(0, 1, 0), right: v3(0, 0, 1), fakie: false };
}

export { angleDelta, TWO_PI };
