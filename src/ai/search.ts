import { ChainAnalyzer } from '../engine/chains';
import type { Board } from '../engine/board';
import { applyMove, undoMove, type GameState } from '../engine/state';
import { AI_CONFIG, type EvalSettings, type SearchSettings } from './config';
import { evalMedium, HardEvaluator } from './eval';
import {
  HistoryTable,
  KEY_CAPTURE,
  KEY_SACRIFICE_PLAIN,
  KEY_SACRIFICE_SORTED,
  KEY_SACRIFICE_STEP,
  KEY_SAFE,
  KEY_TT,
} from './ordering';
import { NO_MOVE, SOLVED_DEPTH, TranspositionTable, VALUE_INF } from './tt';

export { SOLVED_DEPTH };

export interface SearchResult {
  move: number;
  value: number | null;
  depth: number;
  nodes: number;
  timeMs: number;
  ttHits: number;
  ttProbes: number;
  exact: boolean;
}

export interface SearchProgress {
  depth: number;
  nodes: number;
  value: number;
  timeMs: number;
}

const TIME_CHECK_MASK = 511;

export class Searcher {
  readonly board: Board;
  readonly settings: SearchSettings;
  readonly tt: TranspositionTable | null;
  nodes = 0;
  ttHits = 0;
  ttProbes = 0;
  aborted = false;

  private deadline = Infinity;
  private readonly E: number;
  private readonly analyzer: ChainAnalyzer;
  private readonly hardEval: HardEvaluator;
  private readonly evalSettings: EvalSettings;
  private readonly moves: Int16Array;
  private readonly keys: Int32Array;
  private readonly history: HistoryTable;
  private readonly capTmp: Int16Array;
  private readonly safeTmp: Int16Array;
  private readonly sacTmp: Int16Array;
  private readonly mark: Int32Array;
  private stamp = 0;
  private capN = 0;
  private safeN = 0;
  private sacN = 0;
  private bestMove = NO_MOVE;

  constructor(board: Board, settings: SearchSettings, evalSettings: EvalSettings = AI_CONFIG.eval, tt?: TranspositionTable | null) {
    this.board = board;
    this.settings = settings;
    this.evalSettings = evalSettings;
    this.E = board.numEdges;
    this.analyzer = new ChainAnalyzer(board);
    this.hardEval = new HardEvaluator(this.analyzer, evalSettings);
    this.tt = settings.useTT ? (tt ?? new TranspositionTable(settings.ttBits)) : null;
    this.moves = new Int16Array((this.E + 1) * this.E);
    this.keys = new Int32Array((this.E + 1) * this.E);
    this.history = new HistoryTable(this.E);
    this.capTmp = new Int16Array(this.E);
    this.safeTmp = new Int16Array(this.E);
    this.sacTmp = new Int16Array(this.E);
    this.mark = new Int32Array(this.E);
  }

  evaluate(s: GameState): number {
    return this.settings.evalKind === 'hard' ? this.hardEval.evaluate(s) : evalMedium(s, this.evalSettings);
  }

  resetCounters(): void {
    this.nodes = 0;
    this.ttHits = 0;
    this.ttProbes = 0;
    this.aborted = false;
  }

  setDeadline(deadline: number): void {
    this.deadline = deadline;
    this.aborted = false;
  }

  private scan(s: GameState): void {
    const { numEdges, edgeBoxes } = this.board;
    const sides = s.sides;
    const edges = s.edges;
    let c = 0;
    let sf = 0;
    let sc = 0;
    for (let e = 0; e < numEdges; e++) {
      if (edges[e]) continue;
      const b1 = edgeBoxes[e * 2 + 1] as number;
      const s0 = sides[edgeBoxes[e * 2] as number] as number;
      const s1 = b1 >= 0 ? (sides[b1] as number) : 0;
      if (s0 === 3 || s1 === 3) this.capTmp[c++] = e;
      else if (s0 <= 1 && s1 <= 1) this.safeTmp[sf++] = e;
      else this.sacTmp[sc++] = e;
    }
    this.capN = c;
    this.safeN = sf;
    this.sacN = sc;
  }

