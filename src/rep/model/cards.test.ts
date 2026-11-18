import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import { fenKey, sansToUcis } from '../../lib/chess';
import { cardId, deckCounts, deckDrills, drillQueue, gradeCard, Rating, resetDeck, syncCards } from './cards';
import { addPath, makeMain, newDeck, ownMoveIndex, removeEdge, START_KEY } from './deck';
import { enumerateLines, ownPositions } from './lines';
import type { Card, Edge } from './types';

const now = new Date('2026-11-16T12:00:00Z');
const white = (name: string) => newDeck({ name, color: 'w', source: { kind: 'board' } }, now);
const path = (edges: Edge[], deck: ReturnType<typeof white>, sans: string[]) => addPath(edges, deck, sansToUcis(sans));
const keyAfter = (edges: Edge[], san: string) => edges.find((e) => e.san === san)!.to;
const ids = (cards: Card[]) => cards.map((c) => c.id).sort();

describe('editing a deck', () => {
  it('adds moves once, ranks them in order, and removes a move with what hangs off it', () => {
    const d = white('Open games');
    let edges = path([], d, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    edges = path(edges, d, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
    edges = path(edges, d, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(edges).toHaveLength(6);
    const after = keyAfter(edges, 'Nc6');
    expect(edges.filter((e) => e.from === after).map((e) => [e.san, e.rank, e.mine])).toEqual([['Bb5', 0, true], ['Bc4', 1, true]]);
    expect(edges.find((e) => e.san === 'e5')?.mine).toBe(false);

    const swapped = makeMain(edges, after, 'f1c4');
    expect(swapped.filter((e) => e.from === after).sort((a, b) => a.rank - b.rank).map((e) => e.san)).toEqual(['Bc4', 'Bb5']);

    const cut = removeEdge(edges, keyAfter(edges, 'e4'), 'e7e5');
    expect(cut.map((e) => e.san)).toEqual(['e4']);
    const alt = removeEdge(edges, after, 'f1b5');
    expect(alt.filter((e) => e.from === after).map((e) => [e.san, e.rank])).toEqual([['Bc4', 0]]);
  });

  it('indexes your moves across decks, main moves first', () => {
    const a = white('A');
    const b = white('B');
    const edges = [...path([], a, ['e4', 'e5', 'Nf3']), ...path(path([], b, ['e4', 'e5', 'Nc3']), b, ['e4', 'e5', 'Nf3'])];
    const idx = ownMoveIndex([a, b], edges);
    expect(idx.ownMoves('w', keyAfter(edges, 'e5'))).toEqual(['g1f3', 'b1c3']);
    expect(idx.ownMoves('b', START_KEY)).toEqual([]);
    expect(idx.size('w')).toBe(2);
  });
});

describe('lines', () => {
  it('covers every move once, ends a line at a transposition, and gives move depth', () => {
    const d = white('QGD');
    let edges = path([], d, ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'd5']);
    edges = path(edges, d, ['d4', 'e6', 'c4', 'Nf6', 'Nf3']); // 2…Nf6 already transposes into the first line
    const lines = enumerateLines(edges);
    expect(lines.map((l) => l.map((e) => e.san).join(' '))).toEqual(['d4 Nf6 c4 e6 Nf3 d5', 'd4 e6 c4 Nf6']);
    expect(new Set(lines.flat()).size).toBe(edges.length);
    const own = ownPositions(lines, 'w');
    expect(own.get(START_KEY)?.move).toBe(1);
    expect(own.get(keyAfter(edges, 'e6'))?.move).toBe(3);
  });
});

describe('card identity', () => {
  it('shares a card between decks that agree, and keeps two when they disagree', () => {
    const italian = white('Italian');
    const ruy = white('Ruy Lopez');
    const edges = [...path([], italian, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']), ...path([], ruy, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])];
    const { cards } = syncCards([italian, ruy], edges, [], now);
    const nc6 = keyAfter(edges, 'Nc6');
    expect(ids(cards)).toEqual(
      [cardId('w', START_KEY, 'e2e4'), cardId('w', keyAfter(edges, 'e5'), 'g1f3'), cardId('w', nc6, 'f1c4'), cardId('w', nc6, 'f1b5')].sort(),
    );
  });

  it('resets a deck’s cards, shared ones included, and names the decks that share them', () => {
    const italian = white('Italian');
    const ruy = white('Ruy Lopez');
    const london = white('London');
    const edges = [...path([], italian, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']), ...path([], ruy, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']), ...path([], london, ['d4', 'd5', 'Bf4'])];
    const synced = syncCards([italian, ruy, london], edges, [], now).cards;
    const later = new Date('2026-11-20T12:00:00Z');
    const trained = synced.map((c) => gradeCard(c, Rating.Good, { deckId: 'x', mode: 'lines', retention: 0.9 }, now).card);
    const r = resetDeck(italian, [italian, ruy, london], edges, trained, later);
    expect(r.shared.map((d) => d.name)).toEqual(['Ruy Lopez']);
    expect(ids(r.reset)).toEqual([cardId('w', START_KEY, 'e2e4'), cardId('w', keyAfter(edges, 'e5'), 'g1f3'), cardId('w', keyAfter(edges, 'Nc6'), 'f1c4')].sort());
    const state = new Map(r.cards.map((c) => [c.id, c.fsrs.state]));
    expect(r.reset.every((c) => state.get(c.id) === State.New)).toBe(true);
    expect(state.get(cardId('w', keyAfter(edges, 'Nc6'), 'f1b5'))).not.toBe(State.New);
    expect(state.get(cardId('w', START_KEY, 'd2d4'))).not.toBe(State.New);
    expect(r.cards).toHaveLength(trained.length);
  });

  it('gives a new card when the main move changes, keeps the schedule of shared cards, and removes orphans', () => {
    const d = white('Italian');
    let edges = path(path([], d, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']), d, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    let cards = syncCards([d], edges, [], now).cards;
    const first = cards.find((c) => c.id === cardId('w', START_KEY, 'e2e4'))!;
    const graded = gradeCard(first, Rating.Good, { deckId: d.id, mode: 'positions', retention: 0.9 }, now).card;
    cards = cards.map((c) => (c.id === graded.id ? graded : c));

    const nc6 = keyAfter(edges, 'Nc6');
    edges = makeMain(edges, nc6, 'f1b5');
    const r = syncCards([d], edges, cards, now);
    expect(r.removed).toEqual([cardId('w', nc6, 'f1c4')]);
    expect(r.added.map((c) => [c.id, c.fsrs.state])).toEqual([[cardId('w', nc6, 'f1b5'), State.New]]);
    expect(r.cards.find((c) => c.id === graded.id)?.fsrs.state).toBe(graded.fsrs.state);

    const cut = syncCards([d], removeEdge(edges, keyAfter(edges, 'e4'), 'e7e5'), r.cards, now);
    expect(ids(cut.cards)).toEqual([cardId('w', START_KEY, 'e2e4')]);
  });

  it('counts and queues by start move and today’s budget, and logs each grade', () => {
    const d = white('Deck');
    const edges = path([], d, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4']);
    let cards = syncCards([d], edges, [], now).cards;
    const drills = () => deckDrills(d, edges, new Map(cards.map((c) => [c.id, c])));
    expect(deckCounts(drills(), now, 20)).toEqual({ total: 4, learned: 0, due: 4 });
    expect(deckCounts(drills(), now, 2)).toEqual({ total: 4, learned: 0, due: 2 });
    expect(deckCounts(drills(), now, 20, 3)).toEqual({ total: 2, learned: 0, due: 2 });
    expect(drillQueue(drills(), now, 2).map((x) => x.move)).toEqual([1, 2]);
    expect(drillQueue(drills(), now, 20, 3)[0].path).toEqual(sansToUcis(['e4', 'e5', 'Nf3', 'Nc6']));

    const { card, review } = gradeCard(cards[0], Rating.Again, { deckId: d.id, mode: 'positions', retention: 0.9 }, now);
    expect(review).toMatchObject({ cardId: card.id, deckId: d.id, rating: 1, mode: 'positions', wasDue: false, stateBefore: State.New });
    cards = cards.map((c) => (c.id === card.id ? card : c));
    const later = new Date(now.getTime() + 86400_000);
    expect(drillQueue(drills(), later, 0).map((x) => x.key)).toEqual([fenKey(card.fen)]);
  });
});
