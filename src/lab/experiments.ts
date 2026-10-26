import { AIPlayer } from '../ai/player';
import { AI_CONFIG, searchSettings, type Level, type SearchSettings } from '../ai/config';
import { minimax, NodeLimitExceeded, Searcher } from '../ai/search';
import { cloneState, createRng, getBoard, type Player } from '../engine';
import { emptyStats, mergeStats, playGame, type MoveStats } from './match';
import { randomOpening, randomPosition } from './positions';

export type SizeKey = '3x3' | '4x4' | '5x5';
export const ALL_SIZES: SizeKey[] = ['3x3', '4x4', '5x5'];
export const LEVEL_NAMES: Record<Level, string> = { easy: 'easy', medium: 'medium', hard: 'hard' };

export function parseSize(key: SizeKey): [number, number] {
  const [r, c] = key.split('x').map(Number);
  return [r as number, c as number];
}

export interface Table {
  id: string;
  title: string;
  header: string[];
  rows: Array<Array<string | number>>;
  note?: string;
}

export interface LabParams {
  sizes: SizeKey[];
  pairs: Array<[Level, Level]>;
  games?: number;
  hardBudgetMs: number;
  seed: number;
  matches: boolean;
  stages: boolean;
  ablation: boolean;
  stageSize: SizeKey;
  stageFree: number[];
  stagePositions: number;
  ablationSize: SizeKey;
  ablationFree: number;
  ablationDepths: number[];
  ablationPositions: number;
  ablationNodeCap: number;
  ablationTimeCapMs: number;
}

export const DEFAULT_PARAMS: LabParams = {
  sizes: ALL_SIZES,
  pairs: [
    ['easy', 'medium'],
    ['medium', 'hard'],
    ['easy', 'hard'],
  ],
  hardBudgetMs: AI_CONFIG.hard.timeBudgetMs,
  seed: 1,
  matches: true,
  stages: true,
  ablation: false,
  stageSize: '5x5',
  stageFree: [60, 50, 40, 30, 20, 15, 10],
  stagePositions: 5,
  ablationSize: '4x4',
  ablationFree: 22,
  ablationDepths: [3, 4, 5, 6],
  ablationPositions: 3,
  ablationNodeCap: 20_000_000,
  ablationTimeCapMs: 20_000,
};

export interface LabProgress {
  phase: string;
  done: number;
  total: number;
}

export interface LabHooks {
  onProgress?: (p: LabProgress) => void;
  cancelled?: () => boolean;
}

export const defaultGames = (size: SizeKey): number => (size === '5x5' ? 20 : 50);
export function aiConfigSummary(hardBudgetMs: number): string {
  const m = AI_CONFIG.medium;
  const h = AI_CONFIG.hard;
  return (
    `medium: depth ${m.maxDepth}, limit ${m.timeBudgetMs} ms; hard: budget ${hardBudgetMs} ms, ` +
    `TT 2^${h.ttBits}, exactLimit=${h.exactLimit}, sacrificeSafeMax=${h.sacrificeSafeMax}`
  );
}

export const ACCEPTANCE_POINTS = 0.65;
const openingPlies = (size: SizeKey): number => (size === '3x3' ? 2 : size === '4x4' ? 4 : 6);

const fmt = (x: number, digits = 1): string => x.toFixed(digits);
const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;

function makePlayer(level: Level, params: LabParams): AIPlayer {
  return new AIPlayer(level, level === 'hard' ? { timeBudgetMs: params.hardBudgetMs } : {});
}

class Cancelled extends Error {}

export function runLab(params: LabParams, hooks: LabHooks = {}): Table[] {
  const tables: Table[] = [];
  const games = (size: SizeKey): number => params.games ?? defaultGames(size);
  const total =
    (params.matches ? params.sizes.reduce((acc, sz) => acc + games(sz) * params.pairs.length, 0) : 0) +
    (params.stages ? params.stageFree.length * params.stagePositions : 0) +
    (params.ablation ? params.ablationPositions * params.ablationDepths.length : 0);
  let done = 0;
  const tick = (phase: string): void => {
    done++;
    if (hooks.cancelled?.()) throw new Cancelled();
    hooks.onProgress?.({ phase, done, total });
  };
  hooks.onProgress?.({ phase: 'Starting', done: 0, total });

  try {
    if (params.matches) tables.push(...runMatches(params, games, tick));
    if (params.stages) tables.push(runStages(params, tick));
    if (params.ablation) tables.push(runAblation(params, tick));
  } catch (e) {
    if (!(e instanceof Cancelled)) throw e;
  }
  return tables;
}

