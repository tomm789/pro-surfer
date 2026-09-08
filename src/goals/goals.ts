/**
 * Goals and levels as data (design doc §9.2). Evaluators subscribe to run/rider/trick events and report
 * progress; the GoalTracker owns one evaluator per goal for a run.
 */
import { z } from 'zod';
import type { EventBus } from '@/core/events';
import type { RiderEvents } from '@/rider/rider';
import type { TrickEvents } from '@/tricks/executor';
import type { RunEvents, RunController } from '@/scoring/run';
import type { WaveModel } from '@/wave/wave';
import { SKY_NAMES } from '@/world/beach';

const base = {
  id: z.string(),
  required: z.boolean().default(false),
  reward: z.string().optional(),
  label: z.string().optional(),
  /** Shown on the HUD while this is the next goal to do (lessons). Written for the dual-stick scheme. */
  hint: z.string().optional(),
  /** The same hint for the classic single-stick scheme, when the two differ. */
  hintClassic: z.string().optional(),
};

export const GoalSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('score'), target: z.number() }),
  z.object({ ...base, type: z.literal('gromLocal'), grom: z.number(), local: z.number() }),
  z.object({ ...base, type: z.literal('sectionScore'), section: z.enum(['air', 'face', 'tube']), target: z.number() }),
  z.object({ ...base, type: z.literal('noWipeout'), seconds: z.number(), score: z.number() }),
  z.object({ ...base, type: z.literal('specialTime'), seconds: z.number() }),
  z.object({ ...base, type: z.literal('rotation'), degrees: z.union([z.literal(360), z.literal(540), z.literal(720)]), count: z.number().int() }),
  z.object({ ...base, type: z.literal('learnTrick'), trick: z.string(), count: z.number().int().default(3) }),
  z.object({ ...base, type: z.literal('sectionSurvival'), count: z.number().int() }),
  z.object({ ...base, type: z.literal('tubeTime'), seconds: z.number() }),
  z.object({ ...base, type: z.literal('icons'), count: z.number().int(), score: z.number().default(0), hints: z.boolean().default(true) }),
  z.object({ ...base, type: z.literal('photo'), target: z.number(), shots: z.number().int().default(3), mode: z.enum(['sum', 'best']).default('sum'), special: z.boolean().default(false) }),
  z.object({ ...base, type: z.literal('contest'), place: z.number().int(), opponentTop: z.number().default(20000) }),
  z.object({ ...base, type: z.literal('objects'), object: z.string(), action: z.enum(['spray', 'splash', 'smash', 'jump']), count: z.number().int() }),
  /**
   * Zoned venues (the pool): something done in a named section of the lap. `tube` counts seconds
   * barrelled there; `air` counts airs launched from there and landed; `turn` counts recognised face
   * turns there (optionally one named `trick`); `trick` counts any trick landed there.
   */
  z.object({
    ...base,
    type: z.literal('zone'),
    zone: z.enum(['barrel', 'wall', 'ramp']),
    what: z.enum(['tube', 'air', 'turn', 'trick']),
    count: z.number().int().default(1),
    seconds: z.number().optional(),
    trick: z.string().optional(),
  }),
  /** Tutorial steps (M10): a basic skill performed `count` times; `value` is the threshold for speed / spin degrees / chain length. */
  z.object({
    ...base,
    type: z.literal('lesson'),
    skill: z.enum(['stand', 'speed', 'air', 'trick', 'spin', 'floater', 'cashIn', 'special']),
    section: z.enum(['air', 'face', 'tube']).optional(),
    value: z.number().default(1),
    count: z.number().int().default(1),
  }),
]);

export type Goal = z.infer<typeof GoalSchema>;