  private forcedCapture(s: GameState): number {
    const { edgeBoxes } = this.board;
    let forced = -1;
    for (let i = 0; i < this.capN; i++) {
      const e = this.capTmp[i] as number;
      const b0 = edgeBoxes[e * 2] as number;
      const b1 = edgeBoxes[e * 2 + 1] as number;
      const s0 = s.sides[b0] as number;
      const s1 = b1 >= 0 ? (s.sides[b1] as number) : 0;
      if (s0 === 3 && s1 === 3) return e;
      const other = s0 === 3 ? b1 : b0;
      const sOther = s0 === 3 ? s1 : s0;
      if ((other < 0 || sOther !== 2) && forced < 0) forced = e;
    }
    return forced;
  }

  private ply(s: GameState): number {
    return s.freeEdges * this.E;
  }

  private assemble(s: GameState, ttMove: number, depth: number): number {
    const E = this.E;
    const off = this.ply(s);
    const moves = this.moves;
    const keys = this.keys;
    const { ordering, movePolicy } = this.settings;
    const { centerRank, boxEdges } = this.board;
    const useHist = ordering === 'full';
    const none = ordering === 'none';
    let n = 0;

    const push = (e: number, key: number): void => {
      moves[off + n] = e;
      keys[off + n] = none ? E - e : key;
      n++;
    };

    if (this.capN > 0) {
      if (movePolicy === 'all') {
        for (let i = 0; i < this.capN; i++) {
          const e = this.capTmp[i] as number;
          push(e, KEY_CAPTURE + E - (centerRank[e] as number));
        }
      } else {
        this.stamp++;
        for (let i = 0; i < this.capN; i++) {
          const e = this.capTmp[i] as number;
          push(e, KEY_CAPTURE + E - (centerRank[e] as number));
        }
        const { edgeBoxes } = this.board;
        for (let i = 0; i < this.capN; i++) {
          const e = this.capTmp[i] as number;
          const b0 = edgeBoxes[e * 2] as number;
          const b1 = edgeBoxes[e * 2 + 1] as number;
          const y = s.sides[b0] === 3 ? b1 : b0;
          for (let k = 0; k < 4; k++) {
            const g = boxEdges[y * 4 + k] as number;
            if (g !== e && !s.edges[g] && this.mark[g] !== this.stamp) {
              this.mark[g] = this.stamp;
              push(g, KEY_SAFE + E - (centerRank[g] as number));
            }
          }
        }
        return this.finishTt(off, n, ttMove);
      }
    }

    for (let i = 0; i < this.safeN; i++) {
      const e = this.safeTmp[i] as number;
      const h = useHist ? this.history.get(e) : 0;
      push(e, KEY_SAFE + h + E - (centerRank[e] as number));
    }

    const skipSacrifices =
      (movePolicy === 'safe-first' && this.safeN > 0) || (depth < SOLVED_DEPTH && this.safeN > this.settings.sacrificeSafeMax);
    if (this.sacN > 0 && !skipSacrifices) {
      const sorted = !none && this.safeN === 0;
      if (sorted) this.analyzer.analyze(s);
      for (let i = 0; i < this.sacN; i++) {
        const e = this.sacTmp[i] as number;
        const h = useHist ? this.history.get(e, KEY_SACRIFICE_STEP - 1) : 0;
        if (sorted) {
          const size = this.analyzer.sacrificeSize(s, e) * 2 + (this.analyzer.isHalfHearted(s, e) ? 1 : 0);
          push(e, KEY_SACRIFICE_SORTED - size * KEY_SACRIFICE_STEP + h);
        } else {
          push(e, KEY_SACRIFICE_PLAIN + h + E - (centerRank[e] as number));
        }
      }
    }
    return this.finishTt(off, n, ttMove);
  }

  private finishTt(off: number, n: number, ttMove: number): number {
    if (ttMove !== NO_MOVE && this.settings.ordering === 'full') {
      for (let i = 0; i < n; i++) {
        if (this.moves[off + i] === ttMove) {
          this.keys[off + i] = KEY_TT;
          break;
        }
      }
    }
    return n;
  }

