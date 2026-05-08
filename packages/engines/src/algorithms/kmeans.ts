/**
 * Lloyd's k-means — determinism contract (Q-30.3, ADR-0031):
 *   - Input sorted by id ASC before processing
 *   - First k sorted points = initial centroids
 *   - Iteration cap: 20
 *   - Tie-break on equal distance: lower group index wins
 *   - No Math.random
 */

export interface KMeansPoint {
  id: string;
  features: number[];
}

export interface KMeansGroup {
  centroid: number[];
  memberIds: string[];
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function computeCentroid(pts: KMeansPoint[]): number[] {
  if (pts.length === 0) return [];
  const dim = pts[0]!.features.length;
  const sums = new Array<number>(dim).fill(0);
  for (const p of pts) {
    for (let i = 0; i < dim; i++) {
      sums[i]! += p.features[i] ?? 0;
    }
  }
  return sums.map((s) => s / pts.length);
}

export function kMeans(points: KMeansPoint[], k: number): KMeansGroup[] {
  if (points.length === 0 || k <= 0) return [];
  const actualK = Math.min(k, points.length);
  const sorted = [...points].sort((a, b) => a.id.localeCompare(b.id));
  let centroids: number[][] = sorted.slice(0, actualK).map((p) => [...p.features]);
  let assignments: number[] = new Array<number>(sorted.length).fill(0);

  for (let iter = 0; iter < 20; iter++) {
    const next: number[] = sorted.map((p) => {
      let best = 0;
      let bestDist = euclideanDistance(p.features, centroids[0]!);
      for (let g = 1; g < actualK; g++) {
        const d = euclideanDistance(p.features, centroids[g]!);
        if (d < bestDist) {
          bestDist = d;
          best = g;
        }
      }
      return best;
    });

    let changed = false;
    for (let i = 0; i < sorted.length; i++) {
      if (next[i] !== assignments[i]) { changed = true; break; }
    }
    assignments = next;
    if (!changed) break;

    const buckets: KMeansPoint[][] = Array.from({ length: actualK }, () => []);
    for (let i = 0; i < sorted.length; i++) buckets[assignments[i]!]!.push(sorted[i]!);
    centroids = buckets.map((g, idx) => (g.length > 0 ? computeCentroid(g) : centroids[idx]!));
  }

  const buckets: KMeansPoint[][] = Array.from({ length: actualK }, () => []);
  for (let i = 0; i < sorted.length; i++) buckets[assignments[i]!]!.push(sorted[i]!);

  return buckets.map((g, idx) => ({
    centroid: centroids[idx]!,
    memberIds: g.map((p) => p.id),
  }));
}
