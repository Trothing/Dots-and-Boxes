import type { Board } from '../engine/board';
import { AI_CONFIG, searchSettings, type EvalSettings, type SearchSettings } from './config';
import { Searcher } from './search';
import type { TranspositionTable } from './tt';

export function createHardSearcher(
  board: Board,
  overrides: Partial<SearchSettings> = {},
  evalSettings: EvalSettings = AI_CONFIG.eval,
  tt?: TranspositionTable,
): Searcher {
  return new Searcher(board, searchSettings('hard', overrides), evalSettings, tt);
}
