import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Level } from '../ai/config';
import {
  aiConfigSummary,
  ALL_SIZES,
  DEFAULT_PARAMS,
  LEVEL_NAMES,
  runLab,
  toCsv,
  toMarkdown,
  type LabParams,
  type Meta,
  type SizeKey,
} from '../lab/experiments';

const USAGE = `Usage: npm run bench -- [options]
  --size 3x3|4x4|5x5     board (repeat or comma-separated; all three by default)
  --games N              games per pair (default 20 for 5x5 and 50 for 3x3/4x4)
  --a easy|medium|hard   first level of the pair
  --b easy|medium|hard   second level of the pair (--a and --b together define one pair)
  --budget-hard ms       hard level time budget per move (default 1500)
  --seed S               position generator seed (default 1)
  --ablation             add experiment 4 (ablation) to the run
  --only matches|stages|ablation   run a single experiment
  --stage-positions N    positions per stage in experiment 3 (default 5)
  --ablation-cap N       node limit for minimax in the ablation (default 2e7)
  --ablation-time-cap ms time limit for each alpha-beta run in the ablation (default 20000)
  --ablation-positions N positions in the ablation (default 3)
  --ablation-free N      free lines in the ablation positions (default 22)
  --out directory        where to write the results (default docs)
  --no-write             do not write files`;

function fail(msg: string): never {
  console.error(`${msg}\n\n${USAGE}`);
  process.exit(1);
}

const LEVELS: Level[] = ['easy', 'medium', 'hard'];
const asLevel = (v: string | undefined): Level => (LEVELS.includes(v as Level) ? (v as Level) : fail(`Unknown level: ${v}`));
const asSize = (v: string): SizeKey => (ALL_SIZES.includes(v as SizeKey) ? (v as SizeKey) : fail(`Unknown board size: ${v}`));
const asNumber = (flag: string, v: string | undefined): number => {
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) && n > 0 ? n : fail(`Option ${flag} requires a positive number`);
};

function parseArgs(argv: string[]): { params: LabParams; out: string; write: boolean } {
  const params: LabParams = { ...DEFAULT_PARAMS };
  let a: Level | undefined;
  let b: Level | undefined;
  let only: string | undefined;
  let out = 'docs';
  let write = true;
  const sizes: SizeKey[] = [];
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i] as string;
    const next = (): string | undefined => argv[++i];
    switch (flag) {
      case '--size':
        (next() ?? '').split(',').forEach((v) => sizes.push(asSize(v)));
        break;
      case '--games':
        params.games = asNumber(flag, next());
        break;
      case '--a':
        a = asLevel(next());
        break;
      case '--b':
        b = asLevel(next());
        break;
      case '--budget-hard':
        params.hardBudgetMs = asNumber(flag, next());
        break;
      case '--seed':
        params.seed = asNumber(flag, next());
        break;
      case '--ablation':
        params.ablation = true;
        break;
      case '--only':
        only = next();
        break;
      case '--ablation-cap':
        params.ablationNodeCap = asNumber(flag, next());
        break;
      case '--ablation-time-cap':
        params.ablationTimeCapMs = asNumber(flag, next());
        break;
      case '--ablation-positions':
        params.ablationPositions = asNumber(flag, next());
        break;
      case '--ablation-free':
        params.ablationFree = asNumber(flag, next());
        break;
      case '--stage-positions':
        params.stagePositions = asNumber(flag, next());
        break;
      case '--out':
        out = next() ?? out;
        break;
      case '--no-write':
        write = false;
        break;
      case '--help':
      case '-h':
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        fail(`Unknown option: ${flag}`);
    }
  }
  if (sizes.length) params.sizes = sizes;
  if (a || b) {
    if (!a || !b) fail('Options --a and --b must be given together');
    params.pairs = [[a, b]];
  }
  if (only) {
    if (!['matches', 'stages', 'ablation'].includes(only)) fail(`--only: unknown experiment ${only}`);
    params.matches = only === 'matches';
    params.stages = only === 'stages';
    params.ablation = only === 'ablation';
  }
  return { params, out, write };
}

function systemMeta(params: LabParams): Meta {
  const cpus = os.cpus();
  return {
    Date: new Date().toISOString(),
    'Node version': process.version,
    OS: `${os.type()} ${os.release()} (${os.arch()})`,
    CPU: `${cpus[0]?.model.trim() ?? 'unknown'} × ${cpus.length} logical cores`,
    'Memory': `${(os.totalmem() / 2 ** 30).toFixed(1)} GB`,
    'AI configuration': aiConfigSummary(params.hardBudgetMs),
    Parameters: `seed=${params.seed}, hard budget=${params.hardBudgetMs} ms, pairs=${params.pairs
      .map(([x, y]) => `${LEVEL_NAMES[x]}–${LEVEL_NAMES[y]}`)
      .join(', ')}, boards=${params.sizes.join(', ')}`,
  };
}

function main(): void {
  const { params, out, write } = parseArgs(process.argv.slice(2));
  const meta = systemMeta(params);
  console.log('System:');
  for (const [k, v] of Object.entries(meta)) console.log(`  ${k}: ${v}`);
  console.log('');

  const started = Date.now();
  let lastPhase = '';
  const tables = runLab(params, {
    onProgress: ({ phase, done, total }) => {
      if (phase !== lastPhase || done === total) {
        lastPhase = phase;
        process.stderr.write(`\r[${done}/${total}] ${phase}`.padEnd(100));
      }
    },
  });
  process.stderr.write('\n');
  meta['Run time'] = `${((Date.now() - started) / 60000).toFixed(1)} min`;

  const md = toMarkdown(tables, meta);
  console.log(md);
  if (write) {
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', out);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'bench-results.md'), md, 'utf8');
    writeFileSync(resolve(dir, 'bench-results.csv'), toCsv(tables, meta), 'utf8');
    console.log(`Written: ${resolve(dir, 'bench-results.md')} and bench-results.csv`);
  }
}

main();
