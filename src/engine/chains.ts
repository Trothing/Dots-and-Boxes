import type { Board } from './board';
import type { GameState } from './state';

export class ChainAnalyzer {
  readonly board: Board;
  readonly compOf: Int16Array;
  readonly compLen: Int16Array;
  readonly compCycle: Uint8Array;
  readonly compOpen: Uint8Array;
  compCount = 0;
  remaining = 0;
  private readonly stack: Int16Array;

  constructor(board: Board) {
    this.board = board;
    this.compOf = new Int16Array(board.numBoxes);
    this.compLen = new Int16Array(board.numBoxes);
    this.compCycle = new Uint8Array(board.numBoxes);
    this.compOpen = new Uint8Array(board.numBoxes);
    this.stack = new Int16Array(board.numBoxes);
  }

  analyze(s: GameState): void {
    const { numBoxes, boxEdges, edgeBoxes } = this.board;
    const sides = s.sides;
    const edges = s.edges;
    const compOf = this.compOf;
    compOf.fill(-1);
    this.compCount = 0;
    let remaining = 0;
    for (let b = 0; b < numBoxes; b++) if ((sides[b] as number) < 4) remaining++;
    this.remaining = remaining;

    for (let start = 0; start < numBoxes; start++) {
      const st = sides[start] as number;
      if (st < 2 || st > 3 || (compOf[start] as number) >= 0) continue;
      const id = this.compCount++;
      let sp = 0;
      let len = 0;
      let open = 0;
      let cycle = 1;
      this.stack[sp++] = start;
      compOf[start] = id;
      while (sp > 0) {
        const x = this.stack[--sp] as number;
        len++;
        if (sides[x] === 3) open = 1;
        let linked = 0;
        for (let k = 0; k < 4; k++) {
          const e = boxEdges[x * 4 + k] as number;
          if (edges[e]) continue;
          const b0 = edgeBoxes[e * 2] as number;
          const y = b0 === x ? (edgeBoxes[e * 2 + 1] as number) : b0;
          if (y < 0) continue;
          const sy = sides[y] as number;
          if (sy < 2 || sy > 3) continue;
          linked++;
          if ((compOf[y] as number) < 0) {
            compOf[y] = id;
            this.stack[sp++] = y;
          }
        }
        if (linked !== 2) cycle = 0;
      }
      this.compLen[id] = len;
      this.compCycle[id] = cycle;
      this.compOpen[id] = open;
    }
  }

  sacrificeSize(s: GameState, e: number): number {
    const eb = this.board.edgeBoxes;
    let size = 0;
    for (let k = 0; k < 2; k++) {
      const b = eb[e * 2 + k] as number;
      if (b >= 0 && s.sides[b] === 2) {
        const len = this.compLen[this.compOf[b] as number] as number;
        if (len > size) size = len;
      }
    }
    return size;
  }

  isHalfHearted(s: GameState, e: number): boolean {
    const eb = this.board.edgeBoxes;
    let twoSided = -1;
    let count = 0;
    for (let k = 0; k < 2; k++) {
      const b = eb[e * 2 + k] as number;
      if (b < 0) continue;
      const sb = s.sides[b] as number;
      if (sb === 3) return false;
      if (sb === 2) {
        twoSided = b;
        count++;
      }
    }
    if (count !== 1) return false;
    const id = this.compOf[twoSided] as number;
    return this.compLen[id] === 2 && this.compCycle[id] === 0;
  }
}

const analyzers = new WeakMap<Board, ChainAnalyzer>();

export function getAnalyzer(board: Board): ChainAnalyzer {
  let a = analyzers.get(board);
  if (!a) {
    a = new ChainAnalyzer(board);
    analyzers.set(board, a);
  }
  return a;
}

export interface ChainInfo {
  boxes: number[];
  length: number;
  kind: 'chain' | 'cycle';
  isLong: boolean;
  isOpen: boolean;
}

export function analyzeChains(s: GameState): ChainInfo[] {
  const a = getAnalyzer(s.board);
  a.analyze(s);
  const infos: ChainInfo[] = [];
  for (let id = 0; id < a.compCount; id++) {
    const boxes: number[] = [];
    for (let b = 0; b < s.board.numBoxes; b++) if (a.compOf[b] === id) boxes.push(b);
    const cycle = a.compCycle[id] === 1;
    infos.push({
      boxes,
      length: a.compLen[id] as number,
      kind: cycle ? 'cycle' : 'chain',
      isLong: cycle || (a.compLen[id] as number) >= 3,
      isOpen: a.compOpen[id] === 1,
    });
  }
  return infos;
}

export function sacrificeSize(s: GameState, e: number): number {
  const a = getAnalyzer(s.board);
  a.analyze(s);
  return a.sacrificeSize(s, e);
}

export function isHalfHeartedHandout(s: GameState, e: number): boolean {
  const a = getAnalyzer(s.board);
  a.analyze(s);
  return a.isHalfHearted(s, e);
}

export function otherOpenEdge(s: GameState, b: number, e: number): number {
  const be = s.board.boxEdges;
  for (let k = 0; k < 4; k++) {
    const f = be[b * 4 + k] as number;
    if (f !== e && !s.edges[f]) return f;
  }
  return -1;
}
