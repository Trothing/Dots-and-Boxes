export interface Board {
  readonly rows: number;
  readonly cols: number;
  readonly numBoxes: number;
  readonly numEdges: number;
  readonly numHorizontal: number;
  readonly boxEdges: Int16Array;
  readonly edgeBoxes: Int16Array;
  readonly isHorizontal: Uint8Array;
  readonly edgeRow: Uint8Array;
  readonly edgeCol: Uint8Array;
  readonly centerRank: Int16Array;
}

const cache = new Map<string, Board>();

export function hEdge(board: Pick<Board, 'cols'>, r: number, c: number): number {
  return r * board.cols + c;
}

export function vEdge(board: Pick<Board, 'rows' | 'cols' | 'numHorizontal'>, r: number, c: number): number {
  return board.numHorizontal + r * (board.cols + 1) + c;
}

export function getBoard(rows: number, cols: number): Board {
  const key = `${rows}x${cols}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const board = buildBoard(rows, cols);
  cache.set(key, board);
  return board;
}

function buildBoard(rows: number, cols: number): Board {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error(`Invalid board size ${rows}x${cols}`);
  }
  const numBoxes = rows * cols;
  const numHorizontal = (rows + 1) * cols;
  const numEdges = numHorizontal + rows * (cols + 1);
  const boxEdges = new Int16Array(numBoxes * 4);
  const edgeBoxes = new Int16Array(numEdges * 2).fill(-1);
  const isHorizontal = new Uint8Array(numEdges);
  const edgeRow = new Uint8Array(numEdges);
  const edgeCol = new Uint8Array(numEdges);
  const geom = { rows, cols, numHorizontal };

  const attach = (e: number, box: number): void => {
    if (edgeBoxes[e * 2] < 0) edgeBoxes[e * 2] = box;
    else edgeBoxes[e * 2 + 1] = box;
  };

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const e = hEdge(geom, r, c);
      isHorizontal[e] = 1;
      edgeRow[e] = r;
      edgeCol[e] = c;
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const e = vEdge(geom, r, c);
      edgeRow[e] = r;
      edgeCol[e] = c;
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const b = r * cols + c;
      const sides = [hEdge(geom, r, c), hEdge(geom, r + 1, c), vEdge(geom, r, c), vEdge(geom, r, c + 1)];
      for (let k = 0; k < 4; k++) {
        boxEdges[b * 4 + k] = sides[k] as number;
        attach(sides[k] as number, b);
      }
    }
  }

  const dist = (e: number): number => {
    const y = isHorizontal[e] ? 2 * edgeRow[e] : 2 * edgeRow[e] + 1;
    const x = isHorizontal[e] ? 2 * edgeCol[e] + 1 : 2 * edgeCol[e];
    return (y - rows) ** 2 + (x - cols) ** 2;
  };
  const order = Array.from({ length: numEdges }, (_, e) => e).sort((a, b) => dist(a) - dist(b) || a - b);
  const centerRank = new Int16Array(numEdges);
  order.forEach((e, rank) => {
    centerRank[e] = rank;
  });

  return { rows, cols, numBoxes, numEdges, numHorizontal, boxEdges, edgeBoxes, isHorizontal, edgeRow, edgeCol, centerRank };
}

export function otherBox(board: Board, e: number, b: number): number {
  const x = board.edgeBoxes[e * 2] as number;
  return x === b ? (board.edgeBoxes[e * 2 + 1] as number) : x;
}
