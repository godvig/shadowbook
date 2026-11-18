import { createEmptyCard, State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { cardStates, forecast, localDay, mostMissed, retention, reviewsOn, streak } from './stats';
import type { Card, Review } from './types';

// Local times, so the tests hold in any time zone.
const now = new Date(2026, 10, 18, 12, 0);
const at = (daysAgo: number, hour = 10) => new Date(2026, 10, 18 - daysAgo, hour).toISOString();
const review = (daysAgo: number, rating: Review['rating'], more: Partial<Review> = {}): Review => ({
  cardId: 'w|a|e2e4',
  deckId: 'd1',
  at: at(daysAgo),
  rating,
  mode: 'lines',
  wasDue: true,
  elapsedDays: 3,
  stateBefore: State.Review,
  ...more,
});
const card = (id: string, state: State, due: Date): Card => ({ id, color: 'w', fen: '', fsrs: { ...createEmptyCard(now), state, due }, addedAt: now.toISOString() });

describe('streak and today', () => {
  it('counts days in a row up to today', () => {
    const reviews = [review(0, 3), review(1, 3), review(1, 1), review(2, 4), review(4, 3)];
    expect(streak(reviews, now)).toEqual({ days: 3, today: true });
    expect(reviewsOn(reviews, localDay(now))).toBe(1);
  });

  it('keeps yesterday’s streak while today has no review yet, and is zero after a gap', () => {
    expect(streak([review(1, 3), review(2, 3)], now)).toEqual({ days: 2, today: false });
    expect(streak([review(2, 3)], now)).toEqual({ days: 0, today: false });
    expect(streak([], now)).toEqual({ days: 0, today: false });
  });

  it('uses the local day, not the UTC day', () => {
    const lateEvening = new Date(2026, 10, 17, 23, 30).toISOString();
    expect(streak([review(0, 3, { at: lateEvening })], now)).toEqual({ days: 1, today: false });
  });
});

describe('forecast', () => {
  it('puts overdue cards on today, skips new cards and anything past the window', () => {
    const cards = [
      card('a', State.Review, new Date(2026, 10, 10)),
      card('b', State.Review, new Date(2026, 10, 18, 20)),
      card('c', State.Learning, new Date(2026, 10, 19, 9)),
      card('d', State.Review, new Date(2026, 10, 25)),
      card('e', State.New, new Date(2026, 10, 18)),
      card('f', State.Review, new Date(2026, 11, 30)),
    ];
    const f = forecast(cards, now);
    expect(f).toHaveLength(14);
    expect(f[0]).toEqual({ day: '2026-11-18', due: 2 });
    expect(f[1].due).toBe(1);
    expect(f[7]).toEqual({ day: '2026-11-25', due: 1 });
    expect(f.reduce((s, x) => s + x.due, 0)).toBe(4);
  });
});

describe('retention', () => {
  it('counts only learned cards reviewed when due, and every review per day', () => {
    const reviews = [
      review(0, 3),
      review(0, 1),
      review(1, 4),
      review(1, 1, { wasDue: false }),
      review(2, 3, { stateBefore: State.New }),
      review(2, 1, { stateBefore: State.Relearning }),
      review(40, 1),
    ];
    const r = retention(reviews, now);
    expect(r.byDay).toHaveLength(30);
    expect(r.byDay[29]).toEqual({ day: '2026-11-18', reviews: 2, missed: 1 });
    expect(r.byDay[28]).toEqual({ day: '2026-11-17', reviews: 2, missed: 1 });
    expect({ due: r.due, remembered: r.remembered, rate: r.rate }).toEqual({ due: 3, remembered: 2, rate: 2 / 3 });
  });

  it('has no rate without due reviews', () => {
    expect(retention([review(0, 1, { wasDue: false })], now).rate).toBeNull();
  });
});

describe('most missed', () => {
  it('ranks cards by misses, then the latest miss, and leaves out deleted cards', () => {
    const cards = new Map(['a', 'b', 'c'].map((id) => [id, card(id, State.Review, now)]));
    const reviews = [
      review(5, 1, { cardId: 'a' }),
      review(3, 1, { cardId: 'a' }),
      review(1, 3, { cardId: 'a' }),
      review(2, 1, { cardId: 'b' }),
      review(4, 1, { cardId: 'c' }),
      review(1, 1, { cardId: 'gone' }),
      review(1, 1, { cardId: 'gone' }),
    ];
    expect(mostMissed(reviews, cards).map((x) => [x.card.id, x.missed, x.reviews])).toEqual([
      ['a', 2, 3],
      ['b', 1, 1],
      ['c', 1, 1],
    ]);
    expect(mostMissed(reviews, cards, 1)).toHaveLength(1);
  });
});

it('counts new, learning and learned cards', () => {
  const cards = [card('a', State.New, now), card('b', State.Learning, now), card('c', State.Relearning, now), card('d', State.Review, now)];
  expect(cardStates(cards)).toEqual({ fresh: 1, learning: 2, learned: 1 });
});
