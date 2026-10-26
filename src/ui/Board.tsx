import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { GameState, Player } from '../engine';

const CELL = 100;
const PAD = 30;
const DOT_R = 5;
const LINE_W = 7;

interface BoardProps {
  state: GameState;
  edgeOwner: Int8Array;
  humanPlayer: Player;
  interactive: boolean;
  hintEdge: number | null;
  lastAiEdge: number | null;
  showDanger: boolean;
  onPlay: (edge: number) => void;
}

const dotX = (c: number): number => PAD + c * CELL;
const dotY = (r: number): number => PAD + r * CELL;

type Dir = 'left' | 'right' | 'up' | 'down';

export function Board({ state, edgeOwner, humanPlayer, interactive, hintEdge, lastAiEdge, showDanger, onPlay }: BoardProps) {
  const { board } = state;
  const { rows, cols } = board;
  const width = 2 * PAD + cols * CELL;
  const height = 2 * PAD + rows * CELL;
  const refs = useRef<Array<SVGGElement | null>>([]);
  const [focusEdge, setFocusEdge] = useState<number | null>(null);

  const geometry = useMemo(
    () =>
      Array.from({ length: board.numEdges }, (_, e) => {
        const r = board.edgeRow[e] as number;
        const c = board.edgeCol[e] as number;
        const horizontal = board.isHorizontal[e] === 1;
        const x1 = dotX(c);
        const y1 = dotY(r);
        const x2 = horizontal ? x1 + CELL : x1;
        const y2 = horizontal ? y1 : y1 + CELL;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const half = CELL / 2;
        const sideA = horizontal ? (r > 0 ? [mx, my - half] : []) : c > 0 ? [mx - half, my] : [];
        const sideB = horizontal ? (r < rows ? [mx, my + half] : []) : c < cols ? [mx + half, my] : [];
        const pts = [[x1, y1], sideA, [x2, y2], sideB].filter((p) => p.length === 2).map((p) => p.join(',')).join(' ');
        return { x1, y1, x2, y2, mx, my, horizontal, r, c, pts };
      }),
    [board],
  );

  const freeEdges = useMemo(() => {
    const out: number[] = [];
    for (let e = 0; e < board.numEdges; e++) if (!state.edges[e]) out.push(e);
    return out;
  }, [board, state.freeEdges, state.hashLo, state.hashHi]);

  const tabStop = focusEdge !== null && !state.edges[focusEdge] ? focusEdge : (freeEdges[0] ?? -1);

  const move = (from: number, dir: Dir): void => {
    const g = geometry[from];
    if (!g) return;
    let best = -1;
    let bestScore = Infinity;
    for (const e of freeEdges) {
      if (e === from) continue;
      const h = geometry[e];
      if (!h) continue;
      const dx = h.mx - g.mx;
      const dy = h.my - g.my;
      const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 1) continue;
      const score = along + 2.5 * across;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best >= 0) refs.current[best]?.focus();
  };

  const onKeyDown = (e: number) => (ev: KeyboardEvent<SVGGElement>) => {
    const dirs: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    const dir = dirs[ev.key];
    if (dir) {
      ev.preventDefault();
      move(e, dir);
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      if (interactive) onPlay(e);
    }
  };

  const label = (e: number): string => {
    const g = geometry[e] as (typeof geometry)[number];
    return `${g.horizontal ? 'Horizontal' : 'Vertical'} line, row ${g.r + 1}, column ${g.c + 1}`;
  };

  return (
    <svg
      className="board"
      viewBox={`0 0 ${width} ${height}`}
      role="group"
      aria-label={`Game board, ${rows} by ${cols} boxes`}
      preserveAspectRatio="xMidYMid meet"
    >
      {Array.from({ length: board.numBoxes }, (_, b) => {
        const r = Math.floor(b / cols);
        const c = b % cols;
        const owner = state.owner[b] as number;
        const closedUnknown = state.sides[b] === 4 && owner < 0;
        const danger = showDanger && state.sides[b] === 3;
        const mine = owner === humanPlayer;
        const x = dotX(c);
        const y = dotY(r);
        return (
          <g key={b} aria-hidden="true">
            <rect
              x={x + 5}
              y={y + 5}
              width={CELL - 10}
              height={CELL - 10}
              rx={9}
              className={owner >= 0 ? (mine ? 'box box-human' : 'box box-ai') : closedUnknown ? 'box' : danger ? 'box box-danger' : 'box box-empty'}
            />
            {owner >= 0 && (
              <text x={x + CELL / 2} y={y + CELL / 2} className={mine ? 'box-label label-human' : 'box-label label-ai'}>
                {mine ? 'You' : 'AI'}
              </text>
            )}
            {danger && owner < 0 && (
              <text x={x + CELL / 2} y={y + CELL / 2} className="box-label label-danger">
                !
              </text>
            )}
          </g>
        );
      })}

      {geometry.map((g, e) => {
        const owner = edgeOwner[e] as number;
        const taken = state.edges[e] === 1;
        if (taken) {
          const human = owner === humanPlayer;
          const isLast = e === lastAiEdge;
          return (
            <g key={e} aria-hidden="true">
              <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} className={human ? 'edge edge-human' : 'edge edge-ai'} strokeWidth={human ? LINE_W : LINE_W + 3} />
              {!human && <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} className="edge-ai-mark" strokeWidth={LINE_W - 2} />}
              {isLast && <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} className="edge-last" strokeWidth={LINE_W + 9} />}
            </g>
          );
        }
        const active = interactive;
        const isHint = e === hintEdge;
        return (
          <g
            key={e}
            ref={(el) => {
              refs.current[e] = el;
            }}
            className={`slot${active ? ' slot-active' : ''}${isHint ? ' slot-hint' : ''}`}
            role="button"
            aria-label={label(e) + (isHint ? ' (hint)' : '')}
            aria-disabled={!active}
            tabIndex={e === tabStop ? 0 : -1}
            onFocus={() => setFocusEdge(e)}
            onKeyDown={onKeyDown(e)}
            onClick={() => active && onPlay(e)}
          >
            <polygon points={g.pts} className="hit" />
            <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} className="slot-line" strokeWidth={LINE_W} />
          </g>
        );
      })}

      {Array.from({ length: (rows + 1) * (cols + 1) }, (_, i) => {
        const r = Math.floor(i / (cols + 1));
        const c = i % (cols + 1);
        return <circle key={i} cx={dotX(c)} cy={dotY(r)} r={DOT_R} className="dot" aria-hidden="true" />;
      })}
    </svg>
  );
}
