import { cloneState, applyMove, isGameOver, type GameState, type Player } from '../engine';
import type { AIPlayer } from '../ai/player';

export interface MoveStats {
  calls: number;
  searched: number;
  totalMs: number;
  maxMs: number;
  nodes: number;
  depthSum: number;
  ttHits: number;
  ttProbes: number;
}

export const emptyStats = (): MoveStats => ({ calls: 0, searched: 0, totalMs: 0, maxMs: 0, nodes: 0, depthSum: 0, ttHits: 0, ttProbes: 0 });

export function mergeStats(into: MoveStats, from: MoveStats): void {
  into.calls += from.calls;
  into.searched += from.searched;
  into.totalMs += from.totalMs;
  into.maxMs = Math.max(into.maxMs, from.maxMs);
  into.nodes += from.nodes;
  into.depthSum += from.depthSum;
  into.ttHits += from.ttHits;
  into.ttProbes += from.ttProbes;
}

export interface GameResult {
  scoreA: number;
  scoreB: number;
  statsA: MoveStats;
  statsB: MoveStats;
}

export function playGame(a: AIPlayer, b: AIPlayer, opening: GameState, aPlayer: Player): GameResult {
  const s = cloneState(opening);
  a.newGame();
  b.newGame();
  const statsA = emptyStats();
  const statsB = emptyStats();
  while (!isGameOver(s)) {
    const isA = s.toMove === aPlayer;
    const ai = isA ? a : b;
    const st = isA ? statsA : statsB;
    const r = ai.choose(s);
    st.calls++;
    if (ai.level === 'easy' || r.value !== null) {
      st.searched++;
      st.totalMs += r.timeMs;
      st.maxMs = Math.max(st.maxMs, r.timeMs);
      st.nodes += r.nodes;
      st.depthSum += r.depth;
      st.ttHits += r.ttHits;
      st.ttProbes += r.ttProbes;
    }
    applyMove(s, r.move);
  }
  const mine = s.scores[aPlayer] as number;
  const theirs = s.scores[1 - aPlayer] as number;
  return { scoreA: mine, scoreB: theirs, statsA, statsB };
}
