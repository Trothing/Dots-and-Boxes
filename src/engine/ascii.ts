import { hEdge, vEdge } from './board';
import { type GameState, type Player, fromEdges } from './state';

export function fromAscii(
  rows: number,
  cols: number,
  lines: readonly string[],
  toMove: Player = 0,
  scores: readonly [number, number] = [0, 0],
): GameState {
  if (lines.length !== 2 * rows + 1) throw new Error(`Expected ${2 * rows + 1} lines, got ${lines.length}`);
  const geom = { rows, cols, numHorizontal: (rows + 1) * cols };
  const edges: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const dotLine = lines[2 * r] as string;
    for (let c = 0; c < cols; c++) if (dotLine[4 * c + 1] === '-') edges.push(hEdge(geom, r, c));
    if (r < rows) {
      const boxLine = lines[2 * r + 1] as string;
      for (let c = 0; c <= cols; c++) if (boxLine[4 * c] === '|') edges.push(vEdge(geom, r, c));
    }
  }
  return fromEdges(rows, cols, edges, toMove, scores);
}

export function toAscii(s: GameState): string[] {
  const { rows, cols } = s.board;
  const geom = s.board;
  const out: string[] = [];
  for (let r = 0; r <= rows; r++) {
    let dots = '+';
    for (let c = 0; c < cols; c++) dots += (s.edges[hEdge(geom, r, c)] ? '---' : '   ') + '+';
    out.push(dots);
    if (r < rows) {
      let line = '';
      for (let c = 0; c <= cols; c++) {
        line += s.edges[vEdge(geom, r, c)] ? '|' : ' ';
        if (c < cols) {
          const box = r * cols + c;
          const o = s.owner[box] as number;
          line += s.sides[box] === 4 ? (o === 0 ? ' A ' : o === 1 ? ' B ' : ' # ') : `  ${s.sides[box]}`.slice(-3).replace('0', ' ');
        }
      }
      out.push(line);
    }
  }
  return out;
}
