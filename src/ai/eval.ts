import { type ChainAnalyzer } from '../engine/chains';
import { applyMove, countSafeMoves, undoMove, type GameState } from '../engine/state';
import type { EvalSettings } from './config';

const round64 = (x: number): number => Math.round(x * 64) / 64;

export function greedyCaptureCount(s: GameState): number {
  const { numBoxes, numEdges, edgeBoxes } = s.board;
  let any = false;
  for (let b = 0; b < numBoxes; b++) {
    if (s.sides[b] === 3) {
      any = true;
      break;
    }
  }
  if (!any) return 0;
  const taken: number[] = [];
  let total = 0;
  for (;;) {
    let found = -1;
    for (let e = 0; e < numEdges; e++) {
      if (s.edges[e]) continue;
      const b1 = edgeBoxes[e * 2 + 1] as number;
      if (s.sides[edgeBoxes[e * 2] as number] === 3 || (b1 >= 0 && s.sides[b1] === 3)) {
        found = e;
        break;
      }
    }
    if (found < 0) break;
    total += applyMove(s, found);
    taken.push(found);
  }
  for (let i = taken.length - 1; i >= 0; i--) undoMove(s, taken[i] as number);
  return total;
}

export function safeMoveRollout(s: GameState): number {
  const { numEdges, edgeBoxes } = s.board;
  const played: number[] = [];
  for (let e = 0; e < numEdges; e++) {
    if (s.edges[e]) continue;
    const b1 = edgeBoxes[e * 2 + 1] as number;
    if ((s.sides[edgeBoxes[e * 2] as number] as number) <= 1 && (b1 < 0 || (s.sides[b1] as number) <= 1)) {
      applyMove(s, e);
      played.push(e);
    }
  }
  for (let i = played.length - 1; i >= 0; i--) undoMove(s, played[i] as number);
  return played.length;
}

export function evalMedium(s: GameState, w: EvalSettings): number {
  const parity = (w.mediumParityRollout ? safeMoveRollout(s) : countSafeMoves(s)) & 1 ? w.mediumParityBonus : -w.mediumParityBonus;
  return round64(greedyCaptureCount(s) + parity);
}

export class HardEvaluator {
  private readonly analyzer: ChainAnalyzer;
  private readonly w: EvalSettings;

  constructor(analyzer: ChainAnalyzer, w: EvalSettings) {
    this.analyzer = analyzer;
    this.w = w;
  }

  evaluate(s: GameState): number {
    const a = this.analyzer;
    a.analyze(s);

    let openTotal = 0;
    let openShort = 0;
    let openLongN = 0;
    let openLongSum = 0;
    let longN = 0;
    let longSum = 0;
    let cycN = 0;
    let cycSum = 0;
    let n1 = 0;
    let n2 = 0;
    for (let id = 0; id < a.compCount; id++) {
      const len = a.compLen[id] as number;
      if (a.compCycle[id]) {
        cycN++;
        cycSum += len;
      } else if (a.compOpen[id]) {
        openTotal += len;
        if (len >= 3) {
          openLongN++;
          openLongSum += len;
        } else openShort += len;
      } else if (len >= 3) {
        longN++;
        longSum += len;
      } else if (len === 2) n2++;
      else n1++;
    }
    if (a.compCount === 0) return 0;

    const totalLong = longN + openLongN;
    const doubleCrosses = totalLong > 0 ? totalLong - 1 : 0;
    const moverIsController = ((s.freeEdges - a.remaining + doubleCrosses) & 1) === 0;

    const chainN = longN + (moverIsController ? openLongN : 0);
    const chainSum = longSum + (moverIsController ? openLongSum : 0);
    let longNet = 0;
    if (chainN > 0) longNet = chainSum - 4 * (chainN - 1) + (cycSum - 8 * cycN);
    else if (cycN > 0) longNet = cycSum - 8 * (cycN - 1);
    const hasLong = chainN + cycN > 0;

    let shortNet = 0;
    let sign = hasLong ? -1 : 1;
    for (let i = 0; i < n2; i++, sign = -sign) shortNet += 2 * sign;
    for (let i = 0; i < n1; i++, sign = -sign) shortNet += sign;

    const netController = longNet + shortNet;
    const direct = moverIsController ? openShort : openTotal;
    const control = moverIsController ? netController : -netController;

    const safe = countSafeMoves(s);
    const t = Math.max(0, 1 - safe / this.w.controlSafeScale);
    const weight = this.w.controlWeightMin + (this.w.controlWeightMax - this.w.controlWeightMin) * t;
    return round64(direct + weight * control);
  }
}