function runMatches(params: LabParams, games: (s: SizeKey) => number, tick: (phase: string) => void): Table[] {
  const matchRows: Array<Array<string | number>> = [];
  const timingRows: Array<Array<string | number>> = [];
  const summaries: Array<{ size: SizeKey; a: Level; b: Level; pointsA: number }> = [];

  for (const size of params.sizes) {
    const [rows, cols] = parseSize(size);
    const players = new Map<Level, AIPlayer>();
    const get = (lvl: Level): AIPlayer => {
      let p = players.get(lvl);
      if (!p) {
        p = makePlayer(lvl, params);
        players.set(lvl, p);
      }
      return p;
    };
    const stats = new Map<Level, MoveStats>();

    for (const [la, lb] of params.pairs) {
      const n = games(size);
      let winsA = 0;
      let draws = 0;
      let winsB = 0;
      let diffSum = 0;
      for (let g = 0; g < n; g++) {
        const rng = createRng(params.seed * 1_000_003 + (g >> 1) * 7919 + rows * 31 + cols);
        const opening = randomOpening(rows, cols, openingPlies(size), rng);
        const aPlayer = (g % 2) as Player;
        const r = playGame(get(la), get(lb), cloneState(opening), aPlayer);
        if (r.scoreA > r.scoreB) winsA++;
        else if (r.scoreA < r.scoreB) winsB++;
        else draws++;
        diffSum += r.scoreA - r.scoreB;
        for (const [lvl, st] of [
          [la, r.statsA],
          [lb, r.statsB],
        ] as const) {
          const acc = stats.get(lvl) ?? emptyStats();
          mergeStats(acc, st);
          stats.set(lvl, acc);
        }
        tick(`Match ${size}: ${LEVEL_NAMES[la]} vs ${LEVEL_NAMES[lb]} (${g + 1}/${n})`);
      }
      const pointsA = (winsA + 0.5 * draws) / n;
      summaries.push({ size, a: la, b: lb, pointsA });
      matchRows.push([size, LEVEL_NAMES[la], LEVEL_NAMES[lb], n, winsA, draws, winsB, fmt(diffSum / n, 2), pct(pointsA)]);
    }

    for (const lvl of ['easy', 'medium', 'hard'] as Level[]) {
      const st = stats.get(lvl);
      if (!st || st.searched === 0) continue;
      timingRows.push([
        size,
        LEVEL_NAMES[lvl],
        st.searched,
        fmt(st.totalMs / st.searched, 2),
        fmt(st.maxMs, 1),
        Math.round(st.nodes / st.searched),
        lvl === 'easy' ? '—' : fmt(st.depthSum / st.searched, 1),
        st.ttProbes > 0 ? pct(st.ttHits / st.ttProbes) : '—',
      ]);
    }
  }

  const pointsOf = (size: SizeKey, winner: Level, loser: Level): number | null => {
    const m = summaries.find((x) => x.size === size && ((x.a === winner && x.b === loser) || (x.a === loser && x.b === winner)));
    return m ? (m.a === winner ? m.pointsA : 1 - m.pointsA) : null;
  };
  const checks: Array<[string, Level, Level, SizeKey[]]> = [
    ['Medium vs easy', 'medium', 'easy', ALL_SIZES],
    ['Hard vs medium', 'hard', 'medium', ['4x4', '5x5']],
  ];
  const criteriaRows: Array<Array<string | number>> = [];
  for (const [name, winner, loser, sizes] of checks) {
    for (const size of sizes) {
      const points = pointsOf(size, winner, loser);
      if (points !== null) criteriaRows.push([name, size, pct(points), `≥ ${pct(ACCEPTANCE_POINTS)}`, points >= ACCEPTANCE_POINTS ? 'yes' : 'no']);
    }
  }

  const budget = params.hardBudgetMs;
  return [
    {
      id: 'matches',
      title: 'Experiment 1. Matches between difficulty levels',
      header: ['Board', 'A', 'B', 'Games', 'A wins', 'Draws', 'B wins', 'Avg. margin (A−B)', 'A points'],
      rows: matchRows,
      note: `Sides alternate; each opening position (random safe moves, seed=${params.seed}) is played twice with the sides swapped. Points: win = 1, draw = 0.5. Hard level budget: ${budget} ms per move.`,
    },
    {
      id: 'timing',
      title: 'Experiment 2. Time and nodes per move',
      header: ['Board', 'Level', 'Searched moves', 'Avg. time, ms', 'Max time, ms', 'Avg. nodes', 'Avg. depth', 'TT hits'],
      rows: timingRows,
      note: 'Only moves where a search ran are counted (forced captures are not). Depth is not defined for the easy level. Data comes from the games of experiment 1.',
    },
    {
      id: 'criteria',
      title: 'AI acceptance criteria',
      header: ['Criterion', 'Board', 'Points of the stronger level', 'Requirement', 'Met'],
      rows: criteriaRows,
      note: 'Medium vs easy on all sizes; hard vs medium on 4×4 and 5×5. Points: win = 1, draw = 0.5. Taken from experiment 1 (for the pairs that were run).',
    },
  ];
}

