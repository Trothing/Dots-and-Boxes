import { describe, expect, it } from 'vitest';
import { analyzeChains, fromAscii, fromEdges, getBoard, hEdge, isHalfHeartedHandout, sacrificeSize, vEdge } from './index';

const dots = (...h: boolean[]): string => '+' + h.map((x) => (x ? '---' : '   ')).join('+') + '+';
const boxes = (...v: boolean[]): string => v.map((x) => (x ? '|' : ' ')).join('   ');

describe('аналіз ланцюгів і циклів', () => {
  const twoPlusThree = () =>
    fromAscii(1, 5, [
      dots(false, true, true, true, true),
      boxes(true, false, true, false, false, true),
      dots(true, false, false, true, false),
    ]);

  it('визначає довжини ланцюгів і ознаку «довгий»', () => {
    const chains = analyzeChains(twoPlusThree());
    const lengths = chains.map((c) => c.length).sort();
    expect(lengths).toEqual([2, 3]);
    expect(chains.find((c) => c.length === 2)?.isLong).toBe(false);
    expect(chains.find((c) => c.length === 3)?.isLong).toBe(true);
    expect(chains.every((c) => c.kind === 'chain' && !c.isOpen)).toBe(true);
  });

  it('розмір жертви дорівнює довжині відкритого ланцюга', () => {
    const s = twoPlusThree();
    const b = s.board;
    for (const e of [hEdge(b, 0, 0), vEdge(b, 0, 1), hEdge(b, 1, 1)]) expect(sacrificeSize(s, e)).toBe(2);
    for (const e of [hEdge(b, 1, 2), vEdge(b, 0, 3), vEdge(b, 0, 4), hEdge(b, 1, 4)]) expect(sacrificeSize(s, e)).toBe(3);
  });

  it('hard-hearted (середина) і half-hearted (край) для ланцюга з 2 коробок', () => {
    const s = twoPlusThree();
    const b = s.board;
    expect(isHalfHeartedHandout(s, vEdge(b, 0, 1))).toBe(false);
    expect(isHalfHeartedHandout(s, hEdge(b, 0, 0))).toBe(true);
    expect(isHalfHeartedHandout(s, hEdge(b, 1, 1))).toBe(true);
    expect(isHalfHeartedHandout(s, hEdge(b, 1, 2))).toBe(false);
  });

  it('цикл завжди довгий (мінімум 4 коробки)', () => {
    const b = getBoard(2, 2);
    const outer = [hEdge(b, 0, 0), hEdge(b, 0, 1), hEdge(b, 2, 0), hEdge(b, 2, 1), vEdge(b, 0, 0), vEdge(b, 1, 0), vEdge(b, 0, 2), vEdge(b, 1, 2)];
    const chains = analyzeChains(fromEdges(2, 2, outer));
    expect(chains).toHaveLength(1);
    expect(chains[0]?.kind).toBe('cycle');
    expect(chains[0]?.length).toBe(4);
    expect(chains[0]?.isLong).toBe(true);
  });

  it('відкритий ланцюг (є коробка з 3 сторонами) позначається як відкритий', () => {
    const b = getBoard(1, 3);
    const s = fromEdges(1, 3, [hEdge(b, 0, 0), hEdge(b, 1, 0), vEdge(b, 0, 0), hEdge(b, 0, 1), hEdge(b, 1, 1), hEdge(b, 0, 2), hEdge(b, 1, 2)]);
    const chains = analyzeChains(s);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.length).toBe(3);
    expect(chains[0]?.isOpen).toBe(true);
  });
});
