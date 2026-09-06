/** Scrapbook (design doc §2 presentation): in-game photos kept in localStorage as small JPEG data URLs. */
import type { Storage } from './career';

export interface ScrapbookPhoto {
  id: number;
  /** JPEG data URL thumbnail. */
  data: string;
  value: number;
  caption: string;
  beach: string;
  rider: string;
  /** ISO date. */
  when: string;
}

const KEY = 'lineup.scrapbook.v1';

const memory = new Map<string, string>();
const memoryStorage: Storage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
};

export class Scrapbook {
  photos: ScrapbookPhoto[] = [];
  private storage: Storage;

  constructor(
    storage?: Storage,
    /** Oldest photos are dropped beyond this many. */
    readonly capacity = 24,
  ) {
    this.storage = storage ?? pickStorage();
    this.load();
  }

  private load(): void {
    try {
      const raw = this.storage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as { photos?: ScrapbookPhoto[] }) : null;
      this.photos = Array.isArray(parsed?.photos) ? parsed!.photos : [];
    } catch {
      this.photos = [];
    }
  }

  /** Newest first. Returns false if the store refused (quota). */
  add(p: Omit<ScrapbookPhoto, 'id' | 'when'>): boolean {
    const id = (this.photos[0]?.id ?? 0) + 1;
    this.photos.unshift({ ...p, id, when: new Date().toISOString() });
    while (this.photos.length > this.capacity) this.photos.pop();
    return this.save();
  }

  remove(id: number): void {
    this.photos = this.photos.filter((p) => p.id !== id);
    this.save();
  }

  clear(): void {
    this.photos = [];
    this.save();
  }

  private save(): boolean {
    try {
      this.storage.setItem(KEY, JSON.stringify({ photos: this.photos }));
      return true;
    } catch {
      // quota: drop the oldest and retry once
      if (this.photos.length > 1) {
        this.photos.pop();
        try {
          this.storage.setItem(KEY, JSON.stringify({ photos: this.photos }));
          return true;
        } catch {
          /* give up */
        }
      }
      return false;
    }
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
