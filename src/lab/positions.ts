import { applyMove, createState, edgeKind, type GameState, type Rng } from '../engine';

function randomReasonableMove(s: GameState, rng: Rng): number {
  const caps: number[] = [];
  const safe: number[] = [];
  const sac: number[] = [];
  for (let e = 0; e < s.board.numEdges; e++) {
    if (s.edges[e]) continue;
    const k = edgeKind(s, e);
    (k === 'capture' ? caps : k === 'safe' ? safe : sac).push(e);
  }
  if (caps.length) return rng.pick(caps);
  if (safe.length) return rng.pick(safe);
  return rng.pick(sac);
}

export function randomOpening(rows: number, cols: number, plies: number, rng: Rng): GameState {
  const s = createState(rows, cols);
  for (let i = 0; i < plies; i++) applyMove(s, randomReasonableMove(s, rng));
  return s;
}

export function randomPosition(rows: number, cols: number, freeTarget: number, rng: Rng): GameState {
  for (let attempt = 0; attempt < 200; attempt++) {
    const s = createState(rows, cols);
    while (s.freeEdges > freeTarget) applyMove(s, randomReasonableMove(s, rng));
    let hasCapture = false;
    for (let e = 0; e < s.board.numEdges && !hasCapture; e++) if (!s.edges[e] && edgeKind(s, e) === 'capture') hasCapture = true;
    if (!hasCapture) return s;
  }
  throw new Error('Could not generate a position without captures');
}
