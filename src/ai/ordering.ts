export const KEY_TT = 2_000_000_000;
export const KEY_CAPTURE = 1_500_000_000;
export const KEY_SAFE = 1_000_000_000;
export const KEY_SACRIFICE_SORTED = 500_000_000;
export const KEY_SACRIFICE_PLAIN = 100_000_000;
export const KEY_SACRIFICE_STEP = 1_000_000;

const HISTORY_CAP = 900_000;
const HISTORY_RESCALE_AT = 1_000_000_000;
const HISTORY_MAX_DEPTH = 20;

export class HistoryTable {
  private readonly counts: Int32Array;

  constructor(numEdges: number) {
    this.counts = new Int32Array(numEdges);
  }

  clear(): void {
    this.counts.fill(0);
  }

  get(e: number, cap: number = HISTORY_CAP): number {
    return Math.min(this.counts[e] as number, cap);
  }

  bump(e: number, depth: number): void {
    const d = depth > HISTORY_MAX_DEPTH ? HISTORY_MAX_DEPTH : depth;
    const h = (this.counts[e] as number) + d * d;
    this.counts[e] = h;
    if (h > HISTORY_RESCALE_AT) for (let i = 0; i < this.counts.length; i++) this.counts[i] = (this.counts[i] as number) >> 1;
  }
}
