// Statistics for the Progress page, from the cards and the review log. Days are the person's local days, so a
// streak or "today" follows their clock, not UTC. "Remembered" counts only reviews of learned cards that were due:
// the share not graded Again, which is what the target retention in the settings aims at.
import { State } from 'ts-fsrs';
import type { Card, Review } from './types';

export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const reviewsOn = (reviews: Review[], day: string) => reviews.filter((r) => localDay(new Date(r.at)) === day).length;

/** Days in a row with at least one review, up to today; a day not trained yet today does not break it. */
export function streak(reviews: Review[], now: Date): { days: number; today: boolean } {
  const days = new Set(reviews.map((r) => localDay(new Date(r.at))));
  const today = days.has(localDay(now));
  let n = 0;
  for (let d = today ? now : addDays(now, -1); days.has(localDay(d)); d = addDays(d, -1)) n++;
  return { days: n, today };
}

/** Learned cards coming due on each of the next `days` days; the first day includes everything overdue. */
export function forecast(cards: Card[], now: Date, days = 14): { day: string; due: number }[] {
  const out = Array.from({ length: days }, (_, i) => ({ day: localDay(addDays(now, i)), due: 0 }));
  const index = new Map(out.map((x, i) => [x.day, i]));
  for (const c of cards) {
    if (c.fsrs.state === State.New) continue;
    const due = new Date(c.fsrs.due);
    const i = due.getTime() <= now.getTime() ? 0 : index.get(localDay(due));
    if (i !== undefined) out[i].due++;
  }
  return out;
}

/** A review that counts towards "remembered": a learned card, reviewed when it was due. */
export const countsForRetention = (r: Review) => r.wasDue && r.stateBefore === State.Review;

export interface Day {
  day: string;
  reviews: number;
  /** Reviews graded Again. */
  missed: number;
}

/** The last `days` days, oldest first, with how much was remembered when due over the whole period. */
export function retention(reviews: Review[], now: Date, days = 30): { byDay: Day[]; due: number; remembered: number; rate: number | null } {
  const byDay = Array.from({ length: days }, (_, i) => ({ day: localDay(addDays(now, i - days + 1)), reviews: 0, missed: 0 }));
  const index = new Map(byDay.map((x, i) => [x.day, i]));
  let due = 0;
  let remembered = 0;
  for (const r of reviews) {
    const i = index.get(localDay(new Date(r.at)));
    if (i === undefined) continue;
    byDay[i].reviews++;
    if (r.rating === 1) byDay[i].missed++;
    if (countsForRetention(r)) {
      due++;
      if (r.rating > 1) remembered++;
    }
  }
  return { byDay, due, remembered, rate: due ? remembered / due : null };
}

/** The cards graded Again most often, among cards that still exist; ties go to the most recent miss. */
export function mostMissed(reviews: Review[], cards: Map<string, Card>, limit = 10): { card: Card; missed: number; reviews: number; last: string }[] {
  const by = new Map<string, { missed: number; reviews: number; last: string }>();
  for (const r of reviews) {
    if (!cards.has(r.cardId)) continue;
    const x = by.get(r.cardId) ?? { missed: 0, reviews: 0, last: '' };
    x.reviews++;
    if (r.rating === 1) {
      x.missed++;
      if (r.at > x.last) x.last = r.at;
    }
    by.set(r.cardId, x);
  }
  return [...by]
    .filter(([, x]) => x.missed > 0)
    .sort(([, a], [, b]) => b.missed - a.missed || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map(([id, x]) => ({ card: cards.get(id)!, ...x }));
}

/** How a deck's cards stand: never trained, still being learned, and learned. */
export function cardStates(cards: Card[]) {
  const n = { fresh: 0, learning: 0, learned: 0 };
  for (const c of cards) {
    if (c.fsrs.state === State.New) n.fresh++;
    else if (c.fsrs.state === State.Review) n.learned++;
    else n.learning++;
  }
  return n;
}
