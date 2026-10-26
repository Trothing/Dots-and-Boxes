import { describe, expect, it } from 'vitest';
import { createRng, createState } from '../engine';
import { randomPosition } from '../lab/positions';
import { AI_CONFIG } from './config';
import { AIPlayer } from './player';

const TOLERANCE = 1.25;

describe('укладання в бюджет часу', () => {
  it('складний рівень: порожнє поле 5×5', () => {
    const player = new AIPlayer('hard');
    const r = player.choose(createState(5, 5));
    expect(r.depth).toBeGreaterThanOrEqual(2);
    expect(r.timeMs).toBeLessThanOrEqual(AI_CONFIG.hard.timeBudgetMs * TOLERANCE);
  });

  it('складний рівень: позиція з ~20 вільними лініями', () => {
    const player = new AIPlayer('hard');
    for (let i = 0; i < 3; i++) {
      const s = randomPosition(5, 5, 20 + i, createRng(300 + i));
      const r = player.choose(s);
      expect(r.timeMs).toBeLessThanOrEqual(AI_CONFIG.hard.timeBudgetMs * TOLERANCE);
    }
  });

  it('складний рівень: власний (менший) бюджет також дотримується', () => {
    const player = new AIPlayer('hard', { timeBudgetMs: 200 });
    const r = player.choose(createState(5, 5));
    expect(r.timeMs).toBeLessThanOrEqual(200 * TOLERANCE);
  });

  it('середній рівень: порожнє поле 5×5 і дебютна позиція', () => {
    const player = new AIPlayer('medium');
    expect(player.choose(createState(5, 5)).timeMs).toBeLessThanOrEqual(AI_CONFIG.medium.timeBudgetMs * TOLERANCE);
    const s = randomPosition(5, 5, 36, createRng(9));
    expect(player.choose(s).timeMs).toBeLessThanOrEqual(AI_CONFIG.medium.timeBudgetMs * TOLERANCE);
  });

  it('переривання за часом не псує результат: хід завжди легальний', () => {
    const player = new AIPlayer('hard', { timeBudgetMs: 1 });
    const rng = createRng(4);
    for (const free of [60, 45, 30]) {
      const s = randomPosition(5, 5, free, rng);
      const r = player.choose(s);
      expect(s.edges[r.move]).toBe(0);
    }
  });
});