function runStages(params: LabParams, tick: (phase: string) => void): Table {
  const [rows, cols] = parseSize(params.stageSize);
  const E = getBoard(rows, cols).numEdges;
  const rowsOut: Array<Array<string | number>> = [];
  const player = makePlayer('hard', params);
  for (const free of params.stageFree.filter((f) => f <= E)) {
    let ms = 0;
    let maxMs = 0;
    let depth = 0;
    let nodes = 0;
    let hits = 0;
    let probes = 0;
    let exact = 0;
    for (let i = 0; i < params.stagePositions; i++) {
      const rng = createRng(params.seed * 7_000_003 + free * 101 + i * 13);
      const s = randomPosition(rows, cols, free, rng);
      player.newGame();
      const r = player.choose(s);
      ms += r.timeMs;
      maxMs = Math.max(maxMs, r.timeMs);
      depth += r.depth;
      nodes += r.nodes;
      hits += r.ttHits;
      probes += r.ttProbes;
      if (r.exact) exact++;
      tick(`Stage ${params.stageSize}: ${free} free lines (${i + 1}/${params.stagePositions})`);
    }
    const n = params.stagePositions;
    rowsOut.push([free, n, fmt(ms / n, 1), fmt(maxMs, 1), fmt(depth / n, 1), Math.round(nodes / n), probes > 0 ? pct(hits / probes) : '—', pct(exact / n)]);
  }
  return {
    id: 'stages',
    title: `Experiment 3. Hard level at different stages of the game (${params.stageSize})`,
    header: ['Free lines', 'Positions', 'Avg. time, ms', 'Max time, ms', 'Avg. depth', 'Avg. nodes', 'TT hits', 'Solved exactly'],
    rows: rowsOut,
    note: `Positions come from random sensible play (seed=${params.seed}) with no captures available at the start of the move. Budget ${params.hardBudgetMs} ms; with ≤ ${AI_CONFIG.hard.exactLimit} free lines the search runs to the end of the game (depth = number of free lines).`,
  };
}

interface AblationVariant {
  name: string;
  settings: Partial<SearchSettings> | null;
}

const ABLATION_VARIANTS: AblationVariant[] = [
  { name: '(0) reference: minimax, all moves, no reductions', settings: null },
  { name: '(a) minimax without pruning', settings: { pruning: false, ordering: 'none', useTT: false } },
  { name: '(b) alpha-beta without move ordering', settings: { ordering: 'none', useTT: false } },
  { name: '(c) alpha-beta + move ordering', settings: { ordering: 'full', useTT: false } },
  { name: '(d) + transposition table', settings: { ordering: 'full', useTT: true } },
];

