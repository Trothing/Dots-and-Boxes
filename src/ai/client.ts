import type { GameState } from '../engine/state';
import type { Level } from './config';
import type { ProgressMessage, WorkerRequest, WorkerResponse } from './protocol';
import type { SearchResult } from './search';

export class SearchCancelled extends Error {
  constructor() {
    super('Search cancelled');
  }
}

interface Pending {
  resolve: (r: SearchResult) => void;
  reject: (e: Error) => void;
  onProgress?: (p: ProgressMessage) => void;
}

export interface SearchOptions {
  budgetMs?: number;
  onProgress?: (p: ProgressMessage) => void;
}

export class AIClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      if (msg.type === 'progress') p.onProgress?.(msg);
      else {
        this.pending.delete(msg.id);
        if (msg.type === 'result') p.resolve(msg.result);
        else p.reject(new Error(msg.message));
      }
    };
    worker.onerror = (ev) => {
      const err = new Error(ev.message || 'Web Worker failure');
      this.worker?.terminate();
      this.worker = null;
      this.rejectAll(err);
    };
    this.worker = worker;
    return worker;
  }

  private rejectAll(err: Error): void {
    const all = [...this.pending.values()];
    this.pending.clear();
    all.forEach((p) => p.reject(err));
  }

  search(level: Level, s: GameState, opts: SearchOptions = {}): Promise<SearchResult> {
    return new Promise((resolve, reject) => {
      try {
        const worker = this.ensure();
        const id = this.nextId++;
        this.pending.set(id, { resolve, reject, onProgress: opts.onProgress });
        const req: WorkerRequest = {
          type: 'search',
          id,
          level,
          rows: s.board.rows,
          cols: s.board.cols,
          edges: s.edges.slice(),
          toMove: s.toMove,
          budgetMs: opts.budgetMs,
        };
        worker.postMessage(req);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  newGame(): void {
    this.worker?.postMessage({ type: 'newGame' } satisfies WorkerRequest);
  }

  cancel(): void {
    if (!this.worker && this.pending.size === 0) return;
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new SearchCancelled());
  }

  dispose(): void {
    this.cancel();
  }
}
