// Insights (Phase 6): your games against your book. Habits that cost you come first, because they matter most;
// then where you forgot your move, and where you had no move ready. The analysis is in model/insights.ts; this
// page fetches the games, asks Lichess's cloud evaluation about your most repeated moves, and offers the fixes.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Chess } from 'chess.js';
import { playUci, ucisToSanLine } from '../lib/chess';
import { cloudEval, type Eval } from './cloudEval';
import * as db from './db';
import { GamesForm, type Fetched } from './GamesForm';
import { MiniBoard } from './MiniBoard';
import type { GamesSite } from './model/fromGames';
import { analyse, betterMove, evalDrop, HABIT, habitText, type Habit, type Insights as Result, type LeftBook } from './model/insights';
import type { Color, Deck, Edge } from './model/types';

/** How many of your most repeated moves are checked against the engine, one request at a time. */
const EVAL_CHECKS = 30;
const SHOW = 8;
const pct = (x: number) => `${Math.round(100 * x)}%`;
const date = (ms: number) => (ms ? new Date(ms).toLocaleDateString() : '');
const sanAt = (fen: string, uci: string) => {
  try {
    return playUci(new Chess(fen), uci).san;
  } catch {
    return uci;
  }
};
const numbered = (ply: number, san: string) => `${Math.floor(ply / 2) + 1}${ply % 2 ? '…' : '.'}${san}`;
const lineTo = (path: string[]) => (path.length ? ucisToSanLine(path) : 'the start');

interface Checked {
  drop: number;
  best: string;
}

