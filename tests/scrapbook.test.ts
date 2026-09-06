import { describe, expect, it } from 'vitest';
import { Scrapbook } from '@/save/scrapbook';
import type { Storage } from '@/save/career';

function mem(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

describe('scrapbook', () => {
  it('keeps newest first, caps the count and survives a reload', () => {
    const s = mem();
    const book = new Scrapbook(s, 3);
    for (let i = 1; i <= 5; i++) book.add({ data: `d${i}`, value: i * 100, caption: `shot ${i}`, beach: 'Sandbar Inlet', rider: 'Kai' });
    expect(book.photos.map((p) => p.caption)).toEqual(['shot 5', 'shot 4', 'shot 3']);
    const again = new Scrapbook(s, 3);
    expect(again.photos.length).toBe(3);
    again.remove(again.photos[0]!.id);
    expect(new Scrapbook(s, 3).photos.map((p) => p.caption)).toEqual(['shot 4', 'shot 3']);
  });

  it('drops the oldest photo when the store refuses', () => {
    const s = mem();
    let calls = 0;
    const quota: Storage = {
      getItem: s.getItem,
      setItem: (k, v) => {
        calls++;
        if (calls === 3) throw new Error('QuotaExceeded');
        s.setItem(k, v);
      },
    };
    const book = new Scrapbook(quota, 10);
    book.add({ data: 'a', value: 0, caption: 'a', beach: 'b', rider: 'r' });
    book.add({ data: 'b', value: 0, caption: 'b', beach: 'b', rider: 'r' });
    expect(book.add({ data: 'c', value: 0, caption: 'c', beach: 'b', rider: 'r' })).toBe(true);
    expect(book.photos.map((p) => p.caption)).toEqual(['c', 'b']);
  });
});
