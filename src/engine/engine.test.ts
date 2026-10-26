import { describe, expect, it } from 'vitest';
import {
  applyMove,
  capturableMoves,
  createRng,
  createState,
  fromAscii,
  fromEdges,
  getBoard,
  hEdge,
  isGameOver,
  legalMoves,
  safeMoves,
  sacrificeMoves,
  undoMove,
  vEdge,
  winner,
} from './index';

describe('геометрія поля', () => {
  it.each([
    [2, 2, 12],
    [3, 3, 24],
    [4, 4, 40],
    [5, 5, 60],
    [3, 5, 38],
  ])('поле %ix%i має %i ліній', (r, c, edges) => {
    const b = getBoard(r, c);
    expect(b.numEdges).toBe(edges);
    expect(b.numHorizontal).toBe((r + 1) * c);
    expect(b.numEdges - b.numHorizontal).toBe(r * (c + 1));
    expect(b.numBoxes).toBe(r * c);
  });

  it('кожна коробка має 4 різні лінії, кожна лінія — 1 або 2 коробки', () => {
    const b = getBoard(4, 3);
    for (let box = 0; box < b.numBoxes; box++) {
      expect(new Set(Array.from(b.boxEdges.slice(box * 4, box * 4 + 4))).size).toBe(4);
    }
    let shared = 0;
    for (let e = 0; e < b.numEdges; e++) {
      expect(b.edgeBoxes[e * 2]).toBeGreaterThanOrEqual(0);
      if (b.edgeBoxes[e * 2 + 1] >= 0) shared++;
    }
    expect(shared).toBe(b.rows * (b.cols - 1) + (b.rows - 1) * b.cols);
  });
});

describe('хід і захоплення', () => {
  it('закриття коробки дає очко й додатковий хід', () => {
    const g = getBoard(2, 2);
    const s2 = fromEdges(2, 2, [hEdge(g, 0, 0), vEdge(g, 0, 0), hEdge(g, 1, 0)], 0);
    expect(applyMove(s2, vEdge(g, 0, 1))).toBe(1);
    expect(s2.scores[0]).toBe(1);
    expect(s2.toMove).toBe(0);
    expect(s2.owner[0]).toBe(0);
  });

  it('звичайний хід передає чергу', () => {
    const s = createState(3, 3);
    expect(applyMove(s, 0)).toBe(0);
    expect(s.toMove).toBe(1);
  });

  it('одна лінія, що закриває дві коробки, дає +2', () => {
    const s = fromAscii(1, 2, ['+---+---+', '|       |', '+---+---+'], 1);
    expect(s.sides[0]).toBe(3);
    expect(s.sides[1]).toBe(3);
    const mid = vEdge(s.board, 0, 1);
    expect(applyMove(s, mid)).toBe(2);
    expect(s.scores[1]).toBe(2);
    expect(s.toMove).toBe(1);
    expect(isGameOver(s)).toBe(true);
  });

  it('класифікація ходів: захоплення / безпечні / жертви', () => {
    const s = fromAscii(2, 2, ['+---+   +', '|       ', '+---+   +', '        ', '+   +   +']);
    expect(s.sides[0]).toBe(3);
    const cap = capturableMoves(s);
    expect(cap).toEqual([vEdge(s.board, 0, 1)]);
    expect(safeMoves(s).length + sacrificeMoves(s).length + cap.length).toBe(legalMoves(s).length);
    for (const e of safeMoves(s)) expect(cap).not.toContain(e);
  });
});

describe('applyMove / undoMove', () => {
  it.each([
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
  ])('випадкові послідовності на %ix%i повертають стан і хеш', (r, c) => {
    const rng = createRng(42 + r);
    const s = createState(r, c);
    for (let iter = 0; iter < 250; iter++) {
      const snap = {
        edges: s.edges.slice(),
        sides: s.sides.slice(),
        owner: s.owner.slice(),
        scores: s.scores.slice(),
        toMove: s.toMove,
        free: s.freeEdges,
        lo: s.hashLo,
        hi: s.hashHi,
      };
      const played: number[] = [];
      const len = 1 + rng.int(Math.min(s.freeEdges, 12));
      for (let i = 0; i < len && s.freeEdges > 0; i++) {
        const e = rng.pick(legalMoves(s));
        applyMove(s, e);
        played.push(e);
      }
      for (let i = played.length - 1; i >= 0; i--) undoMove(s, played[i] as number);
      expect(Array.from(s.edges)).toEqual(Array.from(snap.edges));
      expect(Array.from(s.sides)).toEqual(Array.from(snap.sides));
      expect(Array.from(s.owner)).toEqual(Array.from(snap.owner));
      expect(Array.from(s.scores)).toEqual(Array.from(snap.scores));
      expect(s.toMove).toBe(snap.toMove);
      expect(s.freeEdges).toBe(snap.free);
      expect(s.hashLo).toBe(snap.lo);
      expect(s.hashHi).toBe(snap.hi);
      if (s.freeEdges > 6) for (let i = 0; i < 3; i++) applyMove(s, rng.pick(legalMoves(s)));
    }
  });

  it('хеш не залежить від порядку ходів', () => {
    const a = createState(3, 3);
    const b = createState(3, 3);
    [0, 5, 9, 14].forEach((e) => applyMove(a, e));
    [14, 9, 0, 5].forEach((e) => applyMove(b, e));
    expect(a.hashLo).toBe(b.hashLo);
    expect(a.hashHi).toBe(b.hashHi);
  });
});

describe('кінець гри', () => {
  it('переможець і нічия', () => {
    const rng = createRng(7);
    const s = createState(2, 2);
    while (!isGameOver(s)) applyMove(s, rng.pick(legalMoves(s)));
    expect(s.scores[0] + s.scores[1]).toBe(4);
    const w = winner(s);
    if (s.scores[0] === s.scores[1]) expect(w).toBe('draw');
    else expect(w).toBe(s.scores[0] > s.scores[1] ? 0 : 1);
    s.scores[0] = 2;
    s.scores[1] = 2;
    expect(winner(s)).toBe('draw');
    s.scores[1] = 3;
    expect(winner(s)).toBe(1);
  });
});
