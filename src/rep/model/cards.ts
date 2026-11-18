// Cards: one per (colour, position, main move). Decks that agree share a card; decks that disagree get one each.
import { createEmptyCard, fsrs, Rating, State, type Grade } from 'ts-fsrs';
import { childrenOf, positionFens, turnOf } from './deck';
import { enumerateLines, ownPositions } from './lines';
import type { Card, Color, Deck, Edge, Review } from './types';

export const cardId = (color: Color, key: string, uci: string) => `${color}|${key}|${uci}`;

/** The card id for every position where the deck's side moves, keyed by position. */
export function deckCardIds(deck: Pick<Deck, 'color'>, edges: Iterable<Edge>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, list] of childrenOf(edges)) {
    const main = list.find((e) => e.mine);
    if (main && turnOf(key) === deck.color) out.set(key, cardId(deck.color, key, main.uci));
  }
  return out;
}

/**
 * Brings the cards in line with the decks: a card is created (New) for every main move that has none, and a card
 * that no deck refers to any more is removed. Run after every edge change.
 */
export function syncCards(decks: Deck[], edges: Edge[], cards: Card[], now = new Date()): { cards: Card[]; added: Card[]; removed: string[] } {
  const byDeck = new Map<string, Edge[]>();
  for (const e of edges) {
    const list = byDeck.get(e.deckId);
    if (list) list.push(e);
    else byDeck.set(e.deckId, [e]);
  }
  const needed = new Map<string, { color: Color; fen: string }>();
  for (const d of decks) {
    const list = byDeck.get(d.id) ?? [];
    const fens = positionFens(list);
    for (const [key, id] of deckCardIds(d, list)) if (!needed.has(id)) needed.set(id, { color: d.color, fen: fens.get(key)! });
  }
  const have = new Map(cards.map((c) => [c.id, c]));
  const added: Card[] = [];
  for (const [id, { color, fen }] of needed) {
    if (!have.has(id)) added.push({ id, color, fen, fsrs: createEmptyCard(now), addedAt: now.toISOString() });
  }
  const removed = cards.filter((c) => !needed.has(c.id)).map((c) => c.id);
  const gone = new Set(removed);
  return { cards: [...cards.filter((c) => !gone.has(c.id)), ...added], added, removed };
}

/** What training needs for one card of one deck: the moves accepted there and a path to show as context. */
export interface Drill {
  card: Card;
  deckId: string;
  key: string;
  /** Full-move number on the first line that reaches the position. */
  move: number;
  /** UCI from the start position to here. */
  path: string[];
  /** Accepted moves in this deck, main first. */
  moves: string[];
}

export function deckDrills(deck: Deck, edges: Edge[], cards: Map<string, Card>): Drill[] {
  const depth = ownPositions(enumerateLines(edges), deck.color);
  const kids = childrenOf(edges);
  const out: Drill[] = [];
  for (const [key, id] of deckCardIds(deck, edges)) {
    const card = cards.get(id);
    const at = depth.get(key);
    if (!card || !at) continue;
    out.push({ card, deckId: deck.id, key, move: at.move, path: at.path, moves: kids.get(key)!.filter((e) => e.mine).map((e) => e.uci) });
  }
  return out;
}

export const isNew = (c: Card) => c.fsrs.state === State.New;
export const isDue = (c: Card, now: Date) => !isNew(c) && c.fsrs.due.getTime() <= now.getTime();

/** Deck counts at or after `startMove`. Due includes new cards still inside today's budget (`newLeft`). */
export function deckCounts(drills: Drill[], now: Date, newLeft: number, startMove = 1) {
  const inRange = drills.filter((d) => d.move >= startMove);
  const fresh = inRange.filter((d) => isNew(d.card)).length;
  return {
    total: inRange.length,
    learned: inRange.length - fresh,
    due: inRange.filter((d) => isDue(d.card, now)).length + Math.min(fresh, Math.max(0, newLeft)),
  };
}

/** Cards due now, most overdue first, then up to `newLeft` new cards, shallowest first. */
export function drillQueue(drills: Drill[], now: Date, newLeft: number, startMove = 1): Drill[] {
  const inRange = drills.filter((d) => d.move >= startMove);
  const due = inRange.filter((d) => isDue(d.card, now)).sort((a, b) => a.card.fsrs.due.getTime() - b.card.fsrs.due.getTime());
  const fresh = inRange
    .filter((d) => isNew(d.card))
    .sort((a, b) => a.move - b.move || a.card.addedAt.localeCompare(b.card.addedAt))
    .slice(0, Math.max(0, newLeft));
  return [...due, ...fresh];
}

const schedulers = new Map<number, ReturnType<typeof fsrs>>();
const schedulerFor = (retention: number) => {
  let s = schedulers.get(retention);
  if (!s) schedulers.set(retention, (s = fsrs({ enable_fuzz: true, request_retention: retention })));
  return s;
};

/** Grades a card and returns the updated card with its review log row. */
export function gradeCard(card: Card, rating: Grade, ctx: { deckId: string; mode: Review['mode']; retention: number }, now = new Date()): { card: Card; review: Review } {
  const { card: next, log } = schedulerFor(ctx.retention).next(card.fsrs, now, rating);
  return {
    card: { ...card, fsrs: next },
    review: {
      cardId: card.id,
      deckId: ctx.deckId,
      at: now.toISOString(),
      rating: rating as Review['rating'],
      mode: ctx.mode,
      wasDue: isDue(card, now),
      elapsedDays: log.elapsed_days,
      stateBefore: log.state,
    },
  };
}

export { Rating };
