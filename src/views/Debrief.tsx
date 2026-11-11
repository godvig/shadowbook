import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { Board } from '../components/Board';
import { bookMoves, scorePct } from '../lib/book';
import { playUci } from '../lib/chess';
import { reviewGame, suggestBetter, type MoveReview } from '../lib/review';
import type { Opponent } from '../lib/opponent';
import type { FinishedGame, GameSettings } from './Game';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function Debrief({
  opponent,
  settings,
  game,
  onRematch,
  onNewOpponent,
  onReport,
}: {
  opponent: Opponent;
  settings: GameSettings;
  game: FinishedGame;
  onRematch: (startUcis: string[]) => void;
  onNewOpponent: () => void;
  onReport: () => void;
}) {
  const [reviews, setReviews] = useState<MoveReview[] | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [copied, setCopied] = useState(false);
  const { ucis, sources, books } = game;
  const bot = settings.you === 'w' ? 'b' : 'w';

  const { sans, fens } = useMemo(() => {
    const c = new Chess();
    const f: string[] = [c.fen()];
    const s = ucis.map((u) => {
      const san = playUci(c, u).san;
      f.push(c.fen());
      return san;
    });
    return { sans: s, fens: f };
  }, [ucis]);

  // Where the bot left the player's book, and where *you* left it (a move they never faced).
  const exitPly = sources.findIndex((s) => s === 'maia');
  const lastBookPly = (() => {
    for (let i = (exitPly < 0 ? sources.length : exitPly) - 1; i >= 0; i--) if (sources[i] === 'book') return i;
    return -1;
  })();
  const surprisePly = sources.findIndex((s, i) => {
    if (s !== 'you' || !settings.useBook) return false;
    // You surprised them if the position after your move never occurred in their games.
    return i + 1 < fens.length && bookMoves(opponent.book, bot, fens[i + 1]).length === 0 && (exitPly < 0 || i < exitPly);
  });

  useEffect(() => {
    let alive = true;
    reviewGame(ucis, settings.you, settings.yourElo, settings.elo)
      .then(async (r) => {
        const worst = [...r].filter((m) => m.loss >= 0.08).sort((a, b) => b.loss - a.loss).slice(0, 3);
        for (const m of worst) m.better = await suggestBetter(fens[m.ply]);
        if (alive) setReviews(r);
      })
      .catch((e) => alive && setReviewError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [ucis, settings, fens]);

  const youWon = (game.result === '1-0' && settings.you === 'w') || (game.result === '0-1' && settings.you === 'b');
  const draw = game.result === '1/2-1/2';
  const title = draw ? 'Draw' : youWon ? 'You won' : `${opponent.username} won`;
  const pgn = sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(' ') + ` ${game.result}`;
  const worst = (reviews ?? []).filter((m) => m.better !== undefined || m.loss >= 0.08).sort((a, b) => b.loss - a.loss).slice(0, 3);
  const moveLabel = (ply: number) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}${sans[ply]}`;
  const exitBook = exitPly >= 0 ? books[lastBookPly] : null;
  const bookAtExit = exitPly >= 0 ? bookMoves(opponent.book, bot, fens[exitPly]) : [];

  return (
    <div className="split">
      <div className="main">
        <p className="muted" style={{ margin: 0 }}>
          Sparring vs {opponent.username}-bot · {game.reason}
        </p>
        <h1>{title}</h1>
        <div className="row" style={{ marginBottom: 22 }}>
          {exitPly > 0 && (
            <button className="btn primary" onClick={() => onRematch(ucis.slice(0, exitPly))}>
              Rematch from move {Math.floor(exitPly / 2) + 1}
            </button>
          )}
          <button className={`btn ${exitPly > 0 ? '' : 'primary'}`} onClick={() => onRematch([])}>
            New game
          </button>
          <button className="btn ghost" onClick={onReport}>
            Scouting report
          </button>
          <button className="btn ghost" onClick={onNewOpponent}>
            New opponent
          </button>
        </div>

        <div className="card">
          <p className="eyebrow">The opening</p>
          {!settings.useBook && <p>Their openings were switched off this game.</p>}
          {settings.useBook && surprisePly >= 0 && (
            <div className="line-item" style={{ borderTop: 0 }}>
              <span className="tag blue">You</span>
              <span style={{ flex: 1 }}>
                <b>{moveLabel(surprisePly)}</b> took them out of their games – they had never faced it. A good surprise weapon if it holds up.
              </span>
            </div>
          )}
          {settings.useBook && exitPly >= 0 && (
            <div className="line-item">
              <span className="tag coral">Them</span>
              <span style={{ flex: 1 }}>
                Their book ran out at <b>move {Math.floor(exitPly / 2) + 1}</b>
                {exitBook?.source === 'book' && lastBookPly >= 0 && (
                  <>
                    {' '}
                    – the last move from their games was {moveLabel(lastBookPly)} ({exitBook.n} of {exitBook.total} games)
                  </>
                )}
                . From there the bot played like a {settings.elo}.
                {bookAtExit.length === 0 && ' They had never reached this position.'}
              </span>
            </div>
          )}
          {settings.useBook && exitPly < 0 && <p>The whole game stayed inside their real games.</p>}
          {lastBookPly >= 0 && (() => {
            const fen = fens[lastBookPly];
            const options = bookMoves(opponent.book, bot, fen);
            const best = options.filter((o) => o.stat.scored >= 2).sort((a, b) => (scorePct(b.stat) ?? 0) - (scorePct(a.stat) ?? 0))[0];
            if (!best) return null;
            const san = playUci(new Chess(fen), best.uci).san;
            return (
              <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
                In that position their best-scoring choice is {san} ({scorePct(best.stat)}% over {best.stat.scored} games) – worth preparing against.
              </p>
            );
          })()}
        </div>

        <div className="card">
          <p className="eyebrow">Moves that cost you the most</p>
          {!reviews && !reviewError && <p className="muted">Analysing your moves…</p>}
          {reviewError && <p className="notice error">Could not analyse the game: {reviewError}</p>}
          {reviews && worst.length === 0 && <p>No big swings – a clean game by the standards of a {settings.yourElo}.</p>}
          {worst.map((m) => (
            <div className="line-item" key={m.ply}>
              <span className="n" style={{ color: 'var(--coral-text)' }}>
                −{Math.round(m.loss * 100)}
              </span>
              <span style={{ flex: 1, minWidth: 220 }}>
                <b>{moveLabel(m.ply)}</b> dropped your chances from {pct(m.before)} to {pct(m.after)}.
                {m.better && <> A strong human would play <b>{m.better}</b>.</>}
              </span>
            </div>
          ))}
          <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
            Win chances are Maia’s estimate for players of your rating, not engine evaluations.
          </p>
        </div>

        <div className="card">
          <p className="eyebrow">PGN</p>
          <p className="mono" style={{ wordBreak: 'break-word' }}>
            {pgn}
          </p>
          <div className="row">
            <button
              className="btn small"
              onClick={() => {
                navigator.clipboard?.writeText(pgn).then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied' : 'Copy PGN'}
            </button>
            <a className="btn small ghost" href={`https://lichess.org/analysis/pgn/${encodeURIComponent(pgn)}`} target="_blank" rel="noreferrer">
              Analyse on Lichess
            </a>
          </div>
        </div>
      </div>
      <aside className="side">
        <Board fen={fens[fens.length - 1]} orientation={settings.you} movable={null} lastMove={ucis[ucis.length - 1]} />
      </aside>
    </div>
  );
}
