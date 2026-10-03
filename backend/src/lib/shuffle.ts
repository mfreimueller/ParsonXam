// Seeded Fisher-Yates (mulberry32): the same attempt always sees the same piece order.
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Mixes the attempt's seed with a puzzle id so each puzzle gets its own order. */
export function puzzleSeed(attemptSeed: number, puzzleId: number): number {
  return (Math.imul(attemptSeed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(puzzleId, 0xc2b2ae35)) >>> 0;
}
