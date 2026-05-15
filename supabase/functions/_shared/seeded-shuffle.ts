/**
 * Deterministic seeded Fisher-Yates shuffle — v1.1-S2 / ADR-0036 Decision 5.
 *
 * Used by content-svc `/content/select` to compose practice-exam sessions: the
 * composer needs random-uniform selection within each difficulty band while
 * still satisfying ADR-0022 replay-determinism (no `Math.random`, no
 * `Date.now`). Seeding by `session_id` (ADR-0036 Decision 4) means the same
 * session always assembles the same item list — replay safe.
 *
 * Implementation:
 * - `hashSeed(str)`: FNV-1a 32-bit hash over the UTF-8 bytes of the seed. Pure
 *   string → uint32. Stable across runtimes (Deno + Node Vitest).
 * - `mulberry32(state)`: well-known 32-bit PRNG with a 2^32 period and good
 *   distribution properties (Bernstein 2017). Returns a closure that yields
 *   the next [0, 1) float on each call.
 * - `seededShuffle(arr, seed)`: in-place Fisher-Yates using `mulberry32(hashSeed(seed))`.
 *   Returns a new array (does not mutate the input).
 *
 * Why not crypto.randomUUID() or crypto.getRandomValues? Both are
 * non-deterministic and would break replay tests + Stage 28 worker-replay.
 *
 * Spec/ADR refs:
 * - ADR-0022 — engines + selection layer are pure-function namespaces, no Math.random.
 * - ADR-0036 §Decision 4 — seed source = session_id.
 * - ADR-0036 §Decision 5 — random uniform within difficulty band via seeded Fisher-Yates.
 */

/**
 * FNV-1a 32-bit hash. Pure, deterministic. Stable across runtimes.
 * Input: any UTF-8 string. Output: uint32 (0..2^32-1) as a signed 32-bit
 * integer (JS Number; we re-mask in mulberry32 anyway).
 *
 * The empty string hashes to the FNV-1a offset basis (0x811c9dc5 = 2166136261)
 * — non-zero, so mulberry32 has a valid seed even for empty inputs.
 */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5; // FNV offset basis (uint32)
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    // FNV prime = 16777619; force into 32-bit using Math.imul.
    h = Math.imul(h, 16777619);
  }
  // Convert signed 32-bit back to unsigned 32-bit.
  return h >>> 0;
}

/**
 * Mulberry32 PRNG. Returns a function that yields the next [0, 1) float.
 * Period 2^32. Good enough for selection-layer determinism; not suitable
 * for cryptographic use.
 */
export function mulberry32(seedUint32: number): () => number {
  let a = seedUint32 >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher-Yates shuffle. Returns a new array (input unmodified).
 * Same `seed` + same input length → same output ordering, always.
 *
 * Seed is any stable string (typically `session_id`). Empty seed is permitted
 * (FNV offset basis seeds the PRNG with a non-zero value).
 */
export function seededShuffle<T>(input: readonly T[], seed: string): T[] {
  const out = input.slice();
  if (out.length < 2) return out;
  const rng = mulberry32(hashSeed(seed));
  // Classic Fisher-Yates: iterate from end to start; swap with rng-picked index in [0, i].
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
