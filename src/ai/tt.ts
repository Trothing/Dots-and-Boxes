export const NO_MOVE = -1;
export const SOLVED_DEPTH = 1000;
export const VALUE_INF = 1e9;

export class TranspositionTable {
  readonly size: number;
  private readonly mask: number;
  private readonly keyLo: Int32Array;
  private readonly keyHi: Int32Array;
  readonly lower: Float32Array;
  readonly upper: Float32Array;
  readonly depth: Int16Array;
  readonly move: Int16Array;
  private readonly age: Uint8Array;
  private generation = 0;

  constructor(bits: number) {
    this.size = 1 << bits;
    this.mask = this.size - 1;
    this.keyLo = new Int32Array(this.size);
    this.keyHi = new Int32Array(this.size);
    this.lower = new Float32Array(this.size);
    this.upper = new Float32Array(this.size);
    this.depth = new Int16Array(this.size).fill(-1);
    this.move = new Int16Array(this.size).fill(NO_MOVE);
    this.age = new Uint8Array(this.size);
  }

  clear(): void {
    this.depth.fill(-1);
    this.generation = 0;
    this.age.fill(0);
  }

  newSearch(): void {
    this.generation = (this.generation + 1) & 0xff;
  }

  private bucket(lo: number, hi: number): number {
    return ((lo ^ Math.imul(hi, 0x9e3779b1)) & this.mask) & ~1;
  }

  probe(lo: number, hi: number): number {
    const i = this.bucket(lo, hi);
    if (this.depth[i] >= 0 && this.keyLo[i] === lo && this.keyHi[i] === hi) return i;
    if (this.depth[i + 1] >= 0 && this.keyLo[i + 1] === lo && this.keyHi[i + 1] === hi) return i + 1;
    return -1;
  }

  store(lo: number, hi: number, depth: number, lower: number, upper: number, move: number): void {
    const i = this.bucket(lo, hi);
    let slot = -1;
    for (let k = i; k <= i + 1; k++) {
      if (this.depth[k] >= 0 && this.keyLo[k] === lo && this.keyHi[k] === hi) {
        slot = k;
        break;
      }
    }
    if (slot >= 0) {
      const d = this.depth[slot] as number;
      if (depth < d) {
        if (this.move[slot] === NO_MOVE && move !== NO_MOVE) this.move[slot] = move;
        return;
      }
      if (depth === d) {
        const l = Math.max(lower, this.lower[slot] as number);
        const u = Math.min(upper, this.upper[slot] as number);
        if (l <= u) {
          lower = l;
          upper = u;
        }
        if (move === NO_MOVE) move = this.move[slot] as number;
      }
    } else {
      const a = i;
      const b = i + 1;
      if (this.depth[a] < 0) slot = a;
      else if (this.depth[b] < 0) slot = b;
      else {
        const staleA = this.age[a] !== this.generation;
        const staleB = this.age[b] !== this.generation;
        if (staleA !== staleB) slot = staleA ? a : b;
        else slot = (this.depth[a] as number) <= (this.depth[b] as number) ? a : b;
      }
    }
    this.keyLo[slot] = lo;
    this.keyHi[slot] = hi;
    this.depth[slot] = depth;
    this.lower[slot] = lower;
    this.upper[slot] = upper;
    this.move[slot] = move;
    this.age[slot] = this.generation;
  }
}
