// The training screen (Phase 3). It draws a session from model/session.ts and sends it events; everything that
// decides grading lives there. Beside the board: the deck switcher, the mode, the start move, the panel after each
// move (signs, notes, the other book moves, Stockfish's recommendation) and the switches for that panel.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { Board } from '../components/Board';
import { fenKey, playUci, START_FEN, ucisToSanLine } from '../lib/chess';
import { cloudEval, evalText, type Eval } from './cloudEval';
import * as db from './db';
import { GlyphMark } from './marks';
import { Rating } from './model/cards';
import { ownMoveIndex } from './model/deck';
import { loadOpenings, type OpeningMap } from './model/openings';
import { boardOf, currentItem, currentStep, startSession, step, type Effect, type Event, type Item, type Session } from './model/session';
import type { Card, Deck, Edge, Settings } from './model/types';

const arrow = (uci: string, brush: string): DrawShape => ({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush });
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function fenAfter(board: string[]): string {
  const c = new Chess(START_FEN);
  for (const u of board) playUci(c, u);
  return c.fen();
}

function sanAt(fen: string, uci: string): string {
  try {
    return playUci(new Chess(fen), uci).san;
  } catch {
    return uci;
  }
}

export interface TrainProps {
  mode: Session['mode'];
  /** Positions mode from the Report: the mode, deck and start move cannot be changed. */
  fixed?: boolean;
  title: string;
  items: Item[];
  edges: Record<string, Edge[]>;
  cards: Card[];
  newLeft: number;
  settings: Settings;
  /** All decks, for the switcher, the other book moves and their names. */
  decks: Deck[];
  allEdges: Edge[];
  deck?: Deck;
  /** Due counts per deck, for the switcher. */
  dueBy: Map<string, number>;
  onEffects(effects: Effect[]): void;
  onSettings(patch: Partial<Settings>): void;
  onDeck?(id: string): void;
  onStartMove?(n: number, remember: boolean): void;
  onDone(): void;
  /** "Train all": what comes after this deck. */
  nextLabel?: string;
  /** Train the items even when nothing is due (one position from Insights). */
  practice?: boolean;
}