function runAblation(params: LabParams, tick: (phase: string) => void): Table {
  const [rows, cols] = parseSize(params.ablationSize);
  const board = getBoard(rows, cols);
  const out: Array<Array<string | number>> = [];
  const base: SearchSettings = {
    ...searchSettings('hard'),
    movePolicy: 'forced-captures',
    iterative: false,
    exactLimit: 0,
    exactTimeShare: 1,
    sacrificeSafeMax: Infinity,
    timeBudgetMs: Infinity,
    earlyStopFactor: 0,
  };

  for (const depth of params.ablationDepths) {
    const acc = ABLATION_VARIANTS.map(() => ({ nodes: 0, ms: 0, capped: null as null | 'nodes' | 'time', valuesMatch: true, runs: 0 }));
    for (let p = 0; p < params.ablationPositions; p++) {
      const rng = createRng(params.seed * 9_000_011 + p * 17 + depth);
      const s = randomPosition(rows, cols, params.ablationFree, rng);
      let reference: number | null = null;
      ABLATION_VARIANTS.forEach((variant, vi) => {
        const a = acc[vi] as (typeof acc)[number];
        const t0 = performance.now();
        let value: number;
        let nodes: number;
        if (variant.settings === null) {
          const evaluator = new Searcher(board, { ...base });
          const stats = { nodes: 0, limit: params.ablationNodeCap };
          try {
            value = minimax(cloneState(s), depth, (x) => evaluator.evaluate(x), stats);
            reference = value;
          } catch (e) {
            if (!(e instanceof NodeLimitExceeded)) throw e;
            a.capped = 'nodes';
            return;
          }
          nodes = stats.nodes;
        } else {
          const searcher = new Searcher(board, { ...base, ...variant.settings });
          searcher.setDeadline(t0 + params.ablationTimeCapMs);
          value = searcher.alphaBeta(cloneState(s), depth, -1e9, 1e9);
          if (searcher.aborted) {
            a.capped = 'time';
            return;
          }
          nodes = searcher.nodes;
          if (reference === null) reference = value;
          else if (Math.abs(value - reference) > 1e-9) a.valuesMatch = false;
        }
        a.nodes += nodes;
        a.ms += performance.now() - t0;
        a.runs++;
      });
      tick(`Ablation ${params.ablationSize}: depth ${depth}, position ${p + 1}/${params.ablationPositions}`);
    }
    ABLATION_VARIANTS.forEach((variant, vi) => {
      const a = acc[vi] as (typeof acc)[number];
      if (a.capped || a.runs === 0) {
        const what =
          a.capped === 'time'
            ? `> ${params.ablationTimeCapMs / 1000} s (aborted)`
            : `> ${params.ablationNodeCap / 1e6}M nodes (aborted)`;
        out.push([depth, variant.name, what, '—', '—']);
      } else {
        out.push([depth, variant.name, Math.round(a.nodes / a.runs), fmt(a.ms / a.runs, 1), a.valuesMatch ? 'yes' : 'no']);
      }
    });
  }
  return {
    id: 'ablation',
    title: `Experiment 4. Algorithm ablation (${params.ablationSize}, ${params.ablationFree} free lines, depth in plies)`,
    header: ['Depth', 'Variant', 'Avg. nodes', 'Avg. time, ms', 'Values match'],
    rows: out,
    note: `Average over ${params.ablationPositions} positions (seed=${params.seed}); depth is the number of moves that pass the turn. Variants (a)–(d) use the same move policy (forced captures) and the same leaf evaluation of the hard level, so their values should match (for (d) small differences are possible because of the transposition table depth). Row (0) considers all moves and usually exceeds the limit because of optional captures. ">" means the run exceeded its limit (nodes for minimax, time for alpha-beta) and was aborted.`,
  };
}

export interface Meta {
  [key: string]: string;
}

export function toMarkdown(tables: Table[], meta: Meta): string {
  const lines: string[] = ['# Experiment results', ''];
  for (const [k, v] of Object.entries(meta)) lines.push(`- **${k}:** ${v}`);
  lines.push('');
  for (const t of tables) {
    lines.push(`## ${t.title}`, '');
    lines.push(`| ${t.header.join(' | ')} |`);
    lines.push(`| ${t.header.map(() => '---').join(' | ')} |`);
    for (const r of t.rows) lines.push(`| ${r.join(' | ')} |`);
    lines.push('');
    if (t.note) lines.push(`_${t.note}_`, '');
  }
  return lines.join('\n');
}

const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(tables: Table[], meta: Meta): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(meta)) lines.push(`# ${k}: ${v}`);
  for (const t of tables) {
    lines.push('', `# ${t.title}`, t.header.map(csvCell).join(','));
    for (const r of t.rows) lines.push(r.map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}
