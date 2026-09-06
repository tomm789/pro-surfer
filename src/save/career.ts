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
    unlockedLevels: ['sandbar-1'],
    completedGoals: {},
    rewards: [],
    bestScores: {},
    rider: 'kai',
    board: 'thruster',
    stats: { spin: 0, speed: 0, air: 0, balance: 0 },
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
      return { ...defaultCareer(), ...parsed };
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
