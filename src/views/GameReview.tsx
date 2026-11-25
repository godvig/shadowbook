// The review page of one match game: /world-chess-championship-2026/#game/N.
// Board with the whole game, evaluation bar and graph, move list with clocks and marks, and ways to play,
// train or keep the opening. Loaded only when opened (Match.tsx), so the hub does not carry it.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { Board } from '../components/Board';
import type { PresetId } from '../lib/presets';
import type { Color } from '../lib/types';
import { MARK_NAME, type Mark } from '../eval/marks';
import type { PosEval } from '../eval/types';
import { scoreText, whiteShare } from '../eval/winChances';
import { CallCell, PlayerName, PREF, useStoredFlag } from '../live/bits';
import { EvalBar } from '../live/EvalBar';
import { EvalGraph } from '../live/EvalGraph';
import { moveLabel, stepKey, winnerOf } from '../live/match';
import { graphPoints, marksFor } from '../live/review';
import { NAMES, type Finalist, type LiveGame, type Pick } from '../live/types';
import { useAnalysis } from '../live/useAnalysis';
import { START_FEN } from '../lib/chess';

/** Lichess's glyph colours. */
const MARK_COLOR: Record<Mark, string> = { '?!': '#56b4e9', '?': '#e69f00', '??': '#df5353', '!': '#22ac38', '!!': '#168226', '!?': '#ea45d8' };

function markShape(square: string, mark: Mark): DrawShape {
  const html = `<g transform="translate(66 -6)"><circle cx="20" cy="20" r="19" fill="${MARK_COLOR[mark]}" stroke="#fff" stroke-width="2"/><text x="20" y="27.5" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="${mark.length > 1 ? 19 : 24}" fill="#fff">${mark}</text></g>`;
  return { orig: square as DrawShape['orig'], customSvg: { html } };
}

const SOURCE: Record<PosEval['source'], string> = {
  file: 'prepared analysis',
  pgn: 'the broadcast',
  cloud: 'Lichess cloud',
  local: 'Stockfish in this browser',
};

export interface ReviewActions {
  onBack(): void;
  /** Spar against `bot` from the position after `ucis`; you take the other colour. */
  onSparFrom(game: LiveGame, ucis: string[], bot: Finalist): void;
  /** Spar from where the game left the bots' book, as in Game summaries. */
  onSparOpening(game: LiveGame, you: Color): void;
  onTrain(game: LiveGame, side: Color): void;
  onAdd(game: LiveGame, ucis: string[], ply: number, side: Color): void;
}

