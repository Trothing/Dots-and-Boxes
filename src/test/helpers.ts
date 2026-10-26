import { applyMove, createState, legalMoves, undoMove, type GameState, type Rng } from '../engine';
import type { SearchSettings } from '../ai/config';

export function randomPosition(rows: number, cols: number, free: number, rng: Rng): GameState {
  const s = createState(rows, cols);
  while (s.freeEdges > free) applyMove(s, rng.pick(legalMoves(s)));
  return s;
}

export function exactValue(s: GameState, memo: Map<string, number> = new Map()): number {
  if (s.freeEdges === 0) return 0;
  const key = `${s.hashLo},${s.hashHi}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  let best = -Infinity;
  for (let e = 0; e < s.board.numEdges; e++) {
    if (s.edges[e]) continue;
    const k = applyMove(s, e);
    const v = k > 0 ? k + exactValue(s, memo) : -exactValue(s, memo);
    undoMove(s, e);
    if (v > best) best = v;
  }
  memo.set(key, best);
  return best;
}

export function moveValues(s: GameState): Map<number, number> {
  const memo = new Map<string, number>();
  const out = new Map<number, number>();
  for (let e = 0; e < s.board.numEdges; e++) {
    if (s.edges[e]) continue;
    const k = applyMove(s, e);
    out.set(e, k > 0 ? k + exactValue(s, memo) : -exactValue(s, memo));
    undoMove(s, e);
  }
  return out;
}

export const PLAIN_SETTINGS: SearchSettings = {
  movePolicy: 'all',
  ordering: 'none',
  evalKind: 'hard',
  maxDepth: 64,
  timeBudgetMs: Infinity,
  iterative: false,
  pruning: true,
  useTT: false,
  ttBits: 16,
  exactLimit: 0,
  exactTimeShare: 1,
  sacrificeSafeMax: Infinity,
  earlyStopFactor: 0,
};
