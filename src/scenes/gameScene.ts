import type * as THREE from 'three';
import type { GameScene, SceneContext } from '@/app/scene';
import { InputManager } from '@/input/inputManager';
import { NEUTRAL_INPUT, type RiderInput } from '@/rider/input';
import { TUNING } from '@/core/tuning';
import { listBeaches } from '@/world/beaches';
import { AudioManager } from '@/audio/audio';
import { BootScreen, MenuNav, MenuScreen, ResultsScreen, type MenuItem, type ResultRow } from '@/ui/screens';
import { ReplayPlayer, type Recording } from '@/core/replay';
import { RideScene } from './rideScene';
import { SplitScene, type SplitMode } from './splitScene';
import { KEYMAP_P1, KEYMAP_P2, KEYMAP_SOLO, keymapHint } from '@/input/keymaps';
import { timeAttackSeconds } from '@/modes/push';
import { CareerSave } from '@/save/career';
import { listLevels, getLevel } from '@/goals/levels';
import { getBeach } from '@/world/beaches';
import { listRiders, listBoards, getRider, getBoard, effectiveStats, statBar } from '@/world/roster';
import { TrickBookScreen } from '@/ui/trickBook';
import { TUNING as T } from '@/core/tuning';

type Flow = 'boot' | 'menu' | 'ride' | 'paused' | 'results' | 'split' | 'interstitial' | 'replay';

/**
 * The game shell: boot screen (audio + gamepad unlock) → main menu → ride → results.
 * Owns one RideScene per run and the audio manager. Pause with Esc / Start.
 */