export function Train(p: TrainProps) {
  const init = () => startSession(p.mode, p.items, p.edges, { now: new Date(), cards: p.cards, newLeft: p.newLeft, pause: p.settings.pauseAfterMove, practice: p.practice });
  const [s, setS] = useState(init);
  const latest = useRef(s);
  const onEffects = useRef(p.onEffects);
  onEffects.current = p.onEffects;
  // Not a React reducer: React may run reducers twice, and every grade must be saved exactly once.
  const send = (e: Event) => {
    const r = step(latest.current, e);
    latest.current = r.session;
    setS(r.session);
    if (r.effects.length) onEffects.current(r.effects);
  };
  const [revision, setRevision] = useState(0);
  const [showEngine, setShowEngine] = useState(false);
  const [remember, setRemember] = useState(false);

  const it = currentItem(s);
  const st = currentStep(s);
  const board = boardOf(s);
  const fen = fenAfter(board);
  const color = it?.color ?? p.deck?.color ?? 'w';

  // Moves played for the user, one at a time; the next card in Positions after a short look.
  useEffect(() => {
    if (s.phase !== 'auto') return;
    const t = setTimeout(() => send({ type: 'tick' }), reduced() ? 0 : st ? p.settings.autoplayMs : 650);
    return () => clearTimeout(t);
     
  }, [s, st, p.settings.autoplayMs]);

   
  useEffect(() => send({ type: 'pause', on: p.settings.pauseAfterMove }), [p.settings.pauseAfterMove]);

  // Enter or Space: Continue. H: hint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, button')) return;
      if ((e.key === 'Enter' || e.key === ' ') && (s.phase === 'feedback' || s.phase === 'end')) {
        e.preventDefault();
        send({ type: 'continue' });
      }
      if (e.key.toLowerCase() === 'h') send({ type: 'hint' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
     
  }, [s.phase]);

  // The position the user just moved in: there the engine and the other book moves are looked up.
  const asked = s.feedback?.fen ?? (s.phase === 'offbook' ? fenAfter(s.board) : null);
  const [engine, setEngine] = useState<{ fen: string; value: Eval | null | 'busy' | 'error' } | null>(null);
  useEffect(() => {
    setShowEngine(false);
    if (!asked || !p.settings.engine) return;
    const ctl = new AbortController();
    setEngine({ fen: asked, value: 'busy' });
    cloudEval(asked, { cache: { get: (k) => db.cacheGet(k), put: (k, v) => db.cachePut(k, v) }, signal: ctl.signal })
      .then((value) => setEngine({ fen: asked, value }))
      .catch(() => !ctl.signal.aborted && setEngine({ fen: asked, value: 'error' }));
    return () => ctl.abort();
  }, [asked, p.settings.engine]);

  const [openings, setOpenings] = useState<OpeningMap | null>(null);
  useEffect(() => void loadOpenings().then(setOpenings), []);
  const index = useMemo(() => ownMoveIndex(p.decks, p.allEdges), [p.decks, p.allEdges]);
  const bookMoves = useMemo(() => {
    if (!asked || !p.settings.showBookMoves) return [];
    const key = fenKey(asked);
    return index.ownMoves(color, key).map((uci) => {
      const c = new Chess(asked);
      const san = playUci(c, uci).san;
      const named = openings?.[fenKey(c.fen())]?.[1];
      const home = p.decks.find((d) => p.allEdges.some((e) => e.deckId === d.id && e.from === key && e.uci === uci));
      return { uci, san, name: named ?? home?.name };
    });
  }, [asked, p.settings.showBookMoves, index, color, openings, p.decks, p.allEdges]);

  const main = st?.accepted[0];
  const shapes: DrawShape[] = [];
  if (main && (s.phase === 'teach' || ((s.phase === 'ask' || s.phase === 'offbook') && s.shown))) shapes.push(arrow(main, 'green'));
  if (main && s.phase === 'ask' && s.hint && !s.shown) shapes.push({ orig: main.slice(0, 2) as Key, brush: 'green' });
  if (s.phase === 'feedback' && s.feedback?.edge?.shapes) shapes.push(...s.feedback.edge.shapes.map((x) => ({ orig: x.orig as Key, dest: x.dest as Key | undefined, brush: x.brush })));
  const best = engine?.fen === asked && engine?.value && typeof engine.value === 'object' ? engine.value : null;
  if (showEngine && best) shapes.push(arrow(best.best, 'blue'));

  const movable = s.phase === 'ask' || s.phase === 'teach' ? color : s.phase === 'extend' ? (new Chess(fen).turn() as Deck['color']) : null;
  const playedFor = it ? it.steps.slice(0, s.pos).filter((_, i) => !it.asked.includes(i)).length : 0;
  const total = s.items.length;
  const leftInLine = it ? it.asked.filter((i) => i >= s.pos).length : 0;

  if (s.phase === 'done') {
    const t = s.tally;
    return (
      <div className="card rep-done">
        <h2>Done for now</h2>
        <p>
          {t.right} right first time · {t.hint} with a hint · {t.missed} missed{t.taught ? ` · ${t.taught} new learned` : ''}
        </p>
        <p className="muted small">Missed moves come back soon; the ones you knew come back later, a little further apart each time.</p>
        <div className="row">
          <button className="btn primary" onClick={p.onDone}>
            {p.nextLabel ?? 'Back to Library'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rep-grid train">
      <div>
        <div className="rep-board">
          <Board
            fen={fen}
            orientation={color}
            movable={movable}
            lastMove={board[board.length - 1]}
            shapes={shapes}
            revision={revision}
            onMove={(uci) => {
              send({ type: 'move', uci });
              setRevision((n) => n + 1);
            }}
          />
        </div>
        <div className="row train-progress">
          <span className="muted small">
            {s.mode === 'lines' ? `Line ${Math.min(s.index + 1, total)} of ${total}` : `Card ${Math.min(s.index + 1, total)} of ${total}`}
            {s.mode === 'lines' && leftInLine > 0 && ` · ${leftInLine} move${leftInLine === 1 ? '' : 's'} of yours left`}
          </span>
          <div className="bar" aria-hidden>
            <span style={{ width: `${total ? (100 * s.index) / total : 0}%` }} />
          </div>
        </div>
      </div>

      <div className="card rep-side train-side">
        {!p.fixed && (
          <div className="train-controls">
            <label className="train-deck">
              <span className="eyebrow">Opening</span>
              <select value={p.deck?.id ?? ''} onChange={(e) => p.onDeck?.(e.target.value)} aria-label="Deck">
                {!p.deck && <option value="">{p.title}</option>}
                {p.decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {p.dueBy.get(d.id) ? ` · ${p.dueBy.get(d.id)} due` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="seg" role="group" aria-label="Mode">
              {(['lines', 'positions'] as const).map((m) => (
                <button key={m} className={s.mode === m ? 'on' : ''} aria-pressed={s.mode === m} onClick={() => p.onSettings({ mode: m })}>
                  {m === 'lines' ? 'Full lines' : 'Positions'}
                </button>
              ))}
            </div>
            {p.deck && (
              <div className="row start-move">
                <span className="small">Start at move</span>
                <button className="btn small" aria-label="Earlier start" disabled={p.deck.startMove <= 1} onClick={() => p.onStartMove?.(p.deck!.startMove - 1, remember)}>
                  −
                </button>
                <b>{p.deck.startMove}</b>
                <button className="btn small" aria-label="Later start" disabled={p.deck.startMove >= 10} onClick={() => p.onStartMove?.(p.deck!.startMove + 1, remember)}>
                  +
                </button>
                <label className="rep-check small">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember for this opening
                </label>
              </div>
            )}
          </div>
        )}
        {p.fixed && <p className="eyebrow">{p.title}</p>}

        <p className="eyebrow">This line</p>
        <p className="rep-line">
          {board.length ? ucisToSanLine(board) : 'Start position'}
          {playedFor > 0 && s.mode === 'lines' && <span className="muted small"> · {playedFor === 1 ? 'one move' : `${playedFor} moves`} played for you</span>}
        </p>

        <div className={`train-box ${s.phase}`} aria-live="polite">
          <Status s={s} fen={fen} />
          {s.notice && <p className="small">{s.notice}</p>}
          {s.feedback && s.phase !== 'extend' && (
            <AfterMove
              s={s}
              engine={p.settings.engine ? (engine?.fen === asked ? engine.value : 'busy') : undefined}
              showEngine={showEngine}
              onShowEngine={() => setShowEngine(!showEngine)}
              bookMoves={bookMoves}
            />
          )}
          {s.phase === 'offbook' && (
            <>
              <EngineLine engine={p.settings.engine ? (engine?.fen === asked ? engine.value : 'busy') : undefined} fen={asked!} shown={showEngine} onShow={() => setShowEngine(!showEngine)} />
              <div className="row">
                <button className="btn small primary" onClick={() => send({ type: 'tryAgain' })}>
                  Try again
                </button>
                <button className="btn small" onClick={() => send({ type: 'addAlternative' })}>
                  Add as alternative
                </button>
                <button className="btn small" onClick={() => send({ type: 'makeMain' })}>
                  Make it my main move
                </button>
              </div>
            </>
          )}
        </div>

        <div className="row train-actions">
          {(s.phase === 'feedback' || s.phase === 'end') && (
            <button className="btn primary" onClick={() => send({ type: 'continue' })}>
              {s.phase === 'end' ? 'Next line' : 'Continue'}
            </button>
          )}
          {s.phase === 'end' && (
            <button className="btn" onClick={() => send({ type: 'addHere' })}>
              Add what comes next
            </button>
          )}
          {s.phase === 'ask' && (
            <>
              <button className="btn small" disabled={s.hint || s.shown} onClick={() => send({ type: 'hint' })}>
                Hint
              </button>
              <button className="btn small" disabled={s.shown} onClick={() => send({ type: 'show' })}>
                Show move
              </button>
            </>
          )}
          {s.phase === 'extend' ? (
            <button className="btn small" onClick={() => send({ type: 'cancelAdd' })}>
              Cancel
            </button>
          ) : (
            s.phase !== 'end' &&
            s.phase !== 'offbook' &&
            !p.fixed && (
              <button className="btn small ghost" onClick={() => send({ type: 'addHere' })}>
                Add a move here
              </button>
            )
          )}
          <button className="btn small ghost" onClick={p.onDone}>
            Back to Library
          </button>
        </div>

        <details className="train-switches">
          <summary className="small">Training settings</summary>
          <label className="rep-check small">
            <input type="checkbox" checked={p.settings.pauseAfterMove} onChange={(e) => p.onSettings({ pauseAfterMove: e.target.checked })} /> Pause after each move
          </label>
          <label className="rep-check small">
            <input type="checkbox" checked={p.settings.showBookMoves} onChange={(e) => p.onSettings({ showBookMoves: e.target.checked })} /> Show my other book moves
          </label>
          <label className="rep-check small">
            <input type="checkbox" checked={p.settings.engine} onChange={(e) => p.onSettings({ engine: e.target.checked })} /> Stockfish's recommendation (asks Lichess, sends only the position)
          </label>
        </details>
      </div>
    </div>
  );
}

function Status({ s, fen }: { s: Session; fen: string }) {
  const st = currentStep(s);
  const main = st?.accepted[0];
  const before = fenAfter(s.board);
  switch (s.phase) {
    case 'teach':
      return (
        <>
          <p>
            <span className="pill new-pill">New</span> Your move here is <b>{main && sanAt(before, main)}</b>. Play it on the board.
          </p>
          {st?.edge?.comment && <p className="small deck-note">{st.edge.comment}</p>}
        </>
      );
    case 'ask':
      return (
        <p>
          <b>Your move.</b> {s.shown && main ? `Play ${sanAt(before, main)}.` : s.hint ? 'Hint: the highlighted piece moves.' : st && st.accepted.length > 1 ? `You have ${st.accepted.length} moves here; any of them counts.` : ''}
        </p>
      );
    case 'offbook':
      return (
        <p className="err">
          Not {s.offMove && sanAt(before, s.offMove)}
          {s.shown && main ? (
            <>
              {' '}
              — your move is <b>{sanAt(before, main)}</b>.
            </>
          ) : (
            '. That move is not in your book here.'
          )}
        </p>
      );
    case 'auto':
      return s.later ? <p className="muted small">A new move for a later day, played for you.</p> : s.feedback ? null : <p className="muted small">Playing the moves for you…</p>;
    case 'end':
      return <p>End of this line.</p>;
    case 'extend':
      return <p>{new Chess(fen).turn() === currentItem(s)?.color ? 'Play your move.' : 'Play their move, then your reply.'} Both are saved to this deck.</p>;
    default:
      return null;
  }
}

const GRADE_TEXT: Record<number, string> = { [Rating.Good]: 'Good', [Rating.Hard]: 'Hard', [Rating.Again]: 'Again' };

type EngineState = Eval | null | 'busy' | 'error' | undefined;

function AfterMove({ s, engine, showEngine, onShowEngine, bookMoves }: { s: Session; engine: EngineState; showEngine: boolean; onShowEngine(): void; bookMoves: { uci: string; san: string; name?: string }[] }) {
  const f = s.feedback!;
  const others = bookMoves.filter((b) => b.uci !== f.uci);
  return (
    <div className="after-move">
      <p className="ok">
        {f.san}
        <GlyphMark glyph={f.edge?.glyph} />{' '}
        {f.outcome === 'taught' ? '✓ learned' : f.outcome === 'missed' ? '✓ found after a miss' : f.outcome === 'hint' ? '✓ with a hint' : '✓ right'}
        {f.grade !== undefined && <span className="muted small"> · graded {GRADE_TEXT[f.grade]}</span>}
      </p>
      {f.edge?.comment && f.outcome !== 'taught' && <p className="small deck-note">{f.edge.comment}</p>}
      {f.also.length > 0 && <p className="small">Also in your book here: {f.also.join(', ')}</p>}
      {f.lineUses && <p className="small">This line goes on with {f.lineUses}.</p>}
      <EngineLine engine={engine} fen={f.fen} shown={showEngine} onShow={onShowEngine} />
      {others.length > 0 && (
        <div className="small book-moves">
          Your other moves here:
          <ul>
            {others.map((b) => (
              <li key={b.uci}>
                <b>{b.san}</b>
                {b.name && <span className="muted"> — {b.name}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Off (undefined), asking, no evaluation (null), failed, or the best move. */
function EngineLine({ engine, fen, shown, onShow }: { engine: EngineState; fen: string; shown: boolean; onShow(): void }) {
  if (engine === undefined) return null;
  if (engine === null) return <p className="small muted">No evaluation available for this position.</p>;
  if (engine === 'busy') return <p className="small muted">Asking Lichess for Stockfish's recommendation…</p>;
  if (engine === 'error') return <p className="small muted">Could not reach Lichess for an evaluation.</p>;
  return (
    <p className="small engine">
      Stockfish's recommendation: <b>{sanAt(fen, engine.best)}</b> <span className="muted">({evalText(engine, fen)})</span>{' '}
      <button className="btn small" aria-pressed={shown} onClick={onShow}>
        {shown ? 'Hide' : 'Show'}
      </button>
    </p>
  );
}
