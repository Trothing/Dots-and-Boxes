import { useEffect, useState } from 'react';
import { winner } from '../engine';
import { Board } from './Board';
import { LEVEL_LABELS } from './labels';
import { Segmented } from './Segmented';
import { useGame, type AIInfo, type GameSettings } from './useGame';

const DEFAULTS: GameSettings = { size: 5, level: 'medium', humanFirst: true };

export function GamePage() {
  const [form, setForm] = useState<GameSettings>(DEFAULTS);
  const game = useGame(DEFAULTS);
  const [showDanger, setShowDanger] = useState(false);
  const [overDismissed, setOverDismissed] = useState(false);

  const { state, humanPlayer, over, aiTurn } = game;
  const mine = state.scores[humanPlayer] as number;
  const theirs = state.scores[1 - humanPlayer] as number;
  const result = over ? winner(state) : null;

  useEffect(() => {
    if (!over) setOverDismissed(false);
  }, [over]);

  const start = (): void => {
    setOverDismissed(false);
    game.newGame(form);
  };

  const pending =
    form.size !== game.settings.size || form.level !== game.settings.level || form.humanFirst !== game.settings.humanFirst;

  const extraTurn = !over && game.lastCaptured > 0;
  const humanExtra = extraTurn && state.toMove === humanPlayer;
  const aiExtra = extraTurn && state.toMove !== humanPlayer;

  const outcome = result === 'draw' ? 'Draw' : result === humanPlayer ? 'You won' : 'The computer won';
  const headline = over ? outcome : aiTurn ? 'The computer is thinking…' : humanExtra ? 'Your move: you closed a box, go again' : 'Your move';

  return (
    <main className="game">
      <section className="scores" aria-label="Score">
        <div className={`tile tile-human${!over && !aiTurn ? ' is-turn' : ''}`}>
          <span className="tile-name">You</span>
          <b className="tile-score">{mine}</b>
          {humanExtra && <span className="tile-note">go again</span>}
        </div>
        <div className={`tile tile-ai${!over && aiTurn ? ' is-turn' : ''}`}>
          <span className="tile-name">Computer</span>
          <b className="tile-score">{theirs}</b>
          {aiExtra && <span className="tile-note">moves again</span>}
        </div>
      </section>

      <section className="stage" aria-label="Game board">
        <p className="status" role="status" aria-live="polite">
          {headline}
        </p>
        <div className="frame">
          <Board
            state={state}
            edgeOwner={game.edgeOwner}
            humanPlayer={humanPlayer}
            interactive={!over && !aiTurn}
            hintEdge={game.hint}
            lastAiEdge={game.lastAiEdge}
            showDanger={showDanger}
            onPlay={game.play}
          />
        </div>
      </section>

      <aside className="console" aria-label="Controls">
        <div className="actions">
          <button type="button" className="button button-main" onClick={start}>
            New game
          </button>
          <button type="button" className="button" onClick={game.undo} disabled={!game.canUndo}>
            Undo move
          </button>
          <button type="button" className="button" onClick={game.requestHint} disabled={over || aiTurn || game.hintBusy}>
            {game.hintBusy ? 'Thinking…' : 'Hint'}
          </button>
        </div>
        {game.error && (
          <p className="alert" role="alert">
            {game.error}{' '}
            <button type="button" className="link-button" onClick={game.dismissError}>
              Dismiss
            </button>
          </p>
        )}

        <div className="settings">
          <Segmented
            label="Board size"
            value={form.size}
            onChange={(size) => setForm({ ...form, size })}
            options={[
              { value: 3, label: '3×3' },
              { value: 4, label: '4×4' },
              { value: 5, label: '5×5' },
            ]}
          />
          <Segmented
            label="Difficulty"
            value={form.level}
            onChange={(level) => setForm({ ...form, level })}
            options={[
              { value: 'easy', label: LEVEL_LABELS.easy },
              { value: 'medium', label: LEVEL_LABELS.medium },
              { value: 'hard', label: LEVEL_LABELS.hard },
            ]}
          />
          <Segmented
            label="First move"
            value={form.humanFirst}
            onChange={(humanFirst) => setForm({ ...form, humanFirst })}
            options={[
              { value: true, label: 'You' },
              { value: false, label: 'Computer' },
            ]}
          />
          {pending && <p className="hint-text">New settings apply from the next game.</p>}
          <label className="check">
            <input type="checkbox" checked={showDanger} onChange={(e) => setShowDanger(e.target.checked)} />
            <span>Highlight boxes that already have three sides</span>
          </label>
        </div>

        <AIInfoBlock info={game.aiInfo} level={game.settings.level} />
      </aside>

      {over && !overDismissed && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="over-title">
          <div className="dialog">
            <h2 id="over-title">{outcome}</h2>
            <p className="final-score">
              You {mine} : {theirs} Computer
            </p>
            <div className="dialog-actions">
              <button type="button" className="button button-main" autoFocus onClick={start}>
                Play again
              </button>
              <button type="button" className="button" onClick={() => setOverDismissed(true)}>
                View board
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function AIInfoBlock({ info, level }: { info: AIInfo | null; level: GameSettings['level'] }) {
  return (
    <section className="thinking" aria-label="How the computer thinks">
      <h2>How the computer thinks</h2>
      {level === 'easy' ? (
        <p className="muted">The easy level does not search: it closes a box if it can, otherwise draws a safe line, and when there are none it gives away as little as possible.</p>
      ) : info ? (
        <dl>
          <dt>Search depth</dt>
          <dd>
            {info.depth > 0 ? `${info.depth} moves` : '—'}
            {info.exact ? ', to the end of the game' : ''}
          </dd>
          <dt>Positions searched</dt>
          <dd>{info.nodes.toLocaleString('en-US')}</dd>
          <dt>Time per move</dt>
          <dd>
            {(info.timeMs / 1000).toFixed(2)} s{info.thinking ? '…' : ''}
          </dd>
          <dt>Position score</dt>
          <dd>{info.value === null ? '—' : `${info.value > 0 ? '+' : ''}${info.value.toFixed(1)} in favour of the computer`}</dd>
        </dl>
      ) : (
        <p className="muted">Data appears after the computer’s first move.</p>
      )}
    </section>
  );
}