export class MainGameScene implements GameScene {
  readonly name = 'game';
  private ctx!: SceneContext;
  private flow: Flow = 'boot';
  private input = new InputManager(TUNING.input.deadzone, KEYMAP_SOLO, null);
  private input2 = new InputManager(TUNING.input.deadzone, KEYMAP_P2, 1);
  private split: SplitScene | null = null;
  private lastInput2: Readonly<RiderInput> = NEUTRAL_INPUT;
  private handicap = 1;
  private timeAttack: { stage: 1 | 2; p1Score: number; p2Seconds: number } | null = null;
  private rider2Index = 1;
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
  private trickBook: TrickBookScreen | null = null;
  private riderIndex = 0;
  private boardIndex = 0;
  private lastInput: Readonly<RiderInput> = NEUTRAL_INPUT;
  private prevPause = false;
  private prevMute = false;
  private prevFull = false;
  private menuUpdatedThisFrame = false;

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    this.input.attach(window);
    this.input2.attach(window);
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
      this.beginRun(ctx.params.get('level'), ctx.params.has('seconds') ? Number(ctx.params.get('seconds')) : null);
    } else if (flow === 'push' || flow === 'head') {
      this.boot?.dispose();
      this.boot = null;
      this.beginSplit(flow);
    }
  }

  private beginSplit(mode: SplitMode): void {
    this.menu?.dispose();
    this.menu = null;
    this.ride?.dispose();
    this.ride = null;
    this.input.setKeymap(KEYMAP_P1);
    this.input.gamepadIndex = 0;
    const params = new URLSearchParams(this.ctx.params);
    const beach = this.beaches[this.beachIndex]!;
    params.set('beach', beach.id);
    params.set('ft', String(this.waveFt));
    params.set('rider', this.availableRiders()[this.riderIndex]!.id);
    params.set('rider2', this.availableRiders()[this.rider2Index % this.availableRiders().length]!.id);
    params.set('board', this.availableBoards()[this.boardIndex]!.id);
    params.set('handicap', String(this.handicap));
    if (this.ctx.params.get('auto') === '1') params.set('auto2', '1');
    const pads = InputManager.padCount();
    const hints: [string, string] = [
      pads >= 1 ? 'pad 1' : `keys: ${keymapHint(KEYMAP_P1)}`,
      pads >= 2 ? 'pad 2' : `keys: ${keymapHint(KEYMAP_P2)}`,
    ];
    this.split = new SplitScene(mode, 120, this.audio, hints);
    this.split.init({ ...this.ctx, params });
    this.flow = 'split';
    this.split.onEnd = (r) => {
      this.split?.dispose();
      this.split = null;
      this.input.setKeymap(KEYMAP_SOLO);
      this.input.gamepadIndex = null;
      this.results = new ResultsScreen(
        this.ctx.uiRoot,
        mode === 'push' ? 'PUSH' : 'HEAD TO HEAD',
        r.winner ? `PLAYER ${r.winner} WINS` : 'DRAW',
        [
          { label: 'Player 1', value: r.scores[0].toLocaleString('en-US'), ok: r.winner === 1 },
          { label: 'Player 2', value: r.scores[1].toLocaleString('en-US'), ok: r.winner === 2 },
          ...(mode === 'push' ? [{ label: 'Screen owned', value: `${Math.round(r.shares[0] * 100)}% / ${Math.round(r.shares[1] * 100)}%` }] : []),
        ],
        'A / Space: back to the boat',
      );
      this.results.prime(this.lastInput);
      this.results.onDone = () => {
        this.results?.dispose();
        this.results = null;
        this.startRide(true);
        this.openMenu();
      };
      this.flow = 'results';
    };
  }

  private beginTimeAttack(): void {
    this.timeAttack = { stage: 1, p1Score: 0, p2Seconds: 120 };
    this.freeSurf = false;
    this.beginRun(null, 120, 'PLAYER 1');
  }

  private openMultiplayer(): void {
    this.flow = 'menu';
    this.menu?.dispose();
    const pads = InputManager.padCount();
    this.menu = new MenuScreen(
      this.ctx.uiRoot,
      'MULTIPLAYER',
      [
        { id: 'head', label: 'Head to Head (split screen)', onSelect: () => { this.audio.uiSelect(); this.beginSplit('head'); } },
        { id: 'push', label: 'Push (the divider moves)', onSelect: () => { this.audio.uiSelect(); this.beginSplit('push'); } },
        { id: 'time', label: 'Time Attack (turns)', onSelect: () => { this.audio.uiSelect(); this.beginTimeAttack(); } },
        {
          id: 'rider2',
          label: 'Player 2 surfer',
          value: () => this.availableRiders()[this.rider2Index % this.availableRiders().length]!.name,
          onAdjust: (d) => {
            const n = this.availableRiders().length;
            this.rider2Index = (this.rider2Index + d + n) % n;
            this.audio.uiMove();
          },
        },
        {
          id: 'handicap',
          label: 'Handicap (stats ×)',
          value: () => `${this.handicap.toFixed(2)}`,
          onAdjust: (d) => {
            this.handicap = Math.max(0.6, Math.min(1.4, +(this.handicap + d * 0.1).toFixed(2)));
            this.audio.uiMove();
          },
        },
        { id: 'pads', label: 'Controllers', value: () => `${pads} connected · P1: pad 1 or ${keymapHint(KEYMAP_P1).split(' · ')[0]} · P2: pad 2 or ${keymapHint(KEYMAP_P2).split(' · ')[0]}`, disabled: true },
        { id: 'back', label: 'Back to the boat', onSelect: () => this.openMenu() },
      ],
      'Player 2 keyboard: W/A/S/D move · F jump · G carve · H grab · V slide · R/T spin · B cash in',
    );
    this.menu.prime(this.lastInput);
    this.menu.onBack = () => this.openMenu();
  }

  private openRecords(): void {
    this.menu?.dispose();
    this.menu = null;
    const r = this.career.data.records;
    const rows = [
      { label: 'Best session', value: r.bestScore.toLocaleString('en-US') },
      { label: 'Best chain', value: r.bestChain.toLocaleString('en-US') },
      { label: 'Longest tube', value: `${r.longestTube.toFixed(1)} s` },
      { label: 'Most special time', value: `${r.mostSpecialTime.toFixed(1)} s` },
      ...Object.entries(r.perBeach).map(([b, v]) => ({ label: getBeach(b).name, value: v.toLocaleString('en-US') })),
      ...Object.entries(r.byRider).map(([rid, v]) => ({ label: getRider(rid).name, value: v.toLocaleString('en-US') })),
    ];
    this.results = new ResultsScreen(this.ctx.uiRoot, 'RECORD BOOK', '', rows, 'A / Space: back');
    this.results.prime(this.lastInput);
    this.results.onDone = () => {
      this.results?.dispose();
      this.results = null;
      this.openMenu();
    };
    this.flow = 'results';
  }

  private beaches = (() => {
    const order = ['sandbar', 'pointbreak', 'reefpass', 'cove', 'slab', 'outer'];
    return listBeaches().sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
  })();

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
      if (this.runSeconds) params.set('seconds', String(this.runSeconds));
      else params.delete('seconds');
      if (this.runLabel) params.set('player', this.runLabel);
      else params.delete('player');
      if (this.iconChallenge) params.set('iconChallenge', '1');
      else params.delete('iconChallenge');
      params.set('handicap', this.levelId ? '1' : String(this.handicap));
      const st = this.career.data.stats;
      params.set('boosts', JSON.stringify({ spin: st.spin * 3, speed: st.speed * 3, air: st.air * 3, balance: st.balance * 3 }));
      params.set('learned', this.career.data.rewards.filter((r) => r.startsWith('trick:')).map((r) => r.slice(6)).join(','));
    }
    if (background) params.delete('level');
    params.set('rider', this.availableRiders()[this.riderIndex]!.id);
    params.set('board', this.availableBoards()[this.boardIndex]!.id);
    this.ride = new RideScene();
    this.ride.audio = this.audio;
    this.ride.init({ ...this.ctx, params });
    if (background) this.ride.attract = true;
  }

  private availableRiders() {
    const careerDone = listLevels().every((l) => l.goals.filter((g) => g.required).every((g) => this.career.isGoalDone(l.id, g.id)));
    return listRiders().filter((r) => !r.secret || careerDone || this.ctx.params.get('cheat') === 'riders');
  }

  private availableBoards() {
    return listBoards().filter((b) => b.unlock === 'start' || this.career.data.rewards.includes(b.unlock) || this.ctx.params.get('cheat') === 'boards');
  }

  private statsLine(): string {
    const r = this.availableRiders()[this.riderIndex]!;
    const b = this.availableBoards()[this.boardIndex]!;
    const st = this.career.data.stats;
    const e = effectiveStats(r, b, { spin: st.spin * 3, speed: st.speed * 3, air: st.air * 3, balance: st.balance * 3 }, T.stats);
    return `spin ${statBar(e.spin)}  speed ${statBar(e.speed)}  air ${statBar(e.air)}  balance ${statBar(e.balance)}`;
  }

  private openTrickBook(): void {
    this.menu?.dispose();
    this.menu = null;
    const r = this.availableRiders()[this.riderIndex]!;
    const learned = this.career.data.rewards.filter((x) => x.startsWith('trick:')).map((x) => x.slice(6));
    this.trickBook?.dispose();
    this.trickBook = new TrickBookScreen(this.ctx.uiRoot, new Set([...r.specials, ...learned]));
    this.trickBook.prime(this.lastInput);
    this.trickBook.onBack = () => {
      this.trickBook?.dispose();
      this.trickBook = null;
      this.openMenu();
    };
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
            this.iconChallenge = false;
            this.beginRun();
          },
        },
        {
          id: 'icons',
          label: 'Icon Challenge',
          onSelect: () => {
            this.audio.uiSelect();
            this.freeSurf = false;
            this.iconChallenge = true;
            this.beginRun();
            this.iconChallenge = false;
          },
        },
        {
          id: 'multi',
          label: 'Multiplayer',
          onSelect: () => {
            this.audio.uiSelect();
            this.openMultiplayer();
          },
        },
        {
          id: 'records',
          label: 'Record Book',
          onSelect: () => {
            this.audio.uiSelect();
            this.openRecords();
          },
        },
        {
          id: 'rider',
          label: 'Surfer',
          value: () => {
            const r = this.availableRiders()[this.riderIndex]!;
            return `${r.name} · ${r.archetype}`;
          },
          onAdjust: (d) => {
            const n = this.availableRiders().length;
            this.riderIndex = (this.riderIndex + d + n) % n;
            this.audio.uiMove();
            this.startRide(true);
          },
        },
        {
          id: 'board',
          label: 'Board',
          value: () => {
            const b = this.availableBoards()[this.boardIndex]!;
            return `${b.name} (${this.availableBoards().length}/${listBoards().length})`;
          },
          onAdjust: (d) => {
            const n = this.availableBoards().length;
            this.boardIndex = (this.boardIndex + d + n) % n;
            this.audio.uiMove();
            this.startRide(true);
          },
        },
        { id: 'stats', label: 'Stats', value: () => this.statsLine(), disabled: true },
        {
          id: 'book',
          label: 'Trick Book',
          onSelect: () => {
            this.audio.uiSelect();
            this.openTrickBook();
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

  private runSeconds: number | null = null;
  private runLabel = '';
  private iconChallenge = false;
  private replayRide: RideScene | null = null;
  private replaySeek = 0;
  private replayEnd = 0;
  private replayAccum = 0;
  private replayNav = new MenuNav();

  /** Re-simulate the recorded run from just before its best chain, TV-directed. */
  private playReplay(rec: Recording): void {
    const hl = rec.highlight;
    if (!hl) return;
    const params = new URLSearchParams(rec.params);
    params.set('replay', '1');
    params.delete('attract');
    const ride = new RideScene();
    ride.replay = new ReplayPlayer(rec);
    ride.replayPoints = hl.points;
    ride.init({ ...this.ctx, params, seed: rec.seed });
    this.replayRide = ride;
    this.replaySeek = hl.startFrame;
    this.replayEnd = Math.min(hl.endFrame, hl.startFrame + Math.round(TUNING.replay.maxSeconds * TUNING.sim.hz));
    this.replayAccum = 0;
    this.replayNav.prime(this.lastInput);
    if (this.results) this.results.root.style.display = 'none';
    this.ride?.setHudVisible(false);
    this.audio.uiSelect();
    this.flow = 'replay';
  }

  private stepReplay(inp: Readonly<RiderInput>, dt: number): void {
    const r = this.replayRide;
    if (!r) return;
    if (r.frameIndex < this.replaySeek) {
      // rewind: silent fast-forward to the start of the highlight
      for (let i = 0; i < 400 && r.frameIndex < this.replaySeek; i++) r.step(dt);
      if (r.frameIndex >= this.replaySeek) r.audio = this.audio;
    } else {
      this.replayAccum += r.replaySpeed;
      while (this.replayAccum >= 1) {
        r.step(dt);
        this.replayAccum -= 1;
      }
    }
    const n = this.replayNav.read(inp, dt);
    if (r.frameIndex >= this.replayEnd || n.select || n.back) this.endReplay();
  }

  private endReplay(): void {
    this.replayRide?.dispose();
    this.replayRide = null;
    this.ride?.setHudVisible(true);
    if (this.results) {
      this.results.root.style.display = '';
      this.results.prime(this.lastInput);
    }
    this.flow = 'results';
  }

  private beginRun(levelId: string | null = null, seconds: number | null = null, label = ''): void {
    this.menu?.dispose();
    this.menu = null;
    this.careerMenu?.dispose();
    this.careerMenu = null;
    this.levelId = levelId;
    this.runSeconds = seconds;
    this.runLabel = label;
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
    if (this.timeAttack) {
      const ta = this.timeAttack;
      if (ta.stage === 1) {
        ta.p1Score = run.score;
        ta.p2Seconds = timeAttackSeconds(120, run.score, 1 / 1500, 30);
        ta.stage = 2;
        this.results = new ResultsScreen(this.ctx.uiRoot, 'TIME ATTACK', run.score.toLocaleString('en-US'), [
          { label: 'Player 1 score', value: run.score.toLocaleString('en-US') },
          { label: 'Player 2 gets', value: `${Math.round(ta.p2Seconds)} s` },
        ], 'A / Space: player 2, you are up');
        this.results.prime(this.lastInput);
        this.results.onDone = () => {
          this.results?.dispose();
          this.results = null;
          this.riderIndex = this.rider2Index % this.availableRiders().length;
          this.beginRun(null, Math.round(ta.p2Seconds), 'PLAYER 2');
        };
        return;
      }
      const p2 = run.score;
      const winner = p2 === ta.p1Score ? null : p2 > ta.p1Score ? 2 : 1;
      this.timeAttack = null;
      this.results = new ResultsScreen(this.ctx.uiRoot, 'TIME ATTACK', winner ? `PLAYER ${winner} WINS` : 'DRAW', [
        { label: 'Player 1', value: ta.p1Score.toLocaleString('en-US'), ok: winner === 1 },
        { label: 'Player 2', value: p2.toLocaleString('en-US'), ok: winner === 2 },
      ], 'A / Space: back to the boat');
      this.results.prime(this.lastInput);
      this.results.onDone = () => {
        this.results?.dispose();
        this.results = null;
        this.startRide(true);
        this.openMenu();
      };
      return;
    }
    const broken = this.career.recordSession(beach.id, this.availableRiders()[this.riderIndex]!.id, {
      score: run.score,
      bestChain: run.bestChain,
      longestTube: run.longestTube,
      specialTime: run.meter.totalYellowSeconds,
    });
    for (const b of broken) goalRows.push({ label: 'New record', value: b, ok: true });
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
    const rec = this.ride.recording();
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
      rec.highlight ? 'A / Space: back to the boat · L / Y: replay of the best chain' : 'A / Space: back to the boat',
    );
    this.results.prime(this.lastInput);
    if (rec.highlight) this.results.onAlt = () => this.playReplay(rec);
    if (rec.highlight && this.ctx.params.get('autoreplay') === '1') this.playReplay(rec);
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
            if (this.split) {
              const mode = this.split['mode' as keyof SplitScene] as unknown as SplitMode;
              this.split.dispose();
              this.split = null;
              this.beginSplit(mode);
            } else this.beginRun(this.levelId, this.runSeconds, this.runLabel);
          },
        },
        {
          id: 'end',
          label: 'End session',
          onSelect: () => {
            this.closePause();
            if (this.split) for (const r of this.split.rides) r.run.end('ended');
            else this.ride?.run.end('ended');
          },
        },
        {
          id: 'boat',
          label: 'Back to the boat',
          onSelect: () => {
            this.closePause();
            this.split?.dispose();
            this.split = null;
            this.timeAttack = null;
            this.input.setKeymap(KEYMAP_SOLO);
            this.input.gamepadIndex = null;
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
    if (this.flow === 'paused') this.flow = this.split ? 'split' : 'ride';
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
        this.trickBook?.update(inp, dt);
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
        const pausePressed = (inp.pause || this.lastInput2.pause) && !this.prevPause;
        if (pausePressed) this.closePause();
        else this.pause?.update(inp, dt);
        break;
      }
      case 'results':
        this.ride?.step(dt);
        this.results?.update(inp, dt);
        break;
      case 'replay':
        this.stepReplay(inp, dt);
        break;
      case 'split': {
        const pausePressed = (inp.pause || this.lastInput2.pause) && !this.prevPause;
        if (pausePressed) this.openPause();
        else {
          this.split?.setInputs(inp, this.lastInput2);
          this.split?.step(dt);
        }
        break;
      }
      case 'interstitial':
        break;
    }
    this.prevPause = inp.pause || this.lastInput2.pause;
  }

  render(alpha: number): void {
    const inp = this.input.poll();
    this.lastInput = { ...inp };
    this.lastInput2 = { ...this.input2.poll() };
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
    if (this.replayRide) this.replayRide.render();
    else if (this.split) this.split.render();
    else this.ride?.render();
  }

  cameras(): THREE.PerspectiveCamera[] {
    if (this.replayRide) return this.replayRide.cameras();
    return this.split ? [] : (this.ride?.cameras() ?? []);
  }

  dispose(): void {
    this.replayRide?.dispose();
    this.ride?.dispose();
    this.menu?.dispose();
    this.pause?.dispose();
    this.results?.dispose();
    this.trickBook?.dispose();
    this.boot?.dispose();
    this.split?.dispose();
    this.input.detach(window);
    this.input2.detach(window);
  }

  debugState(): Record<string, unknown> {
    return {
      flow: this.flow,
      ride: this.ride?.debugState(),
      replay: this.replayRide ? { frame: this.replayRide.frameIndex, seek: this.replaySeek, end: this.replayEnd, ...this.replayRide.debugState() } : null,
    };
  }
}