export default function GameReview({ game, tally, presets, actions }: { game: LiveGame; tally: Partial<Record<Pick, number>>; presets: PresetId[]; actions: ReviewActions }) {
  const live = game.status === 'live';
  const [pinned, setPinned] = useState<number | null>(live ? null : 0);
  const [engineOn, setEngineOn] = useStoredFlag(PREF.engine, true);
  // One remembered choice for live games (off by default) and one for finished games (on by default).
  const [arrowLive, setArrowLive] = useStoredFlag(PREF.arrowLive, false);
  const [arrowDone, setArrowDone] = useStoredFlag(PREF.arrowFinished, true);
  const [arrowOn, setArrowOn] = live ? [arrowLive, setArrowLive] : [arrowDone, setArrowDone];
  // A finished game opens at the start; a live one follows the newest move (a large ply means "the last").
  const { moves, fens, state, startLocal } = useAnalysis(game.id, game.pgn, pinned ?? Number.MAX_SAFE_INTEGER, { engineOn, autoLocal: true });
  const last = moves.length;
  const ply = Math.min(pinned ?? last, last);
  const evals = useMemo(() => state?.evals ?? [], [state]);
  const marks = useMemo(() => marksFor(moves, evals, START_FEN), [moves, evals]);
  const points = useMemo(() => graphPoints(fens.map((_, i) => evals[i]), whiteShare), [fens, evals]);
  const shown = evals[ply];
  const area = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const go = (p: number | null) => setPinned(p !== null && p >= last && live ? null : p);

  // Braces matter: scrollTo returns a Promise in newer browsers, and an effect must not return one.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [game.id]);
  useEffect(() => {
    list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }, [ply]);

  const shapes: DrawShape[] = [];
  if (arrowOn && shown?.best && engineOn) shapes.push({ orig: shown.best.slice(0, 2) as DrawShape['orig'], dest: shown.best.slice(2, 4) as DrawShape['dest'], brush: 'green' });
  const mark = ply > 0 ? marks[ply - 1] : undefined;
  if (mark) shapes.push(markShape(moves[ply - 1].uci.slice(2, 4), mark));

  const w = winnerOf(game);
  const black = game.black;
  const white = game.white;
  const lastMove = ply > 0 ? moves[ply - 1].uci.slice(0, 4) : undefined;
  const clockOf = (color: Color) => {
    for (let i = ply - 1; i >= 0; i--) if ((i % 2 === 0 ? 'w' : 'b') === color) return moves[i].clock;
    return undefined;
  };
  const done = state ? fens.length - state.missing : 0;
  const ucis = moves.map((m) => m.uci);
  const bots = (['gukesh', 'sindarov'] as const).filter((p) => (p === white || p === black) && presets.includes(p));
  const gameOver = !!shown?.over;
  const canSparOpening = !!(white && black && presets.includes(white) && presets.includes(black) && game.pgn);

  return (
    <div className="lv-review">
      <p className="lv-crumbs">
        <button className="lv-link" onClick={actions.onBack}>
          ← Match hub
        </button>
      </p>
      <header className="lv-review-head">
        <h1>
          {game.label}
          {live && <span className="lv-livetag">Live</span>}
        </h1>
        <p className="lv-review-players">
          {white ? <PlayerName who={white} /> : 'White'} <span className="lv-muted-text">vs</span> {black ? <PlayerName who={black} /> : 'Black'}
          <span className="sep">·</span>
          {game.status === 'finished' ? (
            w === 'draw' ? (
              <strong className="lv-pname">Draw</strong>
            ) : w ? (
              <>
                <PlayerName who={w} /> won
              </>
            ) : (
              game.result
            )
          ) : live ? (
            'In progress'
          ) : (
            'Not started'
          )}
        </p>
        <p className="lv-review-meta">
          {game.opening && <span>{game.opening}</span>}
          <span className="lv-review-call">
            Community call: <CallCell votes={tally} />
          </span>
        </p>
      </header>

      {!last ? (
        <p className="lv-notice">The moves appear here when the game starts.</p>
      ) : (
        <div className="lv-review-main">
          <div className="lv-review-boardcol">
            <div
              ref={area}
              className="lv-boardarea"
              tabIndex={-1}
              role="group"
              aria-label="Board. Left and right arrows step through the moves, Home and End jump to the start and end."
              aria-keyshortcuts="ArrowLeft ArrowRight Home End"
              onPointerDown={() => {
                if (!area.current?.contains(document.activeElement)) area.current?.focus({ preventScroll: true });
              }}
              onKeyDown={(e) => {
                if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
                const to = stepKey(e.key, ply, last);
                if (to === undefined) return;
                e.preventDefault();
                go(e.key === 'End' ? null : to);
              }}
            >
              <div className="lv-player">
                <span className={black === 'gukesh' ? 'gold' : 'blue'}>{black ? NAMES[black] : 'Black'}</span>
                <span className="mono">{clockOf('b') && <span className="lv-clock">{clockOf('b')}</span>}</span>
              </div>
              <div className="lv-board-eval">
                <EvalBar score={shown} busy={!!state?.local} />
                <div className="lv-board">
                  <Board fen={fens[ply]} orientation="w" movable={null} lastMove={lastMove} shapes={shapes} />
                </div>
              </div>
              <div className="lv-player">
                <span className={white === 'gukesh' ? 'gold' : 'blue'}>{white ? NAMES[white] : 'White'}</span>
                <span className="mono">
                  {clockOf('w') && <span className="lv-clock">{clockOf('w')}</span>} {moveLabel(moves.map((m) => m.san), ply)}
                  {mark && (
                    <span className="lv-mark" style={{ color: MARK_COLOR[mark] }} title={MARK_NAME[mark]}>
                      {' '}
                      {mark}
                    </span>
                  )}
                </span>
              </div>
              <div className="lv-nav" role="group" aria-label="Move through the game">
                <button onClick={() => go(0)} aria-label="First move">«</button>
                <button onClick={() => go(Math.max(0, ply - 1))} aria-label="Previous move">‹</button>
                <button onClick={() => go(Math.min(last, ply + 1))} aria-label="Next move">›</button>
                <button onClick={() => go(null)} className={pinned === null ? 'on' : ''}>
                  {live ? 'Follow live' : 'Last move'}
                </button>
              </div>
            </div>

            <EvalGraph points={points} marks={marks} ply={ply} onPly={(p) => go(p)} />
            <p className="lv-eval-status" aria-live="polite">
              {!engineOn
                ? 'Engine off: only evaluations from the broadcast or prepared analysis are shown.'
                : state?.local
                  ? `Analysing… ${done}/${fens.length} (Stockfish in this browser, depth 18)`
                  : state && state.missing
                    ? `Fetching evaluations… ${done}/${fens.length}`
                    : shown
                      ? `${scoreText(shown)} from ${SOURCE[shown.source]}${shown.depth ? `, depth ${shown.depth}` : ''}.`
                      : ''}
            </p>
            {engineOn && !state?.local && !!state?.capped && (
              <p className="lv-eval-status">
                {state.capped} {state.capped === 1 ? 'position has' : 'positions have'} no evaluation yet.{' '}
                <button className="lv-chip-btn" onClick={startLocal}>
                  Analyse the rest in this browser (2 MB)
                </button>
              </p>
            )}
            <div className="lv-switches">
              <label>
                <input type="checkbox" checked={engineOn} onChange={(e) => setEngineOn(e.target.checked)} /> Engine
              </label>
              <label>
                <input type="checkbox" checked={arrowOn} onChange={(e) => setArrowOn(e.target.checked)} disabled={!engineOn} /> Best move arrow
              </label>
            </div>

            <section className="lv-actions" aria-label="Play, train or keep this game">
              <div className="row">
                {bots.map((b) => (
                  <button key={b} className="lv-btn small ghost" disabled={gameOver} onClick={() => actions.onSparFrom(game, ucis.slice(0, ply), b)}>
                    Play from here vs {NAMES[b]} bot
                  </button>
                ))}
              </div>
              {canSparOpening && (
                <div className="row">
                  <span className="lbl">Play the opening</span>
                  <button className="lv-chip-btn" onClick={() => actions.onSparOpening(game, 'w')}>
                    as White
                  </button>
                  <button className="lv-chip-btn" onClick={() => actions.onSparOpening(game, 'b')}>
                    as Black
                  </button>
                </div>
              )}
              <div className="row">
                <span className="lbl">Train this opening</span>
                <button className="lv-chip-btn" onClick={() => actions.onTrain(game, 'w')}>
                  as White
                </button>
                <button className="lv-chip-btn" onClick={() => actions.onTrain(game, 'b')}>
                  as Black
                </button>
              </div>
              <div className="row">
                <span className="lbl">Add to my repertoire, up to {moveLabel(moves.map((m) => m.san), ply)}</span>
                <button className="lv-chip-btn" disabled={ply < 1} onClick={() => actions.onAdd(game, ucis, ply, 'w')}>
                  as White
                </button>
                <button className="lv-chip-btn" disabled={ply < 2} onClick={() => actions.onAdd(game, ucis, ply, 'b')}>
                  as Black
                </button>
              </div>
            </section>
          </div>

          <ol className="lv-moves" ref={list} aria-label="Moves">
            {Array.from({ length: Math.ceil(last / 2) }, (_, r) => (
              <li key={r}>
                <span className="n mono">{r + 1}.</span>
                {[2 * r, 2 * r + 1].map((i) =>
                  i < last ? (
                    <button key={i} className={ply === i + 1 ? 'on' : ''} onClick={() => go(i + 1)} aria-current={ply === i + 1 ? 'true' : undefined}>
                      <span className="san">{moves[i].san}</span>
                      {marks[i] && (
                        <span className="mk" style={{ color: MARK_COLOR[marks[i]!] }} title={MARK_NAME[marks[i]!]}>
                          {marks[i]}
                        </span>
                      )}
                      {moves[i].clock && <span className="clk mono">{moves[i].clock}</span>}
                    </button>
                  ) : (
                    <span key={i} />
                  ),
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