export const LevelSchema = z.object({
  id: z.string(),
  beach: z.string(),
  name: z.string(),
  order: z.number(),
  waveFt: z.number(),
  seconds: z.number().default(180),
  goals: z.array(GoalSchema).min(1),
  /** Levels unlocked when this level's required goal is completed. */
  unlocks: z.array(z.string()).default([]),
  intro: z.string().optional(),
  /** Tutorial lessons live outside the career world map. */
  lesson: z.boolean().default(false),
  /** Time of day for this level, overriding the beach's own sky; the sun can move with it. */
  sky: z.enum(SKY_NAMES).optional(),
  sunElevationDeg: z.number().optional(),
  sunAzimuthDeg: z.number().optional(),
});

export type Level = z.infer<typeof LevelSchema>;

export interface GoalProgress {
  goal: Goal;
  label: string;
  current: number;
  target: number;
  done: boolean;
  /** Extra text e.g. "grom ✓ local ✗". */
  detail?: string;
  /** For gromLocal: 0 none, 1 grom, 2 local. */
  tier?: number;
}

export interface GoalEvents extends Record<string, unknown> {
  goalDone: { goal: Goal; progress: GoalProgress };
  goalFailed: { goal: Goal; reason: string };
  goalProgress: { progress: GoalProgress };
}

export interface GoalContext {
  run: RunController;
  riderEvents: EventBus<RiderEvents>;
  trickEvents: EventBus<TrickEvents>;
  runEvents: EventBus<RunEvents>;
  wave: WaveModel;
  /** Live rider u for section survival. */
  riderU: () => number;
  riderState: () => string;
  /** Provided by the M6b systems; undefined until they exist. */
  extra?: {
    riderSpeed?: () => number;
    iconsCleared?: () => number;
    iconsFailed?: () => boolean;
    photoTotal?: () => number;
    photoBest?: () => number;
    photoSpecialBest?: () => number;
    contestPlace?: () => number | null;
    objectHits?: (object: string, action: string) => number;
  };
}

/** Plain names for the recogniser's turn ids, for zone goal labels. */
const TURN_WORDS: Record<string, string> = {
  bottomTurn: 'bottom turn',
  snap: 'snap',
  offTheLip: 'off-the-lip',
  cutback: 'cutback',
  roundhouse: 'roundhouse',
  tailSlide: 'tail slide',
  layback: 'layback',
  carve: 'carve',
};

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

function zoneLabel(g: Extract<Goal, { type: 'zone' }>): string {
  const where = g.zone === 'barrel' ? 'in the barrel section' : g.zone === 'ramp' ? 'off the ramp' : 'on the wall';
  const s = g.count > 1 ? 's' : '';
  switch (g.what) {
    case 'tube':
      return `Get barrelled for ${g.seconds ?? 1}s ${where}`;
    case 'air':
      return `Land ${g.count} air${s} ${where}`;
    case 'turn':
      return g.trick ? `Land ${g.count} ${TURN_WORDS[g.trick] ?? g.trick}${s} ${where}` : `Land ${g.count} turn${s} ${where}`;
    case 'trick':
      return `Land ${g.count} trick${s} ${where}`;
  }
}

