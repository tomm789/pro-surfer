import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { EventBus } from '@/core/events';
import { IconStack } from '@/goals/icons';
import { PhotoDirector } from '@/goals/photo';
import { Contest } from '@/goals/contest';
import { ObjectField, type ObjectEvents } from '@/world/objects';
import { TRICKS } from '@/tricks/catalogue';
import { listLevels } from '@/goals/levels';
import { listBeaches } from '@/world/beaches';

const DT = 1 / 60;

describe('icon stack', () => {
  const opts = { stackSize: 4, dropIntervalSeconds: 2, weights: { air: 1, face: 1, tube: 1, special: 1 }, total: 0 };
  it('drops icons on schedule, clears the bottom one with a matching trick, fails when full', () => {
    const s = new IconStack(opts, new Rng(4));
    for (let i = 0; i < 60 * 2; i++) s.step(DT, false);
    expect(s.stack.length).toBe(1);
    const bottom = s.stack[0]!;
    const trick = TRICKS.all.find((t) => (t.special ? 'special' : t.icon) === bottom)!;
    expect(s.onTrick(trick, false)).toBe(true);
    expect(s.cleared).toBe(1);
    expect(s.stack.length).toBe(0);
    for (let i = 0; i < 60 * 12; i++) s.step(DT, false);
    expect(s.failed).toBe(true);
  });
  it('wrong-type tricks do not clear', () => {
    const s = new IconStack({ ...opts, weights: { air: 1, face: 0, tube: 0, special: 0 } }, new Rng(1));
    for (let i = 0; i < 60 * 2; i++) s.step(DT, false);
    expect(s.stack[0]).toBe('air');
    expect(s.onTrick(TRICKS.get('snap'), false)).toBe(false);
    expect(s.onTrick(TRICKS.get('indy'), false)).toBe(true);
  });
});

describe('photo director', () => {
  it('schedules shots across the run, counts beeps and scores the subject at the shutter', () => {
    const p = new PhotoDirector({ shots: 3, beeps: 4, beepIntervalSeconds: 0.8, runSeconds: 180 });
    expect(p.nextShotAt).toBeCloseTo(12 + 156 * 0.25, 5);
    let t = 0;
    const cues: string[] = [];
    const subject = () => ({ trick: { id: 'indy', name: 'Indy Grab', base: 300, special: false }, multiplier: 4, inTube: false, tubeDepth: 0, inAir: true, landedRecently: false, wipedOut: false });
    while (t < 60) {
      const c = p.step(DT, t, subject);
      if (c) cues.push(c);
      t += DT;
    }
    expect(cues.filter((c) => c === 'beep').length).toBe(3);
    expect(cues.filter((c) => c === 'shutter').length).toBe(1);
    expect(p.shots.length).toBe(1);
    expect(p.shots[0]!.value).toBeGreaterThan(600);
    expect(p.total).toBe(p.shots[0]!.value);
  });
});

describe('contest', () => {
  it('scores best two waves per heat and ranks against seeded opponents', () => {
    const c = new Contest({ heats: 3, heatSeconds: 90, opponentTop: 20000, opponents: 3, names: ['A', 'B', 'C'] }, new Rng(9));
    c.addToWave(5000);
    c.endWave();
    c.addToWave(12000);
    c.endWave();
    c.addToWave(3000);
    const h1 = c.endHeat();
    expect(h1.score).toBe(17000);
    expect(c.heat).toBe(1);
    expect(c.place()).toBeGreaterThanOrEqual(1);
    expect(c.place()).toBeLessThanOrEqual(4);
    c.addToWave(60000);
    c.endHeat();
    c.addToWave(60000);
    c.endHeat();
    expect(c.finished).toBe(true);
    expect(c.place()).toBe(1);
    expect(c.standings()[0]!.you).toBe(true);
  });
});

describe('object field', () => {
  function field(kinds: Parameters<typeof ObjectField.prototype.spawn>[0][] = []) {
    const ev = new EventBus<ObjectEvents>();
    const hits: string[] = [];
    let collisions = 0;
    ev.on('objectHit', (e) => hits.push(`${e.object.kind}:${e.action}`));
    ev.on('objectCollision', () => collisions++);
    const f = new ObjectField(kinds, new Rng(2), ev, 20);
    return { f, hits, get collisions() { return collisions; } };
  }
  it('sprays when carving past, jumps when airborne over, splashes on landing near, collides with solids', () => {
    const r = field();
    const { f, hits } = r;
    f.spawn('windsurfer', 10, 0.1);
    f.step(DT, 7, 0.2, false, true, false, -50, 8);
    expect(hits).toContain('windsurfer:spray');
    f.spawn('turtle', 30, 0.1);
    f.step(DT, 30, 0.5, true, false, false, -50, 8);
    expect(hits).toContain('turtle:jump');
    f.spawn('tuber', 50, 0.05);
    f.step(DT, 51, 0.1, false, false, true, -50, 8);
    expect(hits).toContain('tuber:splash');
    f.spawn('jetski', 70, 0.05);
    f.step(DT, 70.2, 0.05, false, false, false, -50, 8);
    expect(r.collisions).toBe(1);
    expect(f.count('windsurfer', 'spray')).toBe(1);
  });
  it('spawns on a schedule ahead of the rider and removes objects swallowed by the whitewater', () => {
    const { f } = field(['kayak']);
    for (let i = 0; i < 60 * 30; i++) f.step(DT, 100, 0.3, false, false, false, 60, 8);
    expect(f.objects.length).toBeGreaterThanOrEqual(1);
    for (const o of f.objects) expect(o.u).toBeGreaterThan(100);
    for (let i = 0; i < 60 * 2; i++) f.step(DT, 300, 0.3, false, false, false, 250, 8);
    expect(f.objects.filter((o) => o.u < 247).length).toBe(0);
  });
});

describe('career data integrity', () => {
  it('every level references known beaches and hazards used by object goals exist at that beach', () => {
    const beaches = new Map(listBeaches().map((b) => [b.id, b]));
    for (const l of listLevels()) {
      const b = beaches.get(l.beach)!;
      expect(b).toBeDefined();
      for (const g of l.goals) if (g.type === 'objects') expect(b.hazards).toContain(g.object);
    }
    expect(listLevels().length).toBe(15);
  });
});
