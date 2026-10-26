import { describe, expect, it } from 'vitest';
import { ChainAnalyzer, createRng, createState, fromAscii, getBoard } from '../engine';
import { randomPosition } from '../test/helpers';
import { AI_CONFIG } from './config';
import { evalMedium, greedyCaptureCount, HardEvaluator, safeMoveRollout } from './eval';
import { NO_MOVE, TranspositionTable } from './tt';

const dots = (...h: boolean[]): string => '+' + h.map((x) => (x ? '---' : '   ')).join('+') + '+';
const boxes = (...v: boolean[]): string => v.map((x) => (x ? '|' : ' ')).join('   ');

describe('евристики листя', () => {
  const hard = (rows: number, cols: number) => new HardEvaluator(new ChainAnalyzer(getBoard(rows, cols)), AI_CONFIG.eval);

  it('порожнє поле: структури немає — оцінка 0', () => {
    expect(hard(5, 5).evaluate(createState(5, 5))).toBe(0);
  });

  it('оцінка не залежить від поточного рахунку (лише від множини ліній і гравця, що ходить)', () => {
    const ev = hard(5, 5);
    const s = randomPosition(5, 5, 24, createRng(8));
    const before = ev.evaluate(s);
    const medBefore = evalMedium(s, AI_CONFIG.eval);
    s.scores[0] += 7;
    s.scores[1] += 3;
    expect(ev.evaluate(s)).toBe(before);
    expect(evalMedium(s, AI_CONFIG.eval)).toBe(medBefore);
  });

  it('значення кратні 1/64 (точно зберігаються у Float32 таблиці транспозицій)', () => {
    const ev = hard(5, 5);
    const rng = createRng(2);
    for (let i = 0; i < 30; i++) {
      const s = randomPosition(5, 5, 8 + rng.int(40), rng);
      for (const v of [ev.evaluate(s), evalMedium(s, AI_CONFIG.eval)]) expect(Math.fround(v)).toBe(v);
    }
  });

  it('відкритий довгий ланцюг, який гравець може забрати, дає позитивну оцінку', () => {
    const s = fromAscii(2, 4, [
      dots(true, true, true, true),
      boxes(true, false, false, false, false),
      dots(true, true, true, true),
      boxes(false, false, false, false, false),
      dots(true, true, true, true),
    ]);
    expect(s.sides[0]).toBe(3);
    expect(hard(2, 4).evaluate(s)).toBeGreaterThan(0);
    expect(greedyCaptureCount(s)).toBe(4);
    expect(evalMedium(s, AI_CONFIG.eval)).toBeGreaterThan(3);
    expect(s.sides[0]).toBe(3);
    expect(s.freeEdges).toBe(5 + 5 - 1);
  });

  it('safeMoveRollout повертає стан без змін', () => {
    const s = randomPosition(4, 4, 30, createRng(6));
    const snap = { e: s.edges.slice(), lo: s.hashLo, free: s.freeEdges, mover: s.toMove };
    const n = safeMoveRollout(s);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(Array.from(s.edges)).toEqual(Array.from(snap.e));
    expect(s.hashLo).toBe(snap.lo);
    expect(s.freeEdges).toBe(snap.free);
    expect(s.toMove).toBe(snap.mover);
  });
});

describe('таблиця транспозицій', () => {
  it('зберігає межі, глибину й хід; глибший запис не затирається мілкішим', () => {
    const tt = new TranspositionTable(10);
    expect(tt.probe(1, 2)).toBe(-1);
    tt.store(1, 2, 5, -3, 4, 17);
    const i = tt.probe(1, 2);
    expect(i).toBeGreaterThanOrEqual(0);
    expect([tt.lower[i], tt.upper[i], tt.depth[i], tt.move[i]]).toEqual([-3, 4, 5, 17]);
    tt.store(1, 2, 3, 0, 1, 9);
    expect([tt.lower[i], tt.upper[i], tt.depth[i], tt.move[i]]).toEqual([-3, 4, 5, 17]);
    tt.store(1, 2, 5, -1, 6, NO_MOVE);
    expect([tt.lower[i], tt.upper[i]]).toEqual([-1, 4]);
    tt.store(1, 2, 8, 2, 2, 5);
    expect([tt.lower[i], tt.upper[i], tt.depth[i], tt.move[i]]).toEqual([2, 2, 8, 5]);
  });

  it('різні ключі в одному кошику співіснують (2 слоти), clear() очищає', () => {
    const tt = new TranspositionTable(4);
    tt.store(0, 0, 1, 0, 0, 1);
    tt.store(16, 0, 1, 1, 1, 2);
    expect(tt.probe(0, 0)).toBeGreaterThanOrEqual(0);
    expect(tt.probe(16, 0)).toBeGreaterThanOrEqual(0);
    tt.clear();
    expect(tt.probe(0, 0)).toBe(-1);
  });
});