export function goalLabel(g: Goal): string {
  if (g.label) return g.label;
  switch (g.type) {
    case 'score':
      return `Score ${g.target.toLocaleString('en-US')}`;
    case 'gromLocal':
      return `Beat the Grom ${g.grom.toLocaleString('en-US')} · Local ${g.local.toLocaleString('en-US')}`;
    case 'sectionScore':
      return `${g.target.toLocaleString('en-US')} ${g.section} points`;
    case 'noWipeout':
      return `Ride ${g.seconds}s without wiping out and score ${g.score.toLocaleString('en-US')}`;
    case 'specialTime':
      return `Keep the special meter maxed for ${g.seconds}s`;
    case 'rotation':
      return `Land ${g.count} × ${g.degrees}`;
    case 'learnTrick':
      return `Learn the trick: pull it ${g.count}×`;
    case 'sectionSurvival':
      return `Survive ${g.count} close-outs`;
    case 'tubeTime':
      return `Spend ${g.seconds}s in the tube`;
    case 'icons':
      return `Clear ${g.count} icons${g.score ? ` + ${g.score.toLocaleString('en-US')}` : ''}`;
    case 'photo':
      return `${g.target.toLocaleString('en-US')} in ${g.mode === 'best' ? 'one photo' : `${g.shots} photos`}${g.special ? ' (special trick)' : ''}`;
    case 'contest':
      return `Place ${ordinal(g.place)}${g.place > 1 ? '+' : ''}`;
    case 'objects':
      return `${g.action[0]!.toUpperCase()}${g.action.slice(1)} ${g.count} ${g.object}s`;
    case 'zone':
      return zoneLabel(g);
    case 'lesson':
      switch (g.skill) {
        case 'stand':
          return 'Stand up';
        case 'speed':
          return `Reach ${g.value} m/s`;
        case 'air':
          return `Land ${g.count} air${g.count > 1 ? 's' : ''}`;
        case 'trick':
          return `Land ${g.count} ${g.section ?? ''} trick${g.count > 1 ? 's' : ''}`;
        case 'spin':
          return `Land a ${g.value}`;
        case 'floater':
          return `Ride ${g.count} floater${g.count > 1 ? 's' : ''}`;
        case 'cashIn':
          return `Cash in a ${g.value}-trick chain`;
        case 'special':
          return `Land ${g.count} special trick${g.count > 1 ? 's' : ''}`;
      }
  }
}

/** One evaluator per goal; `update` is called every sim step and returns fresh progress. */
export class GoalTracker {
  readonly progress: GoalProgress[] = [];
  private done = new Set<string>();
  private failed = new Set<string>();
  private rotations = new Map<number, number>();
  private learnCount = 0;
  private survived = 0;
  private trackedSections = new Map<number, 'pending' | 'passed'>();
  private tubeSeconds = 0;
  private lessonCounts = new Map<string, number>();
  private maxSpeed = 0;
  /** Zone goals: seconds barrelled per zone, counts per goal id, and where the current air took off. */
  private zoneTube = { barrel: 0, wall: 0, ramp: 0 };
  private zoneCounts = new Map<string, number>();
  private launchZone: 'barrel' | 'wall' | 'ramp' | null = null;

  private bump(pred: (g: Extract<Goal, { type: 'lesson' }>) => boolean): void {
    for (const g of this.level.goals) if (g.type === 'lesson' && pred(g)) this.lessonCounts.set(g.id, (this.lessonCounts.get(g.id) ?? 0) + 1);
  }

  constructor(
    readonly level: Level,
    private ctx: GoalContext,
    private events: EventBus<GoalEvents>,
  ) {
    for (const g of level.goals) this.progress.push({ goal: g, label: goalLabel(g), current: 0, target: this.targetOf(g), done: false });
    ctx.riderEvents.on('launch', (e) => (this.launchZone = ctx.wave.zoneAt(e.u)));
    ctx.riderEvents.on('land', (e) => {
      if (e.rating === 'wipeout') return;
      const deg = e.spins180 * 180;
      for (const d of [360, 540, 720]) if (deg >= d) this.rotations.set(d, (this.rotations.get(d) ?? 0) + 1);
      this.bump((g) => g.skill === 'air' || (g.skill === 'spin' && deg >= g.value));
      // an air belongs to the section it took off from, not where it came down
      for (const g of level.goals) if (g.type === 'zone' && g.what === 'air' && this.launchZone === g.zone) this.zoneCounts.set(g.id, (this.zoneCounts.get(g.id) ?? 0) + 1);
      this.launchZone = null;
    });
    ctx.trickEvents.on('trickLand', (e) => {
      for (const g of level.goals) if (g.type === 'learnTrick' && g.trick === e.trick.id) this.learnCount++;
      this.bump((g) => (g.skill === 'trick' && (!g.section || e.section === g.section)) || (g.skill === 'special' && e.trick.special));
      const zone = ctx.wave.zoneAt(ctx.riderU());
      for (const g of level.goals) {
        if (g.type !== 'zone' || g.zone !== zone) continue;
        const hit = (g.what === 'turn' && e.section === 'face' && (!g.trick || g.trick === e.trick.id)) || (g.what === 'trick' && (!g.trick || g.trick === e.trick.id));
        if (hit) this.zoneCounts.set(g.id, (this.zoneCounts.get(g.id) ?? 0) + 1);
      }
    });
    ctx.riderEvents.on('stand', () => this.bump((g) => g.skill === 'stand'));
    ctx.riderEvents.on('floaterEnd', () => this.bump((g) => g.skill === 'floater'));
    ctx.runEvents.on('chainBanked', (b) => this.bump((g) => g.skill === 'cashIn' && b.cashedIn && b.entries.length >= g.value));
    ctx.riderEvents.on('wipeout', (e) => {
      if (e.reason === 'closeout') {
        // the section that got us is no longer survivable
        for (const [id, st] of this.trackedSections) if (st === 'pending') this.trackedSections.set(id, 'passed');
      }
    });
  }

