import { useEffect, useMemo, useRef, useState } from 'react';
import type { Level } from '../ai/config';
import {
  aiConfigSummary,
  ALL_SIZES,
  DEFAULT_PARAMS,
  LEVEL_NAMES,
  defaultGames,
  toCsv,
  toMarkdown,
  type LabParams,
  type LabProgress,
  type Meta,
  type SizeKey,
  type Table,
} from '../lab/experiments';
import type { LabResponse } from '../lab/worker';

type PairKey = 'easy-medium' | 'medium-hard' | 'easy-hard';
const PAIRS: Record<PairKey, [Level, Level]> = {
  'easy-medium': ['easy', 'medium'],
  'medium-hard': ['medium', 'hard'],
  'easy-hard': ['easy', 'hard'],
};

function browserMeta(params: LabParams): Meta {
  return {
    Date: new Date().toISOString(),
    Environment: 'Browser (Web Worker)',
    'User-Agent': navigator.userAgent,
    'Logical cores': String(navigator.hardwareConcurrency ?? '—'),
    'AI configuration': aiConfigSummary(params.hardBudgetMs),
    Parameters: `seed=${params.seed}, hard budget=${params.hardBudgetMs} ms, pairs=${params.pairs
      .map(([a, b]) => `${LEVEL_NAMES[a]}–${LEVEL_NAMES[b]}`)
      .join(', ')}, boards=${params.sizes.join(', ')}`,
  };
}

export function LabPage() {
  const [sizes, setSizes] = useState<SizeKey[]>(['3x3', '4x4']);
  const [pairs, setPairs] = useState<PairKey[]>(['easy-medium', 'medium-hard', 'easy-hard']);
  const [games, setGames] = useState('');
  const [budget, setBudget] = useState(String(DEFAULT_PARAMS.hardBudgetMs));
  const [seed, setSeed] = useState('1');
  const [stages, setStages] = useState(true);
  const [ablation, setAblation] = useState(false);
  const [matches, setMatches] = useState(true);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<LabProgress | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [meta, setMeta] = useState<Meta>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const toggle = <T,>(list: T[], item: T, set: (v: T[]) => void): void =>
    set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const params = useMemo<LabParams>(
    () => ({
      ...DEFAULT_PARAMS,
      sizes: ALL_SIZES.filter((s) => sizes.includes(s)),
      pairs: (Object.keys(PAIRS) as PairKey[]).filter((k) => pairs.includes(k)).map((k) => PAIRS[k]),
      games: games.trim() === '' ? undefined : Math.max(1, Math.floor(Number(games)) || 1),
      hardBudgetMs: Math.max(10, Number(budget) || DEFAULT_PARAMS.hardBudgetMs),
      seed: Number(seed) || 1,
      matches,
      stages,
      ablation,
    }),
    [sizes, pairs, games, budget, seed, matches, stages, ablation],
  );

  const run = (): void => {
    workerRef.current?.terminate();
    setError(null);
    setNotice(null);
    setTables([]);
    setProgress({ phase: 'Starting…', done: 0, total: 1 });
    setRunning(true);
    const started = performance.now();
    try {
      const worker = new Worker(new URL('../lab/worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = (ev: MessageEvent<LabResponse>) => {
        const msg = ev.data;
        if (msg.type === 'progress') setProgress({ phase: msg.phase, done: msg.done, total: msg.total });
        else if (msg.type === 'done') {
          setTables(msg.tables);
          setMeta({ ...browserMeta(params), 'Run time': `${((performance.now() - started) / 60000).toFixed(1)} min` });
          setRunning(false);
          worker.terminate();
          workerRef.current = null;
        } else {
          setError(msg.message);
          setRunning(false);
        }
      };
      worker.onerror = (ev) => {
        setError(ev.message || 'Web Worker failure');
        setRunning(false);
      };
      worker.postMessage({ type: 'run', params });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRunning(false);
    }
  };

  const stop = (): void => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRunning(false);
    setNotice('Experiment stopped.');
  };

  const copyMarkdown = async (): Promise<void> => {
    const md = toMarkdown(tables, meta);
    try {
      await navigator.clipboard.writeText(md);
      setNotice('Markdown copied to the clipboard.');
    } catch {
      const area = document.createElement('textarea');
      area.value = md;
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      setNotice(ok ? 'Markdown copied to the clipboard.' : 'Could not copy: select the tables manually.');
    }
  };

  const downloadCsv = (): void => {
    const blob = new Blob([toCsv(tables, meta)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bench-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const pct = progress ? Math.round((100 * progress.done) / Math.max(1, progress.total)) : 0;
  const gamesHint = (s: SizeKey): number => params.games ?? defaultGames(s);

  return (
    <main className="lab">
      <section className="card">
        <h2>Experiments for the report</h2>
        <p className="muted">
          AI-versus-AI matches with reproducible openings (seed), time and node measurements, game stages and algorithm ablation.
        </p>
        <div className="lab-grid">
          <fieldset>
            <legend>Boards</legend>
            {ALL_SIZES.map((s) => (
              <label key={s} className="check">
                <input type="checkbox" checked={sizes.includes(s)} onChange={() => toggle(sizes, s, setSizes)} />
                {s} ({gamesHint(s)} games)
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Level pairs</legend>
            {(Object.keys(PAIRS) as PairKey[]).map((k) => (
              <label key={k} className="check">
                <input type="checkbox" checked={pairs.includes(k)} onChange={() => toggle(pairs, k, setPairs)} />
                {LEVEL_NAMES[PAIRS[k][0]]} — {LEVEL_NAMES[PAIRS[k][1]]}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Experiments</legend>
            <label className="check">
              <input type="checkbox" checked={matches} onChange={(e) => setMatches(e.target.checked)} />
              1–2. Matches, time and nodes
            </label>
            <label className="check">
              <input type="checkbox" checked={stages} onChange={(e) => setStages(e.target.checked)} />
              3. Game stages (5×5)
            </label>
            <label className="check">
              <input type="checkbox" checked={ablation} onChange={(e) => setAblation(e.target.checked)} />
              4. Ablation (4×4)
            </label>
          </fieldset>
          <div className="fields">
            <label>
              Games per pair
              <input type="number" min={1} value={games} placeholder="default" onChange={(e) => setGames(e.target.value)} />
            </label>
            <label>
              Hard budget, ms
              <input type="number" min={10} value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
            <label>
              Seed
              <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="buttons">
          <button type="button" className="button button-main" onClick={run} disabled={running}>
            Run
          </button>
          <button type="button" className="button" onClick={stop} disabled={!running}>
            Stop
          </button>
          <button type="button" className="button" onClick={() => void copyMarkdown()} disabled={tables.length === 0}>
            Copy Markdown
          </button>
          <button type="button" className="button" onClick={downloadCsv} disabled={tables.length === 0}>
            Download CSV
          </button>
        </div>
        {progress && (running || pct < 100) && (
          <div className="progress-wrap">
            <progress max={100} value={pct} aria-label="Experiment progress" />
            <span className="muted">
              {pct}% — {progress.phase}
            </span>
          </div>
        )}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="muted" role="status">
            {notice}
          </p>
        )}
      </section>

      {tables.map((t) => (
        <section key={t.id} className="card">
          <h2>{t.title}</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {t.header.map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {t.note && <p className="muted">{t.note}</p>}
        </section>
      ))}
    </main>
  );
}
