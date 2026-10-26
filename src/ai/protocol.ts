import type { Level } from './config';
import type { SearchResult } from './search';

export interface SearchRequest {
  type: 'search';
  id: number;
  level: Level;
  rows: number;
  cols: number;
  edges: Uint8Array;
  toMove: 0 | 1;
  budgetMs?: number;
}

export interface NewGameRequest {
  type: 'newGame';
}

export type WorkerRequest = SearchRequest | NewGameRequest;

export interface ProgressMessage {
  type: 'progress';
  id: number;
  depth: number;
  nodes: number;
  value: number;
  timeMs: number;
}

export interface ResultMessage {
  type: 'result';
  id: number;
  result: SearchResult;
}

export interface ErrorMessage {
  type: 'error';
  id: number;
  message: string;
}

export type WorkerResponse = ProgressMessage | ResultMessage | ErrorMessage;
