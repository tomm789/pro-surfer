/** Career save: unlocked levels, completed goals, rewards, records. localStorage with an in-memory fallback. */
export interface CareerData {
  version: 1;
  unlockedLevels: string[];
  completedGoals: Record<string, string[]>;
  rewards: string[];
  bestScores: Record<string, number>;
  rider: string;
  board: string;
  stats: { spin: number; speed: number; air: number; balance: number };
  records: { bestScore: number; bestChain: number; longestTube: number; mostSpecialTime: number; perBeach: Record<string, number>; byRider: Record<string, number> };
  /**
   * Player options (docs/MECHANICS.md §9). `feet` says which stick is the back foot; `press` which
   * way on a stick presses that foot into the board (down is the default and the documented rule).
   */
  options: { controls: 'dual' | 'classic'; camera: 'chase' | 'first'; assists: boolean; feet: 'left-back' | 'left-front'; press: 'down' | 'up'; reducedMotion: boolean };
}

const KEY = 'lineup.career.v1';

export interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const memory = new Map<string, string>();
const memoryStorage: Storage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
};

export function defaultCareer(): CareerData {
  return {
    version: 1,
    unlockedLevels: ['wavepool-1', 'sandbar-1', 'lesson-1'],
    completedGoals: {},
    rewards: [],
    bestScores: {},
    rider: 'kai',
    board: 'thruster',
    stats: { spin: 0, speed: 0, air: 0, balance: 0 },
    records: { bestScore: 0, bestChain: 0, longestTube: 0, mostSpecialTime: 0, perBeach: {}, byRider: {} },
    options: { controls: 'dual', camera: 'chase', assists: true, feet: 'left-back', press: 'down', reducedMotion: false },
  };
}

export class CareerSave {
  data: CareerData;
  private storage: Storage;

  constructor(storage?: Storage) {
    this.storage = storage ?? pickStorage();
    this.data = this.load();
  }

  private load(): CareerData {
    try {
      const raw = this.storage.getItem(KEY);
      if (!raw) return defaultCareer();
      const parsed = JSON.parse(raw) as Partial<CareerData>;
      if (parsed.version !== 1) return defaultCareer();
      const base = defaultCareer();
      return { ...base, ...parsed, options: { ...base.options, ...(parsed.options ?? {}) } };
    } catch {
      return defaultCareer();
    }
  }

  save(): void {
    try {
      this.storage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private mode etc. */
    }
  }

  /** The whole save as JSON, for the clipboard. */
  exportJson(): string {
    return JSON.stringify(this.data);
  }

  /**
   * Replace the save with an exported blob. Returns false (and changes nothing) for anything that is
   * not a version-1 save; missing fields fall back to the defaults the same way a stored save does.
   */
  importJson(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as Partial<CareerData>;
      if (!parsed || typeof parsed !== 'object' || parsed.version !== 1 || !Array.isArray(parsed.unlockedLevels)) return false;
      const base = defaultCareer();
      this.data = { ...base, ...parsed, options: { ...base.options, ...(parsed.options ?? {}) } };
      this.save();
      return true;
    } catch {
      return false;
    }
  }

  isUnlocked(levelId: string): boolean {
    return this.data.unlockedLevels.includes(levelId);
  }

  isGoalDone(levelId: string, goalId: string): boolean {
    return (this.data.completedGoals[levelId] ?? []).includes(goalId);
  }

  /** Record a run's outcome. Returns newly unlocked level ids and newly earned rewards. */
  recordRun(levelId: string, score: number, completed: { goalId: string; reward?: string; required: boolean }[], unlocks: string[]): { newLevels: string[]; newRewards: string[] } {
    const d = this.data;
    d.bestScores[levelId] = Math.max(d.bestScores[levelId] ?? 0, score);
    const done = new Set(d.completedGoals[levelId] ?? []);
    const newRewards: string[] = [];
    let requiredDone = false;
    for (const c of completed) {
      done.add(c.goalId);
      if (c.required) requiredDone = true;
      if (c.reward && !d.rewards.includes(c.reward)) {
        d.rewards.push(c.reward);
        newRewards.push(c.reward);
        this.applyReward(c.reward);
      }
    }
    d.completedGoals[levelId] = [...done];
    const newLevels: string[] = [];
    if (requiredDone) {
      for (const u of unlocks) {
        if (!d.unlockedLevels.includes(u)) {
          d.unlockedLevels.push(u);
          newLevels.push(u);
        }
      }
    }
    this.save();
    return { newLevels, newRewards };
  }

  /** Record book (design doc §10): per-rider and per-beach bests. Returns which records were broken. */
  recordSession(beachId: string, riderId: string, s: { score: number; bestChain: number; longestTube: number; specialTime: number }): string[] {
    const r = this.data.records;
    const broken: string[] = [];
    if (s.score > r.bestScore) {
      r.bestScore = s.score;
      broken.push('best score');
    }
    if (s.bestChain > r.bestChain) {
      r.bestChain = s.bestChain;
      broken.push('best chain');
    }
    if (s.longestTube > r.longestTube) {
      r.longestTube = s.longestTube;
      broken.push('longest tube');
    }
    if (s.specialTime > r.mostSpecialTime) {
      r.mostSpecialTime = s.specialTime;
      broken.push('most special time');
    }
    if (s.score > (r.perBeach[beachId] ?? 0)) {
      r.perBeach[beachId] = s.score;
      broken.push(`${beachId} record`);
    }
    if (s.score > (r.byRider[riderId] ?? 0)) r.byRider[riderId] = s.score;
    this.save();
    return broken;
  }

  private applyReward(reward: string): void {
    const [kind, what] = reward.split(':');
    if (kind === 'stat' && what && what in this.data.stats) {
      const k = what as keyof CareerData['stats'];
      this.data.stats[k] = Math.min(1, this.data.stats[k] + 0.1);
    }
  }

  reset(): void {
    this.data = defaultCareer();
    this.save();
  }
}

function pickStorage(): Storage {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.getItem(KEY);
      return localStorage;
    }
  } catch {
    /* fall through */
  }
  return memoryStorage;
}
