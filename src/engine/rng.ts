export function createRng32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

export interface Rng {
  float(): number;
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  const next = createRng32(seed);
  return {
    float: () => next() / 4294967296,
    int: (n) => Math.floor((next() / 4294967296) * n),
    pick: (items) => items[Math.floor((next() / 4294967296) * items.length)] as never,
  };
}