  private targetOf(g: Goal): number {
    switch (g.type) {
      case 'score':
        return g.target;
      case 'gromLocal':
        return g.local;
      case 'sectionScore':
        return g.target;
      case 'noWipeout':
        return g.seconds;
      case 'specialTime':
        return g.seconds;
      case 'rotation':
        return g.count;
      case 'learnTrick':
        return g.count;
      case 'sectionSurvival':
        return g.count;
      case 'tubeTime':
        return g.seconds;
      case 'icons':
        return g.count;
      case 'photo':
        return g.target;
      case 'contest':
        return g.place;
      case 'objects':
        return g.count;
      case 'zone':
        return g.what === 'tube' ? (g.seconds ?? 1) : g.count;
      case 'lesson':
        return g.skill === 'speed' ? g.value : g.count;
    }
  }

  /** The hint of the next unfinished goal that has one (lessons), for the scheme in use. */
  activeHint(scheme: 'dual' | 'classic' = 'dual'): string | null {
    for (const p of this.progress) {
      if (p.done) continue;
      const h = scheme === 'classic' ? (p.goal.hintClassic ?? p.goal.hint) : p.goal.hint;
      if (h) return h;
    }
    return null;
  }

  update(dt: number): void {
    const run = this.ctx.run;
    // section survival bookkeeping: a section that spawned ahead and is now behind the rider (not wiped) counts
    const u = this.ctx.riderU();
    for (const s of this.ctx.wave.sections) {
      if (!this.trackedSections.has(s.id) && s.u > u) this.trackedSections.set(s.id, 'pending');
    }
    for (const [id, st] of this.trackedSections) {
      if (st !== 'pending') continue;
      const s = this.ctx.wave.sections.find((x) => x.id === id);
      const front = s ? s.u + s.halfWidth : -Infinity;
      if (s && u > front + 1 && this.ctx.riderState() !== 'wipeout') {
        this.trackedSections.set(id, 'passed');
        this.survived++;
      } else if (!s) this.trackedSections.set(id, 'passed'); // merged into the curl (we outran it or it closed)
    }
    if (this.ctx.riderState() === 'tube') {
      this.tubeSeconds += dt;
      this.zoneTube[this.ctx.wave.zoneAt(u)] += dt;
    }
    if (this.ctx.riderState() === 'face') this.maxSpeed = Math.max(this.maxSpeed, this.ctx.extra?.riderSpeed?.() ?? 0);

    for (const p of this.progress) {
      const g = p.goal;
      let current = 0;
      let done = false;
      switch (g.type) {
        case 'score':
          current = run.score;
          done = current >= g.target;
          break;
        case 'gromLocal':
          current = run.score;
          p.tier = current >= g.local ? 2 : current >= g.grom ? 1 : 0;
          p.detail = p.tier === 2 ? 'Local beaten' : p.tier === 1 ? 'Grom beaten' : '';
          done = p.tier >= 1;
          break;
        case 'sectionScore':
          current = run.bySection[g.section];
          done = current >= g.target;
          break;
        case 'noWipeout':
          current = Math.max(run.rideSeconds, run.longestRide);
          done = run.rideSeconds >= g.seconds && run.score >= g.score;
          p.detail = g.score > 0 ? `${run.rideSeconds.toFixed(0)}s · ${run.score.toLocaleString('en-US')}/${g.score.toLocaleString('en-US')}` : `${run.rideSeconds.toFixed(0)}s / ${g.seconds}s`;
          break;
        case 'specialTime':
          current = run.meter.totalYellowSeconds;
          done = current >= g.seconds;
          break;
        case 'rotation':
          current = this.rotations.get(g.degrees) ?? 0;
          done = current >= g.count;
          break;
        case 'learnTrick':
          current = this.learnCount;
          done = current >= g.count;
          break;
        case 'sectionSurvival':
          current = this.survived;
          done = current >= g.count;
          break;
        case 'tubeTime':
          current = this.tubeSeconds;
          done = current >= g.seconds;
          break;
        case 'icons':
          current = this.ctx.extra?.iconsCleared?.() ?? 0;
          done = current >= g.count && run.score >= g.score;
          if (this.ctx.extra?.iconsFailed?.() && !this.failed.has(g.id)) {
            this.failed.add(g.id);
            this.events.emit('goalFailed', { goal: g, reason: 'icon stack overflowed' });
          }
          break;
        case 'photo':
          current = g.special ? (this.ctx.extra?.photoSpecialBest?.() ?? 0) : g.mode === 'best' ? (this.ctx.extra?.photoBest?.() ?? 0) : (this.ctx.extra?.photoTotal?.() ?? 0);
          done = current >= g.target;
          break;
        case 'contest': {
          const place = this.ctx.extra?.contestPlace?.() ?? null;
          current = place ?? 0;
          done = place !== null && place <= g.place;
          break;
        }
        case 'objects':
          current = this.ctx.extra?.objectHits?.(g.object, g.action) ?? 0;
          done = current >= g.count;
          break;
        case 'zone':
          current = g.what === 'tube' ? this.zoneTube[g.zone] : (this.zoneCounts.get(g.id) ?? 0);
          done = current >= (g.what === 'tube' ? (g.seconds ?? 1) : g.count);
          break;
        case 'lesson':
          current = g.skill === 'speed' ? this.maxSpeed : (this.lessonCounts.get(g.id) ?? 0);
          done = current >= (g.skill === 'speed' ? g.value : g.count);
          break;
      }
      p.current = current;
      if (done && !this.done.has(g.id) && !this.failed.has(g.id)) {
        this.done.add(g.id);
        p.done = true;
        this.events.emit('goalDone', { goal: g, progress: p });
      }
      p.done = this.done.has(g.id);
    }
  }

  get requiredDone(): boolean {
    return this.level.goals.filter((g) => g.required).every((g) => this.done.has(g.id));
  }

  completedIds(): string[] {
    return [...this.done];
  }

  /** Short HUD lines. */
  hudLines(): string[] {
    return this.progress.map((p) => {
      const mark = p.done ? '✓' : p.goal.required ? '★' : '·';
      let prog: string;
      if (p.goal.type === 'gromLocal') prog = `${p.current.toLocaleString('en-US')}  ${p.detail ?? ''}`.trim();
      else if (p.goal.type === 'noWipeout') prog = p.detail ?? '';
      else if (p.target > 999) prog = `${Math.round(p.current).toLocaleString('en-US')} / ${p.target.toLocaleString('en-US')}`;
      else {
        const g = p.goal;
        const fractional = g.type === 'specialTime' || g.type === 'tubeTime' || (g.type === 'lesson' && g.skill === 'speed') || (g.type === 'zone' && g.what === 'tube');
        prog = `${fractional ? p.current.toFixed(1) : Math.round(p.current)} / ${p.target}`;
      }
      return `${mark} ${p.label}   ${prog}`;
    });
  }
}
