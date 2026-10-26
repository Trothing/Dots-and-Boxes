import { getAnalyzer } from '../engine/chains';
import { applyMove, countSafeMoves, edgeKind, undoMove, type GameState } from '../engine/state';

export function chooseEasy(s: GameState): number {
  const { numEdges, edgeBoxes, centerRank } = s.board;

  let capture = -1;
  let captureGain = 0;
  for (let e = 0; e < numEdges; e++) {
    if (s.edges[e] || edgeKind(s, e) !== 'capture') continue;
    const b1 = edgeBoxes[e * 2 + 1] as number;
    const gain = (s.sides[edgeBoxes[e * 2] as number] === 3 ? 1 : 0) + (b1 >= 0 && s.sides[b1] === 3 ? 1 : 0);
    if (gain > captureGain || (gain === captureGain && capture >= 0 && (centerRank[e] as number) < (centerRank[capture] as number))) {
      capture = e;
      captureGain = gain;
    }
  }
  if (capture >= 0) return capture;

  let safe = -1;
  let safeLeft = -1;
  for (let e = 0; e < numEdges; e++) {
    if (s.edges[e] || edgeKind(s, e) !== 'safe') continue;
    applyMove(s, e);
    const left = countSafeMoves(s);
    undoMove(s, e);
    if (left > safeLeft || (left === safeLeft && (centerRank[e] as number) < (centerRank[safe] as number))) {
      safe = e;
      safeLeft = left;
    }
  }
  if (safe >= 0) return safe;

  const analyzer = getAnalyzer(s.board);
  analyzer.analyze(s);
  let pick = -1;
  let pickScore = Infinity;
  for (let e = 0; e < numEdges; e++) {
    if (s.edges[e]) continue;
    const score = analyzer.sacrificeSize(s, e) * 2 + (analyzer.isHalfHearted(s, e) ? 1 : 0);
    if (score < pickScore || (score === pickScore && (centerRank[e] as number) < (centerRank[pick] as number))) {
      pick = e;
      pickScore = score;
    }
  }
  return pick;
}
