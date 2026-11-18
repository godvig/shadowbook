// Progress: how training is going, from the review log (loaded only here) and the cards. Today and the streak,
// what comes due in the next two weeks, how much was remembered over the last 30 days, the moves missed most
// often, and one row per deck. The counting is in model/stats.ts; the charts are plain SVG.
import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { playUci, ucisToSanLine } from '../lib/chess';
import * as db from './db';
import { MiniBoard } from './MiniBoard';
import type { Drill } from './model/cards';
import { cardStates, countsForRetention, forecast, localDay, mostMissed, retention, reviewsOn, streak, type Day } from './model/stats';
import type { Card, Deck, Review } from './model/types';

const pct = (x: number) => `${Math.round(100 * x)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const weekday = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
const dateOf = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const sanAt = (fen: string, uci: string) => {
  try {
    return playUci(new Chess(fen), uci).san;
  } catch {
    return uci;
  }
};

export function Progress(props: {
  decks: Deck[];
  cards: Card[];
  target: number;
  drillsOf(deck: Deck): Drill[];
  dueOf(deck: Deck): number;
  /** The deck's drill for a card, to show where it is and train it. */
  drillFor(cardId: string): Drill | undefined;
  onTrain(drill: Drill): void;
  onOpenDeck(id: string): void;
  onBack(): void;
}) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    db.loadReviews().then(setReviews, () => setError('Could not read your reviews from this browser.'));
  }, []);

  const now = useMemo(() => new Date(), []);
  const cardMap = useMemo(() => new Map(props.cards.map((c) => [c.id, c])), [props.cards]);
  const ahead = useMemo(() => forecast(props.cards, now), [props.cards, now]);
  const month = useMemo(() => (reviews ? retention(reviews, now) : null), [reviews, now]);
  const missed = useMemo(() => (reviews ? mostMissed(reviews, cardMap) : []), [reviews, cardMap]);

  const back = (
    <div className="deck-head">
      <button className="link" onClick={props.onBack}>
        ← Your library
      </button>
    </div>
  );
  if (error) return <div className="progress-page">{back}<p className="err">{error}</p></div>;
  if (!reviews || !month) return <div className="progress-page">{back}<p className="muted">Reading your reviews…</p></div>;

  const run = streak(reviews, now);
  const today = reviewsOn(reviews, localDay(now));
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  return (
    <div className="progress-page">
      {back}
      <h1>Progress</h1>

      <div className="progress-tiles">
        <div className="card tile">
          <span className="tile-n">{today}</span>
          <span className="muted small">reviews today</span>
        </div>
        <div className="card tile">
          <span className="tile-n">{run.days}</span>
          <span className="muted small">{run.days === 1 ? 'day' : 'days'} in a row{run.days && !run.today ? ', train today to keep it' : ''}</span>
        </div>
        <div className="card tile">
          <span className="tile-n">{month.rate === null ? '–' : pct(month.rate)}</span>
          <span className="muted small">remembered when due, last 30 days (target {pct(props.target)})</span>
        </div>
      </div>

      <section className="card progress-card">
        <h2>Coming due</h2>
        <p className="muted small">Learned moves that come back each day for the next two weeks. Today includes anything overdue; new moves are not counted.</p>
        <Forecast days={ahead} />
      </section>

      <section className="card progress-card">
        <h2>Last 30 days</h2>
        {reviews.length ? (
          <>
            <p className="muted small">
              {month.due
                ? `Of ${plural(month.due, 'review')} of learned moves that were due, you remembered ${month.remembered} (${pct(month.rate!)}). `
                : 'No learned move has come due yet. '}
              Each bar is one day's reviews; the coral part at its foot is the moves you missed. Point at a bar for its numbers.
            </p>
            <Month days={month.byDay} />
          </>
        ) : (
          <p className="muted small">Nothing yet. Train a deck and your days show up here.</p>
        )}
      </section>

      <section className="card progress-card">
        <h2>Missed most often</h2>
        {missed.length ? (
          <ul className="insight-list">
            {missed.map((m) => {
              const drill = props.drillFor(m.card.id);
              const uci = m.card.id.split('|')[2];
              const ply = drill?.path.length ?? 0;
              const move = `${Math.floor(ply / 2) + 1}${ply % 2 ? '…' : '.'}${sanAt(m.card.fen, uci)}`;
              return (
                <li key={m.card.id} className="insight-row">
                  <MiniBoard fen={m.card.fen} orientation={m.card.color} label={drill ? `Position after ${ucisToSanLine(drill.path) || 'the start'}` : 'Position'} />
                  <div>
                    <p className="insight-title">
                      {drill?.path.length ? `After ${ucisToSanLine(drill.path)}, your move is ` : 'Your move is '}
                      <b>{move}</b>.
                    </p>
                    <p className="small muted">
                      Missed {m.missed} of {plural(m.reviews, 'review')} · last missed {new Date(m.last).toLocaleDateString()}
                      {drill ? ` · ${props.decks.find((d) => d.id === drill.deckId)?.name ?? ''}` : ''}
                    </p>
                    {drill && (
                      <button className="btn small" onClick={() => props.onTrain(drill)}>
                        Train this position
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted small">No move missed yet.</p>
        )}
      </section>

      <section className="card progress-card">
        <h2>Decks</h2>
        <div className="progress-table-wrap">
          <table className="progress-table">
            <thead>
              <tr>
                <th scope="col">Deck</th>
                <th scope="col">Moves</th>
                <th scope="col">New</th>
                <th scope="col">Learning</th>
                <th scope="col">Learned</th>
                <th scope="col">Due</th>
                <th scope="col">Remembered</th>
                <th scope="col">Last trained</th>
              </tr>
            </thead>
            <tbody>
              {props.decks.map((d) => {
                const n = cardStates(props.drillsOf(d).map((x) => x.card));
                const due = reviews.filter((r) => r.deckId === d.id && r.at >= since && countsForRetention(r));
                const kept = due.filter((r) => r.rating > 1).length;
                return (
                  <tr key={d.id}>
                    <th scope="row">
                      <button className="link" onClick={() => props.onOpenDeck(d.id)}>
                        {d.name}
                      </button>
                    </th>
                    <td>{n.fresh + n.learning + n.learned}</td>
                    <td>{n.fresh}</td>
                    <td>{n.learning}</td>
                    <td>{n.learned}</td>
                    <td>{props.dueOf(d)}</td>
                    <td title={due.length ? `${kept} of ${due.length} in the last 30 days` : 'Nothing due in the last 30 days'}>{due.length ? pct(kept / due.length) : '–'}</td>
                    <td>{d.lastTrainedAt ? new Date(d.lastTrainedAt).toLocaleDateString() : 'never'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const H = 120;
const BASE = 22;

function Forecast({ days }: { days: { day: string; due: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.due));
  const w = 40;
  return (
    <svg className="chart" viewBox={`0 0 ${days.length * w} ${H + BASE}`} role="img" aria-label={`Moves coming due: ${days.map((d, i) => `${i ? weekday(d.day) : 'today'} ${d.due}`).join(', ')}`}>
      {days.map((d, i) => {
        const h = (d.due / max) * (H - 18);
        return (
          <g key={d.day}>
            <title>{`${i ? dateOf(d.day) : 'Today'}: ${plural(d.due, 'move')}`}</title>
            <rect x={i * w + 6} y={H - h} width={w - 12} height={Math.max(h, d.due ? 2 : 0)} rx={3} className={i ? 'bar-due' : 'bar-today'} />
            {d.due > 0 && (
              <text x={i * w + w / 2} y={H - h - 5} className="chart-n">
                {d.due}
              </text>
            )}
            <text x={i * w + w / 2} y={H + 15} className="chart-label">
              {i ? weekday(d.day).slice(0, 2) : 'Now'}
            </text>
          </g>
        );
      })}
      <line x1={0} x2={days.length * w} y1={H + 0.5} y2={H + 0.5} className="chart-axis" />
    </svg>
  );
}

function Month({ days }: { days: Day[] }) {
  const max = Math.max(1, ...days.map((d) => d.reviews));
  const w = 16;
  return (
    <svg className="chart" viewBox={`0 0 ${days.length * w} ${H + BASE}`} role="img" aria-label={`Reviews per day for the last ${days.length} days, ${days.reduce((s, d) => s + d.reviews, 0)} in all`}>
      {days.map((d, i) => {
        const h = (d.reviews / max) * H;
        const hm = (d.missed / max) * H;
        return (
          <g key={d.day}>
            <title>{`${dateOf(d.day)}: ${plural(d.reviews, 'review')}, ${d.missed} missed`}</title>
            <rect x={i * w + 2} y={H - h} width={w - 4} height={h} className="bar-kept" />
            <rect x={i * w + 2} y={H - hm} width={w - 4} height={hm} className="bar-missed" />
          </g>
        );
      })}
      <line x1={0} x2={days.length * w} y1={H + 0.5} y2={H + 0.5} className="chart-axis" />
      <text x={0} y={H + 15} className="chart-label" textAnchor="start">
        {dateOf(days[0].day)}
      </text>
      <text x={days.length * w} y={H + 15} className="chart-label" textAnchor="end">
        Today
      </text>
    </svg>
  );
}
