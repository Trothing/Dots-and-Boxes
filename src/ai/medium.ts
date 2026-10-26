import type { Board } from '../engine/board';
import { searchSettings, AI_CONFIG, type EvalSettings, type SearchSettings } from './config';
import { Searcher } from './search';

export function createMediumSearcher(board: Board, overrides: Partial<SearchSettings> = {}, evalSettings: EvalSettings = AI_CONFIG.eval): Searcher {
  return new Searcher(board, searchSettings('medium', overrides), evalSettings);
}