  private child(s: GameState, e: number, depth: number, alpha: number, beta: number): number {
    const k = applyMove(s, e);
    let v: number;
    if (k > 0) v = k + this.alphaBeta(s, depth, alpha - k, beta - k);
    else v = -this.alphaBeta(s, depth >= SOLVED_DEPTH ? depth : depth - 1, -beta, -alpha);
    undoMove(s, e);
    return v;
  }

  alphaBeta(s: GameState, depth: number, alpha: number, beta: number): number {
    if (s.freeEdges === 0) return 0;
    if ((++this.nodes & TIME_CHECK_MASK) === 0 && performance.now() > this.deadline) this.aborted = true;
    if (this.aborted) return 0;
    if (depth <= 0) return this.evaluate(s);

    this.scan(s);
    if (this.capN > 0 && this.settings.movePolicy !== 'all') {
      const forced = this.forcedCapture(s);
      if (forced >= 0) return this.child(s, forced, depth, alpha, beta);
    }

    let ttMove = NO_MOVE;
    const tt = this.tt;
    if (tt) {
      this.ttProbes++;
      const idx = tt.probe(s.hashLo, s.hashHi);
      if (idx >= 0) {
        ttMove = tt.move[idx] as number;
        if ((tt.depth[idx] as number) >= depth) {
          this.ttHits++;
          const lo = tt.lower[idx] as number;
          const hi = tt.upper[idx] as number;
          if (lo >= beta) return lo;
          if (hi <= alpha) return hi;
          if (lo === hi) return lo;
          if (lo > alpha) alpha = lo;
          if (hi < beta) beta = hi;
        }
      }
    }

    const n = this.assemble(s, ttMove, depth);
    const alphaIn = alpha;
    const best = this.moveLoop(s, n, depth, alpha, beta);
    if (this.aborted) return 0;

    if (tt) {
      if (best <= alphaIn) tt.store(s.hashLo, s.hashHi, depth, -VALUE_INF, best, this.bestMove);
      else if (best >= beta) tt.store(s.hashLo, s.hashHi, depth, best, VALUE_INF, this.bestMove);
      else tt.store(s.hashLo, s.hashHi, depth, best, best, this.bestMove);
    }
    return best;
  }

  private moveLoop(s: GameState, n: number, depth: number, alpha: number, beta: number): number {
    const off = this.ply(s);
    const moves = this.moves;
    const keys = this.keys;
    let best = -VALUE_INF;
    let bestMove = NO_MOVE;
    for (let i = 0; i < n; i++) {
      let bi = i;
      let bk = keys[off + i] as number;
      for (let j = i + 1; j < n; j++) {
        const kj = keys[off + j] as number;
        if (kj > bk) {
          bk = kj;
          bi = j;
        }
      }
      if (bi !== i) {
        const tm = moves[off + i] as number;
        moves[off + i] = moves[off + bi] as number;
        moves[off + bi] = tm;
        keys[off + bi] = keys[off + i] as number;
        keys[off + i] = bk;
      }
      const e = moves[off + i] as number;
      const v = this.child(s, e, depth, alpha, beta);
      if (this.aborted) return 0;
      if (v > best) {
        best = v;
        bestMove = e;
        if (v > alpha && this.settings.pruning) {
          alpha = v;
          if (alpha >= beta) {
            if (this.settings.ordering === 'full') this.history.bump(e, depth);
            break;
          }
        }
      }
    }
    this.bestMove = bestMove;
    return best;
  }

  private rootSearch(s: GameState, depth: number, prevBest: number): { move: number; value: number } | null {
    this.scan(s);
    const n = this.assemble(s, prevBest, depth);
    const best = this.moveLoop(s, n, depth, -VALUE_INF, VALUE_INF);
    if (this.aborted) return null;
    const move = this.bestMove;
    if (this.tt) this.tt.store(s.hashLo, s.hashHi, depth, best, best, move);
    return { move, value: best };
  }

