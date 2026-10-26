import type { Board } from '../engine/board';
import type { GameState } from '../engine/state';
import { AI_CONFIG, searchSettings, type EvalSettings, type Level, type SearchSettings } from './config';
import { chooseEasy } from './easy';
import { createHardSearcher } from './hard';
import { createMediumSearcher } from './medium';
import type { Searcher, SearchProgress, SearchResult } from './search';

export interface ChooseOptions {
  timeBudgetMs?: number;
  onProgress?: (p: SearchProgress) => void;
}

export class AIPlayer {
  readonly level: Level;
  private readonly settings: SearchSettings | null;
  private readonly overrides: Partial<SearchSettings>;
  private readonly evalSettings: EvalSettings;
  private searcher: Searcher | null = null;

  constructor(level: Level, overrides: Partial<SearchSettings> = {}, evalSettings: EvalSettings = AI_CONFIG.eval) {
    this.level = level;
    this.overrides = overrides;
    this.settings = level === 'easy' ? null : searchSettings(level, overrides);
    this.evalSettings = evalSettings;
  }

  newGame(): void {
    this.searcher?.tt?.clear();
  }

  private searcherFor(board: Board): Searcher {
    if (!this.searcher || this.searcher.board !== board) {
      this.searcher =
        this.level === 'medium'
          ? createMediumSearcher(board, this.overrides, this.evalSettings)
          : createHardSearcher(board, this.overrides, this.evalSettings);
    }
    return this.searcher;
  }

  choose(s: GameState, opts: ChooseOptions = {}): SearchResult {
    if (this.level === 'easy') {
      const t0 = performance.now();
      const move = chooseEasy(s);
      return { move, value: null, depth: 0, nodes: 0, timeMs: performance.now() - t0, ttHits: 0, ttProbes: 0, exact: false };
    }
    const searcher = this.searcherFor(s.board);
    searcher.settings.timeBudgetMs = opts.timeBudgetMs ?? (this.settings as SearchSettings).timeBudgetMs;
    return searcher.search(s, opts.onProgress);
  }
}
