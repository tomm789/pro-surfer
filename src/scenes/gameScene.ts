import type * as THREE from 'three';
import type { GameScene, SceneContext } from '@/app/scene';
import { InputManager } from '@/input/inputManager';
import { NEUTRAL_INPUT, type RiderInput } from '@/rider/input';
import { TUNING } from '@/core/tuning';
import { listBeaches } from '@/world/beaches';
import { AudioManager } from '@/audio/audio';
import { BootScreen, MenuScreen, ResultsScreen, type MenuItem, type ResultRow } from '@/ui/screens';
import { RideScene } from './rideScene';
import { CareerSave } from '@/save/career';
import { listLevels, getLevel } from '@/goals/levels';
import { getBeach } from '@/world/beaches';

type Flow = 'boot' | 'menu' | 'ride' | 'paused' | 'results';

/**
 * The game shell: boot screen (audio + gamepad unlock) → main menu → ride → results.
 * Owns one RideScene per run and the audio manager. Pause with Esc / Start.
 */
export class MainGameScene implements GameScene {
  readonly name = 'game';
  private ctx!: SceneContext;
  private flow: Flow = 'boot';
  private input = new InputManager(TUNING.input.deadzone);
  private audio = new AudioManager();
  private boot: BootScreen | null = null;
  private menu: MenuScreen | null = null;
  private pause: MenuScreen | null = null;
  private results: ResultsScreen | null = null;
  private ride: RideScene | null = null;
  private beachIndex = 0;
  private waveFt = 8;
  private freeSurf = true;
  private career = new CareerSave();
  private levelId: string | null = null;
  private careerMenu: MenuScreen | null = null;
  private lastInput: Readonly<RiderInput> = NEUTRAL_INPUT;
  private prevPause = false;
  private prevMute = false;
  private prevFull = false;
  private menuUpdatedThisFrame = false;

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    this.input.attach(window);
    this.boot = new BootScreen(ctx.uiRoot, 'LINE-UP', 'SURF · TRICK · LINK · CASH IN', 'PRESS ANY KEY OR BUTTON<br><span style="font-size:13px;letter-spacing:1px;opacity:.8">(press a key or click once for sound)</span>');
    const wantBeach = ctx.params.get('beach');
    if (wantBeach) {
      const i = this.beaches.findIndex((b) => b.id === wantBeach);
      if (i >= 0) this.beachIndex = i;
    }
    if (ctx.params.has('ft')) this.waveFt = Math.max(4, Math.min(30, Number(ctx.params.get('ft')) || 8));
    const unlock = () => {
      this.audio.start();
    };
    window.addEventListener('keydown', unlock, { once: false });
    window.addEventListener('pointerdown', unlock, { once: false });
    // background: start a ride in the menus so the wave is visible behind them
    this.startRide(true);
    const flow = ctx.params.get('flow');
    if (flow === 'menu') {
      this.boot?.dispose();
      this.boot = null;
      this.openMenu();
    } else if (flow === 'ride') {
      this.boot?.dispose();
      this.boot = null;
      this.freeSurf = ctx.params.get('free') === '1';
      this.beginRun();
    }
  }

  private beaches = listBeaches();

  private startRide(background: boolean): void {
    this.ride?.dispose();
    const beach = this.beaches[this.beachIndex]!;
    const params = new URLSearchParams(this.ctx.params);
    params.set('beach', beach.id);
    params.set('ft', String(this.waveFt));
    params.set('hosted', '1');
    if (background) {
      params.set('auto', '1');
      params.set('free', '1');
      params.set('attract', '1');
    } else {
      params.delete('auto');
      if (this.freeSurf) params.set('free', '1');
      else params.delete('free');
      if (this.levelId) params.set('level', this.levelId);
      else params.delete('level');
      const st = this.career.data.stats;
      params.set('stats', JSON.stringify({ spin: 0.45 + st.spin * 0.5, speed: 0.45 + st.speed * 0.5, air: 0.45 + st.air * 0.5, balance: 0.45 + st.balance * 0.5 }));
    }
    if (background) params.delete('level');
    this.ride = new RideScene();
    this.ride.audio = this.audio;
    this.ride.init({ ...this.ctx, params });
    if (background) this.ride.attract = true;
  }

  private openMenu(): void {
    this.flow = 'menu';
    this.careerMenu?.dispose();
    this.careerMenu = null;
    this.menu?.dispose();
    this.menu = new MenuScreen(
      this.ctx.uiRoot,
      'LINE-UP',
      [
        {
          id: 'career',
          label: 'Career',
          value: () => `${Object.values(this.career.data.completedGoals).reduce((n, g) => n + g.length, 0)} goals`,
          onSelect: () => {
            this.audio.uiSelect();
            this.openCareer();
          },
        },
        {
          id: 'surf',
          label: 'Free Surf',
          onSelect: () => {
            this.audio.uiSelect();
            this.freeSurf = true;
            this.beginRun();
          },
        },
        {
          id: 'timed',
          label: 'Timed Run (3:00)',
          onSelect: () => {
            this.audio.uiSelect();
            this.freeSurf = false;
            this.beginRun();
          },
        },
        {
          id: 'beach',
          label: 'Beach',
          value: () => `${this.beaches[this.beachIndex]!.name} (${this.beaches[this.beachIndex]!.breakDirection})`,
          onAdjust: (d) => {
            this.beachIndex = (this.beachIndex + d + this.beaches.length) % this.beaches.length;
            this.audio.uiMove();
            this.startRide(true);
          },
        },
        {
          id: 'size',
          label: 'Wave size',
          value: () => `${this.waveFt} ft`,
          onAdjust: (d) => {
            this.waveFt = Math.max(4, Math.min(30, this.waveFt + d * 2));
            this.audio.uiMove();
            this.startRide(true);
          },
        },
        {
          id: 'full',
          label: 'Fullscreen',
          value: () => (document.fullscreenElement ? 'on' : 'off'),
          onSelect: () => {
            this.audio.uiSelect();
            void this.toggleFullscreen();
          },
        },
        {
          id: 'mute',
          label: 'Sound',
          value: () => (this.audio.muted ? 'off' : 'on'),
          onSelect: () => {
            this.audio.setMuted(!this.audio.muted);
            this.audio.uiSelect();
          },
        },
      ],
      'Stick/arrows: move · A/Space: select · ←→: change · Esc/Start pauses in-game · M mutes · F fullscreen',
    );
    this.menu.prime(this.lastInput);
    this.audio.music?.play();
  }

  private beginRun(levelId: string | null = null): void {
    this.menu?.dispose();
    this.menu = null;
    this.careerMenu?.dispose();
    this.careerMenu = null;
    this.levelId = levelId;
    if (levelId) {
      const lvl = getLevel(levelId);
      const bi = this.beaches.findIndex((b) => b.id === lvl.beach);
      if (bi >= 0) this.beachIndex = bi;
      this.waveFt = lvl.waveFt;
      this.freeSurf = false;
    }
    this.startRide(false);
    this.flow = 'ride';
    this.ride!.onEnd = () => this.showResults();
  }

  private openCareer(): void {
    this.flow = 'menu';
    this.menu?.dispose();
    this.menu = null;
    const items: MenuItem[] = listLevels().map((lvl) => {
      const unlocked = this.career.isUnlocked(lvl.id);
      const done = (this.career.data.completedGoals[lvl.id] ?? []).length;
      const best = this.career.data.bestScores[lvl.id];
      return {
        id: lvl.id,
        label: `${getBeach(lvl.beach).name} · ${lvl.name}`,
        value: () => (unlocked ? `${done}/${lvl.goals.length} goals${best ? ` · best ${best.toLocaleString('en-US')}` : ''}` : 'locked'),
        disabled: !unlocked,
        onSelect: () => {
          this.audio.uiSelect();
          this.beginRun(lvl.id);
        },
      };
    });
    items.push({ id: 'back', label: 'Back to the boat', onSelect: () => this.openMenu() });
    this.careerMenu?.dispose();
    this.careerMenu = new MenuScreen(this.ctx.uiRoot, 'CAREER · WORLD MAP', items, 'Complete the ★ required goal to unlock the next spots · optional goals give boards and stat boosts');
    this.careerMenu.prime(this.lastInput);
    this.careerMenu.onBack = () => this.openMenu();
  }

  private showResults(): void {
    if (!this.ride) return;
    const run = this.ride.run;
    this.flow = 'results';
    const beach = this.beaches[this.beachIndex]!;
    const goalRows: ResultRow[] = [];
    let title = 'SESSION OVER';
    if (this.ride.level && this.ride.goals) {
      const lvl = this.ride.level;
      const tracker = this.ride.goals;
      const completed = tracker.progress.filter((p) => p.done).map((p) => ({ goalId: p.goal.id, reward: p.goal.reward, required: p.goal.required }));
      const out = this.career.recordRun(lvl.id, run.score, completed, lvl.unlocks);
      for (const p of tracker.progress) goalRows.push({ label: `${p.goal.required ? '★ ' : ''}${p.label}`, value: p.done ? 'DONE' : 'missed', ok: p.done });
      for (const nl of out.newLevels) goalRows.push({ label: 'Unlocked', value: `${getBeach(getLevel(nl).beach).name} · ${getLevel(nl).name}`, ok: true });
      for (const rw of out.newRewards) goalRows.push({ label: 'Reward', value: rw.replace(':', ' · '), ok: true });
      title = tracker.requiredDone ? 'LEVEL CLEARED' : 'HEAT OVER';
    }
    this.results = new ResultsScreen(
      this.ctx.uiRoot,
      title,
      run.score.toLocaleString('en-US'),
      [
        ...goalRows,
        { label: 'Beach', value: `${beach.name} · ${this.waveFt} ft` },
        { label: 'Best chain', value: run.bestChain.toLocaleString('en-US') },
        { label: 'Air points', value: run.bySection.air.toLocaleString('en-US') },
        { label: 'Face points', value: run.bySection.face.toLocaleString('en-US') },
        { label: 'Tube points', value: run.bySection.tube.toLocaleString('en-US') },
        { label: 'Special time', value: `${run.meter.totalYellowSeconds.toFixed(1)} s` },
        { label: 'Longest ride', value: `${run.longestRide.toFixed(0)} s` },
        { label: 'Wipeouts', value: String(run.wipeouts), ok: run.wipeouts === 0 },
      ],
      'A / Space: back to the boat',
    );
    this.results.prime(this.lastInput);
    this.results.onDone = () => {
      this.results?.dispose();
      this.results = null;
      this.audio.uiSelect();
      this.startRide(true);
      this.openMenu();
    };
  }

  private openPause(): void {
    this.flow = 'paused';
    this.pause = new MenuScreen(
      this.ctx.uiRoot,
      'PAUSED',
      [
        { id: 'continue', label: 'Continue', onSelect: () => this.closePause() },
        {
          id: 'retry',
          label: 'Restart run',
          onSelect: () => {
            this.closePause();
            this.beginRun();
          },
        },
        {
          id: 'end',
          label: 'End session',
          onSelect: () => {
            this.closePause();
            this.ride?.run.end('ended');
          },
        },
        {
          id: 'boat',
          label: 'Back to the boat',
          onSelect: () => {
            this.closePause();
            this.startRide(true);
            this.openMenu();
          },
        },
        { id: 'mute', label: 'Sound', value: () => (this.audio.muted ? 'off' : 'on'), onSelect: () => this.audio.setMuted(!this.audio.muted) },
      ],
      'Esc / Start: continue',
    );
    this.pause.prime(this.lastInput);
    this.pause.onBack = () => this.closePause();
  }

  private closePause(): void {
    this.pause?.dispose();
    this.pause = null;
    if (this.flow === 'paused') this.flow = 'ride';
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* not allowed */
    }
  }

  step(dt: number): void {
    const inp = this.lastInput;
    this.menuUpdatedThisFrame = false;
    switch (this.flow) {
      case 'boot':
        this.ride?.step(dt);
        if (this.input.anyInputSeen) {
          this.audio.start();
          this.boot?.dispose();
          this.boot = null;
          this.openMenu();
        }
        break;
      case 'menu':
        this.ride?.step(dt);
        this.menu?.update(inp, dt);
        this.careerMenu?.update(inp, dt);
        break;
      case 'ride': {
        const pausePressed = inp.pause && !this.prevPause;
        if (pausePressed) this.openPause();
        else {
          this.ride?.setInput(inp);
          this.ride?.step(dt);
        }
        break;
      }
      case 'paused': {
        const pausePressed = inp.pause && !this.prevPause;
        if (pausePressed) this.closePause();
        else this.pause?.update(inp, dt);
        break;
      }
      case 'results':
        this.ride?.step(dt);
        this.results?.update(inp, dt);
        break;
    }
    this.prevPause = inp.pause;
  }

  render(alpha: number): void {
    const inp = this.input.poll();
    this.lastInput = { ...inp };
    // global hotkeys (keyboard only): M mute, F fullscreen
    const keys = (this.input as unknown as { keys: Set<string> }).keys;
    const mute = keys.has('KeyM');
    if (mute && !this.prevMute) this.audio.setMuted(!this.audio.muted);
    this.prevMute = mute;
    const full = keys.has('KeyF');
    if (full && !this.prevFull) void this.toggleFullscreen();
    this.prevFull = full;
    if (this.audio.ready && this.flow !== 'boot') this.audio.music?.play();
    void alpha;
    this.ride?.render();
  }

  cameras(): THREE.PerspectiveCamera[] {
    return this.ride?.cameras() ?? [];
  }

  dispose(): void {
    this.ride?.dispose();
    this.menu?.dispose();
    this.pause?.dispose();
    this.results?.dispose();
    this.boot?.dispose();
    this.input.detach(window);
  }

  debugState(): Record<string, unknown> {
    return { flow: this.flow, ride: this.ride?.debugState() };
  }
}
