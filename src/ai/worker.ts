import { fromEdges } from '../engine/state';
import type { Level } from './config';
import { AIPlayer } from './player';
import type { WorkerRequest, WorkerResponse } from './protocol';

interface WorkerScope {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
}

const ctx = self as unknown as WorkerScope;
const players = new Map<Level, AIPlayer>();

function playerFor(level: Level): AIPlayer {
  let p = players.get(level);
  if (!p) {
    p = new AIPlayer(level);
    players.set(level, p);
  }
  return p;
}

ctx.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === 'newGame') {
    players.forEach((p) => p.newGame());
    return;
  }
  try {
    const placed: number[] = [];
    msg.edges.forEach((v, e) => {
      if (v) placed.push(e);
    });
    const state = fromEdges(msg.rows, msg.cols, placed, msg.toMove);
    const result = playerFor(msg.level).choose(state, {
      timeBudgetMs: msg.budgetMs,
      onProgress: (p) => ctx.postMessage({ type: 'progress', id: msg.id, depth: p.depth, nodes: p.nodes, value: p.value, timeMs: p.timeMs }),
    });
    ctx.postMessage({ type: 'result', id: msg.id, result });
  } catch (err) {
    ctx.postMessage({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