export function Insights(props: {
  decks: Deck[];
  edges: Edge[];
  initial?: { site: GamesSite; username: string };
  engine: boolean;
  /** Whether a position has a card of yours, so it can be trained. */
  hasCard(color: Color, key: string): boolean;
  onBack(): void;
  onFix(h: Habit, better: string): void;
  onTrain(color: Color, key: string): void;
  onAddMove(color: Color, path: string[]): void;
}) {
  const [result, setResult] = useState<(Result & { fetched: Fetched }) | null>(null);
  const [checked, setChecked] = useState<Map<string, Checked>>(new Map());
  const [checking, setChecking] = useState(false);

  // Weak by evaluation: your most repeated moves, before and after, from Lichess's cloud evaluation.
  useEffect(() => {
    if (!result || !props.engine) return;
    const ctl = new AbortController();
    const cache = { get: (k: string) => db.cacheGet<{ at: number; value: Eval | null }>(k), put: (k: string, v: unknown) => db.cachePut(k, v) };
    const todo = [...result.repeated].sort((a, b) => b.games - a.games).slice(0, EVAL_CHECKS);
    setChecking(true);
    (async () => {
      const found = new Map<string, Checked>();
      for (const h of todo) {
        try {
          const before = await cloudEval(h.fen, { cache, signal: ctl.signal });
          const after = before && (await cloudEval(h.after, { cache, signal: ctl.signal }));
          if (before && after) found.set(`${h.key}|${h.uci}`, { drop: evalDrop(h.fen, before, after), best: before.best });
        } catch {
          if (ctl.signal.aborted) return;
        }
        setChecked(new Map(found));
      }
      setChecking(false);
    })();
    return () => ctl.abort();
  }, [result, props.engine]);

  const habits = useMemo(() => {
    if (!result) return [];
    return result.repeated
      .map((h) => ({ h, ev: checked.get(`${h.key}|${h.uci}`) }))
      .filter(({ h, ev }) => h.weak.length || (ev && ev.drop >= HABIT.drop && ev.best !== h.uci))
      .map(({ h, ev }) => {
        const alts = result.repeated.filter((x) => x.key === h.key && x.color === h.color).map((x) => ({ uci: x.uci, score: x.score, games: x.games }));
        const mine = betterMove(h, alts);
        const engineBest = ev && ev.best !== h.uci ? ev.best : undefined;
        const better = mine ?? engineBest;
        const why = !mine ? 'Stockfish' : h.book.includes(mine) ? 'your book move' : `you score ${pct(alts.find((a) => a.uci === mine)!.score)} with it`;
        return { h, ev, better, why };
      });
  }, [result, checked]);

  return (
    <div className="insights">
      <div className="deck-head">
        <button className="link" onClick={props.onBack}>
          ← Your library
        </button>
      </div>
      <h1>Insights</h1>
      <p className="muted">
        Your own games against your book: the moves you keep playing that cost you points, where you forgot your move, and where you had no move ready.
      </p>
      <div className="card rep-games">
        <GamesForm
          initial={props.initial}
          action={(n) => `Analyse ${n} game${n === 1 ? '' : 's'}`}
          onReset={() => {
            setResult(null);
            setChecked(new Map());
          }}
          onGo={(picked, fetched) => {
            setChecked(new Map());
            setResult({ ...analyse(picked, fetched.username, props.decks, props.edges), fetched });
          }}
        />
      </div>

      {result && (
        <>
          <p className="small muted insights-summary">
            From {result.games} games. {props.engine ? (checking ? `Checking your ${Math.min(EVAL_CHECKS, result.repeated.length)} most repeated moves with Stockfish…` : `Your ${Math.min(EVAL_CHECKS, result.repeated.length)} most repeated moves were checked with Stockfish.`) : 'Stockfish is switched off in the training settings, so only your results count.'}
          </p>

          <Section title="Habits that cost you" empty="No repeated move stands out as costly. Well played." count={habits.length}>
            {(n) =>
              habits.slice(0, n).map(({ h, ev, better, why }) => (
                <li key={`${h.color}|${h.key}|${h.uci}`} className="card insight-row">
                  <MiniBoard fen={h.fen} orientation={h.color} label={`Position after ${lineTo(h.path)}`} />
                  <div>
                    <p className="insight-title">{habitText(h)}</p>
                    <p className="small muted">After {lineTo(h.path)} · last played {date(h.last)}</p>
                    <p className="small">
                      {h.others && `With your other moves here you score ${pct(h.others.score)} (${h.others.games} games). `}
                      {ev && ev.drop >= HABIT.drop && ev.best !== h.uci && `Stockfish: it loses ${ev.drop.toFixed(1)} pawns. `}
                      {h.cost > 0 && `It has cost you about ${h.cost.toFixed(1)} points.`}
                    </p>
                    {better && (
                      <p className="small">
                        Better here: <b>{numbered(h.path.length, sanAt(h.fen, better))}</b> <span className="muted">({why})</span>
                      </p>
                    )}
                    <div className="row">
                      {better && (
                        <button className="btn small primary" onClick={() => props.onFix(h, better)}>
                          Fix it
                        </button>
                      )}
                      {props.hasCard(h.color, h.key) && (
                        <button className="btn small" onClick={() => props.onTrain(h.color, h.key)}>
                          Train this position
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))
            }
          </Section>

          <Section title="You forgot your move" empty="You played your book move every time." count={result.forgot.length}>
            {(n) => result.forgot.slice(0, n).map((r) => <LeftRow key={r.key} r={r} onTrain={props.hasCard(r.color, r.key) ? () => props.onTrain(r.color, r.key) : undefined} />)}
          </Section>

          <Section title="No move ready" empty="Your book had an answer every time your opponent was still in it." count={result.noAnswer.length}>
            {(n) => result.noAnswer.slice(0, n).map((r) => <LeftRow key={r.key} r={r} onAdd={() => props.onAddMove(r.color, [...r.path, r.played[0].uci])} />)}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, empty, count, children }: { title: string; empty: string; count: number; children(n: number): ReactNode }) {
  const [all, setAll] = useState(false);
  return (
    <section className="insights-section">
      <h2>
        {title} <span className="muted small">{count}</span>
      </h2>
      {count ? <ul className="insight-list">{children(all ? count : SHOW)}</ul> : <p className="small muted">{empty}</p>}
      {count > SHOW && (
        <button className="btn small ghost" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${count}`}
        </button>
      )}
    </section>
  );
}

function LeftRow({ r, onTrain, onAdd }: { r: LeftBook; onTrain?(): void; onAdd?(): void }) {
  const ply = r.path.length;
  const played = r.played.map((m) => `${numbered(ply, m.san)}${m.games > 1 ? ` (${m.games}×)` : ''}`).join(', ');
  return (
    <li className="card insight-row">
      <MiniBoard fen={r.fen} orientation={r.color} label={`Position after ${lineTo(r.path)}`} />
      <div>
        {r.kind === 'forgot' ? (
          <p className="insight-title">
            After {lineTo(r.path)} you played {played}. Your move is <b>{numbered(ply, sanAt(r.fen, r.book[0]))}</b>.
          </p>
        ) : (
          <p className="insight-title">
            After {lineTo(r.path)} they played {played}, and your book has no answer.
          </p>
        )}
        <p className="small muted">
          {r.games} game{r.games === 1 ? '' : 's'} · you scored {pct(r.points / r.games)} from here · last {date(r.last)}
        </p>
        <div className="row">
          {onTrain && (
            <button className="btn small" onClick={onTrain}>
              Train this position
            </button>
          )}
          {onAdd && (
            <button className="btn small" onClick={onAdd}>
              Add a move
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
