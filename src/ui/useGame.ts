import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AIClient, SearchCancelled } from '../ai/client';
import type { Level } from '../ai/config';
import { chooseEasy } from '../ai/easy';
import { applyMove, createState, isGameOver, type GameState, type Player } from '../engine';

export interface GameSettings {
  size: 3 | 4 | 5;
  level: Level;
  humanFirst: boolean;
}

export interface AIInfo {
  level: Level;
  depth: number;
  nodes: number;
  timeMs: number;
  ttHits: number;
  ttProbes: number;
  value: number | null;
  exact: boolean;
  thinking: boolean;
}

const MIN_AI_PAUSE_MS = 350;

export interface Replay {
  state: GameState;
  edgeOwner: Int8Array;
  movers: Player[];
  lastCaptured: number;
}

export function replay(size: number, history: readonly number[]): Replay {
  const state = createState(size, size);
  const edgeOwner = new Int8Array(state.board.numEdges).fill(-1);
  const movers: Player[] = [];
  let lastCaptured = 0;
  for (const e of history) {
    movers.push(state.toMove);
    edgeOwner[e] = state.toMove;
    lastCaptured = applyMove(state, e);
  }
  return { state, edgeOwner, movers, lastCaptured };
}

export function useGame(initial: GameSettings) {
  const [settings, setSettings] = useState<GameSettings>(initial);
  const [history, setHistory] = useState<number[]>([]);
  const [aiInfo, setAiInfo] = useState<AIInfo | null>(null);
  const [hint, setHint] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [gameId, setGameId] = useState(0);

  const clientRef = useRef<AIClient | null>(null);
  const client = (): AIClient => (clientRef.current ??= new AIClient());
  useEffect(() => () => clientRef.current?.dispose(), []);

  const humanPlayer: Player = settings.humanFirst ? 0 : 1;
  const rep = useMemo(() => replay(settings.size, history), [settings.size, history]);
  const { state } = rep;
  const over = isGameOver(state);
  const aiTurn = !over && state.toMove !== humanPlayer;

  const lastAiEdge = useMemo(() => {
    for (let i = history.length - 1; i >= 0; i--) if (rep.movers[i] !== humanPlayer) return history[i] as number;
    return null;
  }, [history, rep.movers, humanPlayer]);

  useEffect(() => {
    if (!aiTurn) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const started = performance.now();
    const level = settings.level;

    const commit = (edge: number): void => {
      const wait = Math.max(0, MIN_AI_PAUSE_MS - (performance.now() - started));
      timer = setTimeout(() => {
        if (cancelled) return;
        setHint(null);
        setHistory((h) => [...h, edge]);
      }, wait);
    };

    if (fallback || level === 'easy') {
      commit(chooseEasy(state));
    } else {
      inFlight = true;
      setAiInfo({ level, depth: 0, nodes: 0, timeMs: 0, ttHits: 0, ttProbes: 0, value: null, exact: false, thinking: true });
      client()
        .search(level, state, {
          onProgress: (p) =>
            setAiInfo((prev) => (cancelled || !prev ? prev : { ...prev, depth: p.depth, nodes: p.nodes, timeMs: p.timeMs, value: p.value, thinking: true })),
        })
        .then((r) => {
          inFlight = false;
          if (cancelled) return;
          setAiInfo({ level, depth: r.depth, nodes: r.nodes, timeMs: r.timeMs, ttHits: r.ttHits, ttProbes: r.ttProbes, value: r.value, exact: r.exact, thinking: false });
          commit(r.move);
        })
        .catch((err: unknown) => {
          inFlight = false;
          if (cancelled || err instanceof SearchCancelled) return;
          setError(`AI worker error (${err instanceof Error ? err.message : 'unknown'}). The easy level plays from now on.`);
          setFallback(true);
          setAiInfo(null);
        });
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (inFlight) clientRef.current?.cancel();
    };
  }, [aiTurn, history, settings.level, fallback, gameId]);

  const play = useCallback(
    (edge: number): void => {
      if (over || state.toMove !== humanPlayer || state.edges[edge]) return;
      setHint(null);
      setHistory((h) => [...h, edge]);
    },
    [over, state, humanPlayer],
  );

  const newGame = useCallback((next: GameSettings): void => {
    clientRef.current?.cancel();
    clientRef.current?.newGame();
    setSettings(next);
    setHistory([]);
    setAiInfo(null);
    setHint(null);
    setError(null);
    setFallback(false);
    setGameId((g) => g + 1);
  }, []);

  const undo = useCallback((): void => {
    clientRef.current?.cancel();
    setHint(null);
    setHistory((h) => {
      const r = replay(settings.size, h);
      let i = h.length;
      while (i > 0 && r.movers[i - 1] !== humanPlayer) i--;
      while (i > 0 && r.movers[i - 1] === humanPlayer) i--;
      return h.slice(0, i);
    });
    setAiInfo(null);
  }, [settings.size, humanPlayer]);

  const canUndo = useMemo(() => rep.movers.some((m) => m === humanPlayer), [rep.movers, humanPlayer]);

  const requestHint = useCallback((): void => {
    if (over || state.toMove !== humanPlayer || hintBusy) return;
    setHintBusy(true);
    client()
      .search('hard', state, { budgetMs: 900 })
      .then((r) => setHint(r.move))
      .catch((err: unknown) => {
        if (!(err instanceof SearchCancelled)) setError('Could not compute a hint: the AI worker failed.');
      })
      .finally(() => setHintBusy(false));
  }, [over, state, humanPlayer, hintBusy]);

  return {
    settings,
    history,
    state,
    edgeOwner: rep.edgeOwner,
    lastCaptured: rep.lastCaptured,
    humanPlayer,
    over,
    aiTurn,
    aiInfo,
    lastAiEdge,
    hint,
    hintBusy,
    error,
    canUndo,
    play,
    newGame,
    undo,
    requestHint,
    dismissError: () => setError(null),
  };
}
