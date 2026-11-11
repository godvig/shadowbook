import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Board } from '../components/Board';
import { chooseMove, type BotMove } from '../lib/bot';
import { playUci } from '../lib/chess';
import { onMaiaProgress } from '../lib/maia';
import type { Opponent } from '../lib/opponent';
import type { Color, Result } from '../lib/types';

export interface GameSettings {
  you: Color;
  elo: number;
  yourElo: number;
  useBook: boolean;
}

export type PlySource = 'you' | 'book' | 'maia' | 'start';

export interface FinishedGame {
  ucis: string[];
  sources: PlySource[];
  books: (BotMove | null)[];
  result: Result;
  reason: string;
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

function outcome(chess: Chess): { result: Result; reason: string } | null {
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) return { result: chess.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
  if (chess.isStalemate()) return { result: '1/2-1/2', reason: 'stalemate' };
  if (chess.isThreefoldRepetition()) return { result: '1/2-1/2', reason: 'threefold repetition' };
  if (chess.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'insufficient material' };
  return { result: '1/2-1/2', reason: 'the 50-move rule' };
}

export function Game({
  opponent,
  settings,
  startUcis,
  onFinish,
  onBack,
}: {
  opponent: Opponent;
  settings: GameSettings;
  startUcis: string[];
  onFinish: (g: FinishedGame) => void;
  onBack: () => void;
}) {
  const bot = other(settings.you);
  const [ucis, setUcis] = useState<string[]>(startUcis);
  const [sources, setSources] = useState<PlySource[]>(() => startUcis.map(() => 'start'));
  const [books, setBooks] = useState<(BotMove | null)[]>(() => startUcis.map(() => null));
  const [thinking, setThinking] = useState(false);
  const [maiaPct, setMaiaPct] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState(false);
  const token = useRef(0);

  const chess = useMemo(() => {
    const c = new Chess();
    ucis.forEach((u) => playUci(c, u));
    return c;
  }, [ucis]);
  const fen = chess.fen();
  const over = outcome(chess);
  const lastBot = [...books].reverse().find(Boolean) ?? null;
  const exitPly = sources.findIndex((s) => s === 'maia');
  const sanList = useMemo(() => {
    const c = new Chess();
    return ucis.map((u) => playUci(c, u).san);
  }, [ucis]);

  useEffect(() => onMaiaProgress((p) => setMaiaPct(p < 1 ? p : null)), []);

  // The bot moves whenever it is its turn.
  useEffect(() => {
    if (over || chess.turn() !== bot) return;
    const my = ++token.current;
    setThinking(true);
    setError('');
    const started = performance.now();
    chooseMove({ fen, history: ucis, color: bot, book: opponent.book, useBook: settings.useBook, elo: settings.elo, opponentElo: settings.yourElo })
      .then(async (move) => {
        const wait = Math.max(0, 450 - (performance.now() - started));
        await new Promise((r) => setTimeout(r, wait));
        if (token.current !== my) return;
        setUcis((u) => [...u, move.uci]);
        setSources((s) => [...s, move.source]);
        setBooks((b) => [...b, move]);
      })
      .catch((e) => {
        if (token.current === my) setError(`The bot could not move: ${e instanceof Error ? e.message : e}`);
      })
      .finally(() => {
        if (token.current === my) setThinking(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  function userMove(uci: string) {
    if (chess.turn() !== settings.you || over) return;
    try {
      playUci(new Chess(fen), uci);
    } catch {
      return;
    }
    setUcis((u) => [...u, uci]);
    setSources((s) => [...s, 'you']);
    setBooks((b) => [...b, null]);
  }

  function takeBack() {
    token.current++;
    setThinking(false);
    // Undo your last move, plus the bot's reply if it already came.
    const lastWasYou = sources[sources.length - 1] === 'you';
    const n = Math.max(startUcis.length, ucis.length - (lastWasYou ? 1 : 2));
    setUcis((u) => u.slice(0, n));
    setSources((s) => s.slice(0, n));
    setBooks((b) => b.slice(0, n));
  }

  function finish(result?: Result, reason?: string) {
    token.current++;
    const r = result ?? over?.result ?? (settings.you === 'w' ? '0-1' : '1-0');
    onFinish({ ucis, sources, books, result: r, reason: reason ?? over?.reason ?? 'resignation' });
  }

  const status = (() => {
    if (over) return `Game over – ${over.reason}.`;
    if (thinking && maiaPct !== null) return `Loading the human-like engine… ${Math.round(maiaPct * 100)}%`;
    if (thinking) return exitPly >= 0 || !settings.useBook ? `Thinking like a ${settings.elo}…` : 'Choosing from their games…';
    if (lastBot?.source === 'book') return `Played ${sanList[books.lastIndexOf(lastBot)]} in ${lastBot.n} of ${lastBot.total} games here.`;
    if (lastBot?.source === 'maia') return `Out of their games – playing like a ${settings.elo}.`;
    return 'Your move.';
  })();

  const youToMove = chess.turn() === settings.you && !over;
  const orientation = flipped ? bot : settings.you;
  const lastMove = ucis[ucis.length - 1];
  const bookPhase = settings.useBook && exitPly < 0;

  return (
    <div className="split">
      <div className="main" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className="board-wrap">
          <div className="player">
            <div className="avatar">{opponent.username[0]?.toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="name">
                {opponent.username} <span className="muted" style={{ fontWeight: 400 }}>· bot · {settings.elo}</span>
              </div>
              <div className="sub" aria-live="polite">
                {status}
              </div>
            </div>
          </div>
          <div className={orientation === 'b' ? 'orientation-black' : ''}>
            <Board fen={fen} orientation={orientation} movable={youToMove ? settings.you : null} lastMove={lastMove} onMove={userMove} />
          </div>
          <div className="player">
            <div className="avatar you">Y</div>
            <div className="name" style={{ flex: 1 }}>
              You <span className="muted" style={{ fontWeight: 400 }}>· {settings.you === 'w' ? 'White' : 'Black'}</span>
            </div>
            {youToMove && <span className="tag blue">Your move</span>}
          </div>
        </div>
      </div>

      <aside className="side">
        <div className="card">
          <p className="eyebrow">Where are we?</p>
          <ol className="phases">
            <li className={bookPhase ? 'now' : ''}>
              <span className={`dot ${bookPhase ? 'now' : 'done'}`} aria-hidden="true">
                {bookPhase ? '1' : '✓'}
              </span>
              <span>
                {settings.useBook ? (
                  bookPhase ? (
                    <>
                      <b>In their book.</b> Every move they make has been played in their real games.
                    </>
                  ) : (
                    <>Their book ended at move {Math.floor(exitPly / 2) + 1}.</>
                  )
                ) : (
                  'Their openings are switched off.'
                )}
              </span>
            </li>
            <li className={!bookPhase && !over ? 'now' : ''}>
              <span className={`dot ${!bookPhase && !over ? 'now' : over ? 'done' : ''}`} aria-hidden="true">
                {over ? '✓' : '2'}
              </span>
              <span>Human-like play at {settings.elo}</span>
            </li>
          </ol>
        </div>

        <div className="card">
          <p className="eyebrow">Moves</p>
          <div className="moves mono">
            {sanList.length === 0 && <span className="muted">No moves yet.</span>}
            {sanList.map((san, i) => (
              <span key={i}>
                {i % 2 === 0 && <span className="num">{i / 2 + 1}.</span>}{' '}
                <span className={`m ${sources[i] === 'book' ? 'book' : ''} ${i === exitPly ? 'exit' : ''} ${i === sanList.length - 1 ? 'cur' : ''}`}>{san}</span>
              </span>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
            <span style={{ color: 'var(--blue-text)' }}>Blue</span> = from their games ·{' '}
            <span style={{ color: 'var(--coral-text)' }}>coral</span> = first move outside them
          </p>
        </div>

        {error && <p className="notice error">{error}</p>}

        <div className="row" style={{ marginTop: 16 }}>
          {over ? (
            <button className="btn primary" onClick={() => finish()}>
              Review the game
            </button>
          ) : (
            <>
              <button className="btn" onClick={takeBack} disabled={ucis.length <= startUcis.length}>
                Take back
              </button>
              <button className="btn" onClick={() => setFlipped((f) => !f)}>
                Flip
              </button>
              <button className="btn ghost" onClick={() => finish()} disabled={ucis.length <= startUcis.length + 1}>
                Resign &amp; review
              </button>
            </>
          )}
          <button className="btn ghost" onClick={onBack}>
            Back to report
          </button>
        </div>
      </aside>
    </div>
  );
}
