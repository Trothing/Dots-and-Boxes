import { type Board, getBoard } from './board';
import { ZOBRIST_HI, ZOBRIST_LO } from './zobrist';

export type Player = 0 | 1;

export interface GameState {
  readonly board: Board;
  readonly edges: Uint8Array;
  readonly sides: Uint8Array;
  readonly owner: Int8Array;
  readonly scores: Int32Array;
  toMove: Player;
  freeEdges: number;
  hashLo: number;
  hashHi: number;
}

export function createState(rows: number, cols: number): GameState {
  const board = getBoard(rows, cols);
  return {
    board,
    edges: new Uint8Array(board.numEdges),
    sides: new Uint8Array(board.numBoxes),
    owner: new Int8Array(board.numBoxes).fill(-1),
    scores: new Int32Array(2),
    toMove: 0,
    freeEdges: board.numEdges,
    hashLo: 0,
    hashHi: 0,
  };
}

export function cloneState(s: GameState): GameState {
  return {
    board: s.board,
    edges: s.edges.slice(),
    sides: s.sides.slice(),
    owner: s.owner.slice(),
    scores: s.scores.slice(),
    toMove: s.toMove,
    freeEdges: s.freeEdges,
    hashLo: s.hashLo,
    hashHi: s.hashHi,
  };
}

export function fromEdges(
  rows: number,
  cols: number,
  edges: Iterable<number>,
  toMove: Player = 0,
  scores: readonly [number, number] = [0, 0],
): GameState {
  const s = createState(rows, cols);
  const eb = s.board.edgeBoxes;
  for (const e of edges) {
    if (e < 0 || e >= s.board.numEdges) throw new Error(`Line ${e} does not exist`);
    if (s.edges[e]) throw new Error(`Line ${e} was set twice`);
    s.edges[e] = 1;
    s.freeEdges--;
    s.hashLo ^= ZOBRIST_LO[e] as number;
    s.hashHi ^= ZOBRIST_HI[e] as number;
    const b0 = eb[e * 2] as number;
    const b1 = eb[e * 2 + 1] as number;
    s.sides[b0]++;
    if (b1 >= 0) s.sides[b1]++;
  }
  s.toMove = toMove;
  s.scores[0] = scores[0];
  s.scores[1] = scores[1];
  return s;
}

export function applyMove(s: GameState, e: number): number {
  const eb = s.board.edgeBoxes;
  s.edges[e] = 1;
  s.freeEdges--;
  s.hashLo ^= ZOBRIST_LO[e] as number;
  s.hashHi ^= ZOBRIST_HI[e] as number;
  let captured = 0;
  const b0 = eb[e * 2] as number;
  const b1 = eb[e * 2 + 1] as number;
  if (++s.sides[b0] === 4) {
    s.owner[b0] = s.toMove;
    captured++;
  }
  if (b1 >= 0 && ++s.sides[b1] === 4) {
    s.owner[b1] = s.toMove;
    captured++;
  }
  if (captured > 0) s.scores[s.toMove] += captured;
  else s.toMove = (1 - s.toMove) as Player;
  return captured;
}

export function undoMove(s: GameState, e: number): void {
  const eb = s.board.edgeBoxes;
  let captured = 0;
  const b0 = eb[e * 2] as number;
  const b1 = eb[e * 2 + 1] as number;
  if (s.sides[b0] === 4) {
    s.owner[b0] = -1;
    captured++;
  }
  s.sides[b0]--;
  if (b1 >= 0) {
    if (s.sides[b1] === 4) {
      s.owner[b1] = -1;
      captured++;
    }
    s.sides[b1]--;
  }
  if (captured > 0) s.scores[s.toMove] -= captured;
  else s.toMove = (1 - s.toMove) as Player;
  s.edges[e] = 0;
  s.freeEdges++;
  s.hashLo ^= ZOBRIST_LO[e] as number;
  s.hashHi ^= ZOBRIST_HI[e] as number;
}

export function isGameOver(s: GameState): boolean {
  return s.freeEdges === 0;
}

export function winner(s: GameState): Player | 'draw' {
  const a = s.scores[0] as number;
  const b = s.scores[1] as number;
  return a === b ? 'draw' : a > b ? 0 : 1;
}

export type EdgeKind = 'capture' | 'safe' | 'sacrifice';

export function edgeKind(s: GameState, e: number): EdgeKind {
  const eb = s.board.edgeBoxes;
  const b0 = eb[e * 2] as number;
  const b1 = eb[e * 2 + 1] as number;
  const s0 = s.sides[b0] as number;
  const s1 = b1 >= 0 ? (s.sides[b1] as number) : 0;
  if (s0 === 3 || s1 === 3) return 'capture';
  return s0 <= 1 && s1 <= 1 ? 'safe' : 'sacrifice';
}

function movesOfKind(s: GameState, kind: EdgeKind | null): number[] {
  const out: number[] = [];
  for (let e = 0; e < s.board.numEdges; e++) {
    if (!s.edges[e] && (kind === null || edgeKind(s, e) === kind)) out.push(e);
  }
  return out;
}

export const legalMoves = (s: GameState): number[] => movesOfKind(s, null);
export const capturableMoves = (s: GameState): number[] => movesOfKind(s, 'capture');
export const safeMoves = (s: GameState): number[] => movesOfKind(s, 'safe');
export const sacrificeMoves = (s: GameState): number[] => movesOfKind(s, 'sacrifice');

export function countSafeMoves(s: GameState): number {
  const eb = s.board.edgeBoxes;
  let n = 0;
  for (let e = 0; e < s.board.numEdges; e++) {
    if (s.edges[e]) continue;
    const b1 = eb[e * 2 + 1] as number;
    if ((s.sides[eb[e * 2] as number] as number) <= 1 && (b1 < 0 || (s.sides[b1] as number) <= 1)) n++;
  }
  return n;
}