  search(s: GameState, onProgress?: (p: SearchProgress) => void): SearchResult {
    const t0 = performance.now();
    this.resetCounters();
    this.history.clear();
    this.deadline = t0 + this.settings.timeBudgetMs;
    this.tt?.newSearch();
    const { maxDepth, iterative, exactLimit, earlyStopFactor, movePolicy } = this.settings;

    const finish = (move: number, value: number | null, depth: number, exact: boolean): SearchResult => ({
      move,
      value,
      depth,
      nodes: this.nodes,
      timeMs: performance.now() - t0,
      ttHits: this.ttHits,
      ttProbes: this.ttProbes,
      exact,
    });

    this.scan(s);
    if (this.capN > 0 && movePolicy !== 'all') {
      const forced = this.forcedCapture(s);
      if (forced >= 0) return finish(forced, null, 0, false);
    }
    if (s.freeEdges === 1) return finish(this.firstFree(s), null, 0, false);

    let best: { move: number; value: number; depth: number } | null = null;
    let exact = false;
    let prev = NO_MOVE;
    let lastIterMs = 0;
    let solveTried = false;
    const free = s.freeEdges;
    const solveMode = exactLimit > 0 && free <= exactLimit;

    for (let d = iterative ? 1 : maxDepth; d <= maxDepth; d++) {
      if (best && earlyStopFactor > 0 && lastIterMs * earlyStopFactor > this.deadline - performance.now()) break;
      const ti = performance.now();
      const r = this.rootSearch(s, d, prev);
      if (!r) break;
      lastIterMs = performance.now() - ti;
      best = { move: r.move, value: r.value, depth: d };
      prev = r.move;
      onProgress?.({ depth: d, nodes: this.nodes, value: r.value, timeMs: performance.now() - t0 });
      if (d >= free) {
        exact = movePolicy !== 'safe-first' && this.settings.sacrificeSafeMax === Infinity;
        break;
      }
      if (solveMode && !solveTried && d >= 2) {
        solveTried = true;
        const fullDeadline = this.deadline;
        this.deadline = performance.now() + (fullDeadline - performance.now()) * this.settings.exactTimeShare;
        const solved = this.rootSearch(s, SOLVED_DEPTH, prev);
        this.deadline = fullDeadline;
        if (solved) {
          best = { move: solved.move, value: solved.value, depth: free };
          exact = true;
          onProgress?.({ depth: free, nodes: this.nodes, value: solved.value, timeMs: performance.now() - t0 });
          break;
        }
        this.aborted = false;
      }
    }

    if (!best) {
      this.aborted = false;
      this.scan(s);
      const forced = this.capN > 0 && movePolicy !== 'all' ? this.forcedCapture(s) : -1;
      if (forced >= 0) return finish(forced, null, 0, false);
      const n = this.assemble(s, NO_MOVE, 1);
      const off = this.ply(s);
      let bi = 0;
      for (let j = 1; j < n; j++) if ((this.keys[off + j] as number) > (this.keys[off + bi] as number)) bi = j;
      return finish(this.moves[off + bi] as number, null, 0, false);
    }
    return finish(best.move, best.value, best.depth, exact);
  }

  private firstFree(s: GameState): number {
    for (let e = 0; e < this.E; e++) if (!s.edges[e]) return e;
    return -1;
  }
}

export interface MinimaxStats {
  nodes: number;
  limit?: number;
}

export class NodeLimitExceeded extends Error {}

export function minimax(s: GameState, depth: number, leaf: (s: GameState) => number, stats?: MinimaxStats): number {
  if (stats && ++stats.nodes > (stats.limit ?? Infinity)) throw new NodeLimitExceeded();
  if (s.freeEdges === 0) return 0;
  if (depth <= 0) return leaf(s);
  const E = s.board.numEdges;
  let best = -Infinity;
  for (let e = 0; e < E; e++) {
    if (s.edges[e]) continue;
    const k = applyMove(s, e);
    const v = k > 0 ? k + minimax(s, depth, leaf, stats) : -minimax(s, depth - 1, leaf, stats);
    undoMove(s, e);
    if (v > best) best = v;
  }
  return best;
}
