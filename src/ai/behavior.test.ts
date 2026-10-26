import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyMove,
  createRng,
  edgeKind,
  fromAscii,
  fromEdges,
  getBoard,
  hEdge,
  isHalfHeartedHandout,
  safeMoves,
  sacrificeSize,
  vEdge,
  type GameState,
} from '../engine';
import { randomPosition } from '../lab/positions';
import { moveValues } from '../test/helpers';
import { AI_CONFIG, type Level } from './config';
import { chooseEasy } from './easy';
import { AIPlayer } from './player';

afterEach(() => vi.restoreAllMocks());

const LEVELS: Level[] = ['easy', 'medium', 'hard'];
const choose = (level: Level, s: GameState, budget = 400): number =>
  new AIPlayer(level, level === 'hard' ? { timeBudgetMs: budget } : {}).choose(s).move;

const dots = (...h: boolean[]): string => '+' + h.map((x) => (x ? '---' : '   ')).join('+') + '+';
const boxes = (...v: boolean[]): string => v.map((x) => (x ? '|' : ' ')).join('   ');

describe('очевидні дії всіх рівнів', () => {
  const withCapture = (): GameState =>
    fromAscii(3, 3, [
      dots(true, false, false),
      boxes(true, false, false, false),
      dots(true, false, false),
      boxes(false, false, false, false),
      dots(false, false, false),
      boxes(false, false, false, false),
      dots(false, false, false),
    ]);

  it.each(LEVELS)('%s: закриває коробку, якщо вона доступна', (level) => {
    const s = withCapture();
    expect(s.sides[0]).toBe(3);
    expect(choose(level, s)).toBe(vEdge(s.board, 0, 1));
  });

  it.each(LEVELS)('%s: не ставить третю сторону, поки є безпечний хід', (level) => {
    const minSafe = level === 'hard' ? AI_CONFIG.hard.sacrificeSafeMax + 1 : 1;
    const rng = createRng(77);
    let tested = 0;
    for (const free of [48, 44, 40, 36, 32, 30, 28]) {
      for (let i = 0; i < 3; i++) {
        const s = randomPosition(5, 5, free, rng);
        if (safeMoves(s).length < minSafe) continue;
        const e = choose(level, s, 150);
        expect(edgeKind(s, e), `${level}, вільних ${free}`).toBe('safe');
        tested++;
      }
    }
    expect(tested).toBeGreaterThanOrEqual(8);
  });

  it('усі рівні не користуються Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const s = randomPosition(4, 4, 24, createRng(5));
    for (const level of LEVELS) choose(level, s, 100);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('легкий рівень', () => {
  it('детермінований: однакова позиція — однаковий хід', () => {
    const rng = createRng(3);
    for (let i = 0; i < 20; i++) {
      const s = randomPosition(5, 5, 60 - 2 * i, rng);
      const first = chooseEasy(s);
      expect(chooseEasy(s)).toBe(first);
      expect(new AIPlayer('easy').choose(s).move).toBe(first);
    }
  });

  const twoPlusThree = (): GameState =>
    fromAscii(1, 5, [
      dots(false, true, true, true, true),
      boxes(true, false, true, false, false, true),
      dots(true, false, false, true, false),
    ]);

  it('коли є лише жертви, обирає найменшу: ланцюг із 2 коробок відкриває серединою', () => {
    const s = twoPlusThree();
    const middle = vEdge(s.board, 0, 1);
    expect(sacrificeSize(s, middle)).toBe(2);
    expect(isHalfHeartedHandout(s, middle)).toBe(false);
    expect(isHalfHeartedHandout(s, hEdge(s.board, 0, 0))).toBe(true);
    expect(sacrificeSize(s, vEdge(s.board, 0, 3))).toBe(3);
    expect(chooseEasy(s)).toBe(middle);
  });

  it('жертва з однієї коробки краща за жертву з двох', () => {
    const s = fromAscii(1, 3, [dots(false, true, true), boxes(true, true, false, true), dots(false, false, false)]);
    const top = hEdge(s.board, 0, 0);
    expect(sacrificeSize(s, top)).toBe(1);
    expect(sacrificeSize(s, vEdge(s.board, 0, 2))).toBe(2);
    const e = chooseEasy(s);
    expect([top, hEdge(s.board, 1, 0)]).toContain(e);
  });

  it('безпечний хід залишає найбільше безпечних ходів у майбутньому', () => {
    const s = fromEdges(2, 2, []);
    const e = chooseEasy(s);
    expect(edgeKind(s, e)).toBe('safe');
    expect(s.board.centerRank[e]).toBe(0);
    const t = getBoard(2, 2);
    expect(t.centerRank[e]).toBe(0);
  });
});

describe('double-dealing і контроль (складний рівень)', () => {
  const board24 = getBoard(2, 4);
  const twoChains = (lowerVerticals: boolean[]): GameState =>
    fromAscii(
      2,
      4,
      [
        dots(true, true, true, true),
        boxes(true, true, true, false, false),
        dots(true, true, true, true),
        boxes(...lowerVerticals),
        dots(true, true, true, true),
      ],
      0,
      [2, 0],
    );

  it('є ще один довгий ланцюг: all-but-two — віддає останні 2 коробки й зберігає контроль', () => {
    const s = twoChains([false, false, false, false, false]);
    const take = vEdge(board24, 0, 3);
    const decline = vEdge(board24, 0, 4);
    const values = moveValues(s);
    const best = Math.max(...values.values());
    expect(values.get(decline)).toBe(best);
    expect(values.get(decline) as number).toBeGreaterThan(values.get(take) as number);

    expect(chooseEasy(s)).toBe(take);
    const r = new AIPlayer('hard', { timeBudgetMs: 1000 }).choose(s);
    expect(r.move).toBe(decline);
    expect(r.value).toBe(best);
  });

  it('останній довгий ланцюг: складний забирає все', () => {
    const s = twoChains([true, true, true, true, true]);
    const take = vEdge(board24, 0, 3);
    const decline = vEdge(board24, 0, 4);
    const values = moveValues(s);
    expect(values.get(take) as number).toBeGreaterThan(values.get(decline) as number);
    const r = new AIPlayer('hard', { timeBudgetMs: 1000 }).choose(s);
    expect(r.move).toBe(take);
    expect(r.value).toBe(Math.max(...values.values()));
  });

  const geom = getBoard(2, 5);
  const cycleOpened = (withChain: boolean): GameState => {
    const edges = [
      hEdge(geom, 0, 0), hEdge(geom, 0, 1), hEdge(geom, 2, 0), hEdge(geom, 2, 1), vEdge(geom, 0, 0), vEdge(geom, 1, 0),
      vEdge(geom, 0, 2), vEdge(geom, 1, 2),
      vEdge(geom, 0, 1),
      hEdge(geom, 1, 2), hEdge(geom, 0, 3), hEdge(geom, 1, 3), hEdge(geom, 0, 4), vEdge(geom, 0, 5), vEdge(geom, 1, 5), hEdge(geom, 2, 4), hEdge(geom, 2, 3),
    ];
    if (!withChain) {
      edges.push(hEdge(geom, 0, 2), vEdge(geom, 0, 3), vEdge(geom, 0, 4), hEdge(geom, 1, 4), vEdge(geom, 1, 4), vEdge(geom, 1, 3), hEdge(geom, 2, 2));
    }
    return fromEdges(2, 5, edges, 0, [0, 0]);
  };

  it('цикл і ще один довгий ланцюг: all-but-four', () => {
    const s = cycleOpened(true);
    const middle = vEdge(geom, 1, 1);
    const values = moveValues(s);
    const best = Math.max(...values.values());
    expect(values.get(middle)).toBe(best);
    expect(values.get(hEdge(geom, 1, 0)) as number).toBeLessThan(best);
    const r = new AIPlayer('hard', { timeBudgetMs: 1000 }).choose(s);
    expect(r.move).toBe(middle);
    expect(r.value).toBe(best);
    expect([hEdge(geom, 1, 0), hEdge(geom, 1, 1)]).toContain(chooseEasy(s));
  });

  it('останній цикл: складний забирає все', () => {
    const s = cycleOpened(false);
    const values = moveValues(s);
    const r = new AIPlayer('hard', { timeBudgetMs: 1000 }).choose(s);
    expect([hEdge(geom, 1, 0), hEdge(geom, 1, 1)]).toContain(r.move);
    expect(values.get(r.move)).toBe(Math.max(...values.values()));
    expect(values.get(vEdge(geom, 1, 1)) as number).toBeLessThan(values.get(r.move) as number);
  });

  it('ланцюг із 2 коробок відкривається серединою (hard-hearted handout)', () => {
    const build = (): GameState =>
      fromAscii(1, 5, [
        dots(false, true, true, true, true),
        boxes(true, false, true, false, false, true),
        dots(true, false, false, true, false),
      ]);
    const s = build();
    const middle = vEdge(s.board, 0, 1);
    const values = moveValues(s);
    const best = Math.max(...values.values());
    expect(values.get(middle)).toBe(best);
    expect(values.get(hEdge(s.board, 0, 0)) as number).toBeLessThan(best);
    const r = new AIPlayer('hard', { timeBudgetMs: 1000 }).choose(s);
    expect(r.move).toBe(middle);
    expect(r.value).toBe(best);
    expect(applyMove(build(), middle)).toBe(0);
  });
});
