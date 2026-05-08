import { describe, it, expect } from 'vitest';
import { kMeans } from '../algorithms/kmeans.js';

describe('kMeans', () => {
  it('returns empty array for empty input', () => {
    expect(kMeans([], 3)).toEqual([]);
  });

  it('caps group count at number of points when k > n', () => {
    const pts = [
      { id: 'a', features: [1, 0] },
      { id: 'b', features: [0, 1] },
    ];
    const groups = kMeans(pts, 5);
    expect(groups.length).toBe(2);
    const allIds = groups.flatMap((g) => g.memberIds).sort();
    expect(allIds).toEqual(['a', 'b']);
  });

  it('produces identical output regardless of input order (determinism)', () => {
    const base = [
      { id: 'z', features: [0.9, 0.1] },
      { id: 'a', features: [0.1, 0.9] },
      { id: 'm', features: [0.5, 0.5] },
    ];
    const shuffled = [base[2]!, base[0]!, base[1]!];
    const r1 = kMeans(base, 2);
    const r2 = kMeans(shuffled, 2);
    const ids = (res: ReturnType<typeof kMeans>) =>
      res.map((g) => [...g.memberIds].sort().join(',')).sort();
    expect(ids(r1)).toEqual(ids(r2));
  });

  it('produces 4 groups when k=4 and N >= 4 (Spec §14.1 max_groups=4)', () => {
    const pts = [
      { id: 'a', features: [0.1, 0.1] },
      { id: 'b', features: [0.9, 0.1] },
      { id: 'c', features: [0.1, 0.9] },
      { id: 'd', features: [0.9, 0.9] },
    ];
    const groups = kMeans(pts, 4);
    expect(groups.length).toBe(4);
    const allIds = groups.flatMap((g) => g.memberIds).sort();
    expect(allIds).toEqual(['a', 'b', 'c', 'd']);
  });

  it('converges clearly separable clusters into correct groups', () => {
    const pts = [
      { id: 'lo1', features: [0.05, 0.05] },
      { id: 'lo2', features: [0.10, 0.08] },
      { id: 'hi1', features: [0.92, 0.90] },
      { id: 'hi2', features: [0.88, 0.93] },
    ];
    const groups = kMeans(pts, 2);
    expect(groups.length).toBe(2);
    const groupIds = groups.map((g) => [...g.memberIds].sort());
    const hasLow = groupIds.some((g) => g.includes('lo1') && g.includes('lo2') && !g.includes('hi1'));
    expect(hasLow).toBe(true);
  });
});
