import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { WaveModel, makeSurfaceSample, waveParamsFromBeach } from '@/wave/wave';
import { makeProfile, facePoint, faceNormal, faceSlope, buildProfileRows, allocRows, ROW_COUNT, crestHeight } from '@/wave/profile';
import { getBeach, listBeaches } from '@/world/beaches';

describe('profile geometry', () => {
  const mellow = makeProfile({ H: 2.5, phi: Math.PI * 0.56, aspect: 1.6, lipThickness: 0.2, backLength: 5, broken: 0 });
  const barrel = makeProfile({ H: 3, phi: Math.PI * 1.6, aspect: 1.1, lipThickness: 0.3, backLength: 6, broken: 0 });

  it('puts the trough at the origin and the lip at height H', () => {
    const p = { d: 0, y: 0 };
    facePoint(mellow, 0, p);
    expect(p.d).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    facePoint(mellow, 1, p);
    expect(p.y).toBeCloseTo(mellow.H, 5);
    expect(crestHeight(barrel)).toBeGreaterThanOrEqual(barrel.H);
  });

  it('face height increases monotonically with v and steepens toward the lip', () => {
    const p = { d: 0, y: 0 };
    let prevY = -1;
    let prevSlope = -1;
    for (let v = 0; v <= 1.0001; v += 0.05) {
      facePoint(mellow, v, p);
      expect(p.y).toBeGreaterThan(prevY);
      prevY = p.y;
      const s = faceSlope(mellow, v);
      expect(s).toBeGreaterThanOrEqual(prevSlope - 1e-9);
      prevSlope = s;
    }
    expect(faceSlope(mellow, 0)).toBeCloseTo(0, 3);
    expect(faceSlope(mellow, 1)).toBeGreaterThan(Math.PI / 2 - 0.01);
  });

  it('face normal points shoreward (+d) and up on the lower face', () => {
    const n = { d: 0, y: 0 };
    faceNormal(mellow, 0.3, n);
    expect(n.d).toBeGreaterThan(0);
    expect(n.y).toBeGreaterThan(0);
    faceNormal(barrel, 0.4, n);
    expect(n.d).toBeGreaterThan(0);
  });

  it('builds a full cross-section without NaNs and with the face rows marked', () => {
    const rows = allocRows();
    for (const prof of [mellow, barrel]) {
      buildProfileRows(prof, rows);
      expect(rows).toHaveLength(ROW_COUNT);
      let faceRows = 0;
      for (const r of rows) {
        expect(Number.isFinite(r.d) && Number.isFinite(r.y)).toBe(true);
        if (r.faceMask) faceRows++;
      }
      expect(faceRows).toBeGreaterThan(8);
      // barrel's roof rows exist and hang over the face
      if (prof === barrel) expect(rows.some((r) => r.tubeMask === 1 && r.y > prof.H * 0.6)).toBe(true);
    }
  });
});

describe('WaveModel', () => {
  function make(id: string, height = 2.4, seed = 7) {
    const beach = getBeach(id);
    const params = waveParamsFromBeach(beach, height, { warnSeconds: 2.5 });
    return new WaveModel(params, new Rng(seed), 0);
  }

  it('loads the beach data files', () => {
    expect(listBeaches().length).toBeGreaterThanOrEqual(2);
  });

  it('peels: the curl advances at break speed', () => {
    const w = make('sandbar');
    for (let i = 0; i < 60; i++) w.step(1 / 60);
    expect(w.curlU).toBeCloseTo(w.params.breakSpeed, 3);
  });

  it('is broken behind the curl and clean well ahead of it', () => {
    const w = make('sandbar');
    w.step(1 / 60);
    const behind = w.fields(w.curlU - 20);
    const ahead = w.fields(w.curlU + 40);
    expect(behind.broken).toBeCloseTo(1, 3);
    expect(ahead.broken).toBe(0);
    expect(ahead.hollow).toBe(0);
    expect(ahead.H).toBeGreaterThan(2);
  });

  it('a hollow beach forms a tube just ahead of the curl, a mellow one much less so', () => {
    const hollow = make('reefpass', 3);
    const mellow = make('sandbar', 3);
    hollow.step(1 / 60);
    mellow.step(1 / 60);
    const uh = hollow.curlU + 2;
    const um = mellow.curlU + 2;
    expect(hollow.fields(uh).tube).toBeGreaterThan(0.6);
    expect(mellow.fields(um).tube).toBeLessThan(hollow.fields(uh).tube);
    expect(hollow.fields(uh + 60).tube).toBe(0);
  });

  it('left-handers mirror x', () => {
    const left = make('reefpass');
    const pos = { x: 0, y: 0, z: 0 };
    left.position(10, 0.5, pos);
    expect(pos.x).toBeCloseTo(-10);
    expect(pos.z).toBeGreaterThan(0); // up the face is back toward the ocean (+z)
  });

  it('surface frame: normal points out of the water, tangents orthonormal', () => {
    const w = make('sandbar');
    w.step(1 / 60);
    const s = makeSurfaceSample();
    w.sample(w.curlU + 15, 0.4, s);
    expect(s.n.y).toBeGreaterThan(0);
    expect(s.n.z).toBeLessThan(0); // shoreward
    const dot = s.tu.x * s.tv.x + s.tu.y * s.tv.y + s.tu.z * s.tv.z;
    expect(Math.abs(dot)).toBeLessThan(0.05);
    expect(Math.hypot(s.tu.x, s.tu.y, s.tu.z)).toBeCloseTo(1, 5);
    expect(s.slope).toBeGreaterThan(0.2);
  });

  it('schedules sections deterministically and merges them into the curl (close-out)', () => {
    const a = make('reefpass', 3, 11);
    const b = make('reefpass', 3, 11);
    let spawned = 0;
    for (let i = 0; i < 60 * 90; i++) {
      a.step(1 / 60, a.curlU + 12);
      b.step(1 / 60, b.curlU + 12);
      if (a.sections.length > spawned) spawned = a.sections.length;
    }
    expect(a.curlU).toBeCloseTo(b.curlU, 9);
    expect(a.mergedSections).toBeGreaterThan(0);
    // close-outs make the curl run ahead of pure break speed
    expect(a.curlU).toBeGreaterThan(a.params.breakSpeed * 90 + 1);
  });

  it('never produces NaN across the whole rendered window', () => {
    const w = make('reefpass', 4, 3);
    const s = makeSurfaceSample();
    for (let i = 0; i < 60 * 20; i++) w.step(1 / 60, w.curlU + 8);
    for (let du = -40; du <= 90; du += 0.5) {
      for (let v = 0; v <= 1; v += 0.25) {
        w.sample(w.curlU + du, v, s);
        expect(Number.isFinite(s.pos.x + s.pos.y + s.pos.z + s.n.x + s.n.y + s.n.z)).toBe(true);
      }
    }
  });
});
