import { describe, expect, it } from 'vitest';
import { applyMove, createRng, getBoard, legalMoves, type GameState } from '../engine';
import { exactValue, PLAIN_SETTINGS, randomPosition } from '../test/helpers';
import type { SearchSettings } from './config';
import { AI_CONFIG } from './config';
import { minimax, Searcher, SOLVED_DEPTH } from './search';
import { TranspositionTable } from './tt';

const INF = 1e9;
const noLeaf = (): number => 0;

function positions(rows: number, cols: number, count: number, seed: number): GameState[] {
  const rng = createRng(seed);
  const out: GameState[] = [];
  for (let i = 0; i < count; i++) out.push(randomPosition(rows, cols, 3 + rng.int(rows === 2 && cols === 2 ? 7 : 6), rng));
  return out;
}

const variants: Array<[string, Partial<SearchSettings>]> = [
  ['альфа-бета без технік', {}],
  ['з впорядкуванням', { ordering: 'full' }],
  ['з таблицею транспозицій', { ordering: 'full', useTT: true, ttBits: 14 }],
  ['з вимушеними захопленнями', { movePolicy: 'forced-captures', ordering: 'full', useTT: true, ttBits: 14 }],
  ['вимушені захоплення без TT та впорядкування', { movePolicy: 'forced-captures' }],
];

describe('alphaBeta == повний minimax (точний режим)', () => {
  for (const [rows, cols] of [
    [2, 2],
    [2, 3],
  ] as const) {
    const sample = positions(rows, cols, 110, rows * 100 + cols);
    for (const [name, patch] of variants) {
      it(`${rows}x${cols}: ${name}`, () => {
        const board = getBoard(rows, cols);
        const shared = patch.useTT ? new TranspositionTable(14) : null;
        const searcher = new Searcher(board, { ...PLAIN_SETTINGS, ...patch }, AI_CONFIG.eval, shared);
        for (const s of sample) {
          const expected = minimax(s, Infinity, noLeaf);
          searcher.resetCounters();
          expect(searcher.alphaBeta(s, SOLVED_DEPTH, -INF, INF) + 0).toBe(expected + 0);
        }
      });
    }
  }

  it('ітеративне поглиблення у точному режимі дає те саме значення й хід оптимальний', () => {
    const board = getBoard(2, 3);
    const sample = positions(2, 3, 120, 99);
    const searcher = new Searcher(board, {
      ...PLAIN_SETTINGS,
      movePolicy: 'forced-captures',
      ordering: 'full',
      iterative: true,
      useTT: true,
      ttBits: 14,
      exactLimit: 30,
      maxDepth: 40,
    });
    for (const s of sample) {
      const r = searcher.search(s);
      if (r.value === null) continue;
      expect(r.exact).toBe(true);
      expect(r.value + 0).toBe(minimax(s, Infinity, noLeaf) + 0);
    }
  });
});

describe('вікно (α, β) при додатковому ході', () => {
  it('fail-soft: результат узгоджений із точним значенням для будь-якого вікна', () => {
    const board = getBoard(2, 3);
    const rng = createRng(5);
    const searcher = new Searcher(board, PLAIN_SETTINGS);
    for (const s of positions(2, 3, 120, 11)) {
      const exact = minimax(s, Infinity, noLeaf);
      const alpha = rng.int(9) - 4;
      const beta = alpha + 1 + rng.int(4);
      const r = searcher.alphaBeta(s, SOLVED_DEPTH, alpha, beta);
      if (r > alpha && r < beta) expect(r + 0).toBe(exact + 0);
      else if (r <= alpha) expect(exact).toBeLessThanOrEqual(r);
      else expect(exact).toBeGreaterThanOrEqual(r);
    }
  });

  it('після захоплення вікно зсувається на k, а не інвертується', () => {
    const s = randomPosition(1, 1, 1, createRng(1));
    const searcher = new Searcher(getBoard(1, 1), PLAIN_SETTINGS);
    expect(searcher.alphaBeta(s, SOLVED_DEPTH, 0.5, 1.5)).toBe(1);
    expect(searcher.alphaBeta(s, SOLVED_DEPTH, -INF, INF)).toBe(1);
    expect(searcher.alphaBeta(s, SOLVED_DEPTH, 1, 2)).toBeLessThanOrEqual(1);
    expect(searcher.alphaBeta(s, SOLVED_DEPTH, -3, 0)).toBeGreaterThanOrEqual(1);
  });

  it('значення не залежить від рахунку: V(s) однакове при різних scores', () => {
    const board = getBoard(2, 2);
    const base = randomPosition(2, 2, 6, createRng(3));
    const searcher = new Searcher(board, PLAIN_SETTINGS);
    const v1 = searcher.alphaBeta(base, SOLVED_DEPTH, -INF, INF);
    base.scores[0] += 5;
    base.scores[1] += 2;
    expect(searcher.alphaBeta(base, SOLVED_DEPTH, -INF, INF) + 0).toBe(v1 + 0);
    const empty = randomPosition(2, 2, 12, createRng(1));
    const first = legalMoves(empty)[0] as number;
    applyMove(empty, first);
    expect(Number.isFinite(searcher.alphaBeta(empty, SOLVED_DEPTH, -INF, INF))).toBe(true);
  });
});

describe('обмежена глибина: узгодженість варіантів', () => {
  it('без TT альфа-бета з впорядкуванням і без нього дають те саме значення, що й minimax з евристикою', () => {
    const board = getBoard(3, 3);
    const rng = createRng(21);
    const base = new Searcher(board, PLAIN_SETTINGS);
    const ordered = new Searcher(board, { ...PLAIN_SETTINGS, ordering: 'full' });
    for (let i = 0; i < 12; i++) {
      const s = randomPosition(3, 3, 18 + rng.int(4), rng);
      const depth = 3;
      const expected = minimax(s, depth, (x) => base.evaluate(x));
      expect(base.alphaBeta(s, depth, -INF, INF) + 0).toBe(expected + 0);
      expect(ordered.alphaBeta(s, depth, -INF, INF) + 0).toBe(expected + 0);
    }
  });
});

describe('навантажувальна перевірка скорочень на більших позиціях (3x3, 11–15 вільних ліній)', () => {
  it('політика вимушених захоплень + TT + впорядкування дає точне значення', () => {
    const board = getBoard(3, 3);
    const rng = createRng(2024);
    const tt = new TranspositionTable(16);
    const searcher = new Searcher(board, { ...PLAIN_SETTINGS, movePolicy: 'forced-captures', ordering: 'full', useTT: true, ttBits: 16 }, AI_CONFIG.eval, tt);
    for (let i = 0; i < 80; i++) {
      const s = randomPosition(3, 3, 11 + rng.int(5), rng);
      const expected = exactValue(s);
      expect(searcher.alphaBeta(s, SOLVED_DEPTH, -INF, INF) + 0).toBe(expected + 0);
    }
  });
});
