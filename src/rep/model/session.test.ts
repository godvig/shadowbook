import { describe, expect, it } from 'vitest';
import { createEmptyCard, State, type Card as FsrsCard } from 'ts-fsrs';
import { sansToUcis } from '../../lib/chess';
import { cardId, deckDrills, Rating, syncCards } from './cards';
import { addPath, newDeck } from './deck';
import { boardOf, currentStep, linesFor, positionsFor, startSession, step, type Effect, type Event, type Session } from './session';
import type { Card, Color, Deck, Edge } from './types';

const now = new Date('2026-11-20T12:00:00Z');
const past = new Date('2026-11-10T12:00:00Z');
const future = new Date('2026-12-20T12:00:00Z');

function deckWith(color: Color, lines: string[][], startMove = 1) {
  const deck: Deck = { ...newDeck({ name: 'Test', color, source: { kind: 'board' } }), startMove };
  let edges: Edge[] = [];
  for (const l of lines) edges = addPath(edges, deck, sansToUcis(l));
  const cards = syncCards([deck], edges, [], past).cards;
  return { deck, edges, cards };
}

/** Sets a card's state: new, due (learned, due in the past) or learned (due later). */
function as(cards: Card[], id: string, state: 'new' | 'due' | 'learned'): Card[] {
  return cards.map((c) => {
    if (c.id !== id) return c;
    if (state === 'new') return { ...c, fsrs: createEmptyCard(past) };
    const fsrs: FsrsCard = { ...createEmptyCard(past), state: State.Review, reps: 3, stability: 10, last_review: past, due: state === 'due' ? past : future };
    return { ...c, fsrs };
  });
}

const idOf = (edges: Edge[], color: Color, san: string) => {
  const e = edges.find((x) => x.san === san && x.mine)!;
  return cardId(color, e.from, edges.find((x) => x.from === e.from && x.mine && x.rank === 0)!.uci);
};

function run(s: Session, events: Event[]): { session: Session; effects: Effect[] } {
  let effects: Effect[] = [];
  for (const e of events) {
    const r = step(s, e);
    s = r.session;
    effects = [...effects, ...r.effects];
  }
  return { session: s, effects };
}

/** Ticks until the session stops playing moves for the user. */
function settle(s: Session): Session {
  for (let i = 0; i < 50 && s.phase === 'auto'; i++) s = step(s, { type: 'tick' }).session;
  return s;
}

const italian = [
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'],
  ['e4', 'e5', 'Nf3', 'd6', 'd4'],
];

function session(o: { color?: Color; lines?: string[][]; states?: Record<string, 'new' | 'due' | 'learned'>; startMove?: number; newLeft?: number; pause?: boolean; mode?: 'lines' | 'positions' }) {
  const color = o.color ?? 'w';
  const { deck, edges, cards } = deckWith(color, o.lines ?? italian, o.startMove ?? 1);
  let all = cards.map((c) => as([c], c.id, 'learned')[0]);
  for (const [san, st] of Object.entries(o.states ?? {})) all = as(all, idOf(edges, color, san), st);
  const map = new Map(all.map((c) => [c.id, c]));
  const items = o.mode === 'positions' ? positionsFor(deckDrills(deck, edges, map).filter((d) => o.states?.[edges.find((e) => e.from === d.key && e.mine && e.rank === 0)!.san]), () => color, { [deck.id]: edges }) : linesFor(deck, edges, Object.fromEntries(map), now);
  const s = startSession(o.mode ?? 'lines', items, { [deck.id]: edges }, { now, cards: all, newLeft: o.newLeft ?? 20, pause: o.pause ?? false });
  return { s: settle(s), deck, edges, all };
}

describe('which lines are trained', () => {
  it('takes only lines with a card due or new, most due first', () => {
    const { s } = session({ states: { Bc4: 'due' } });
    expect(s.items.map((it) => it.steps.map((x) => x.san).join(' '))).toEqual(['e4 e5 Nf3 Nc6 Bc4 Bc5 c3']);
    const both = session({ states: { Bc4: 'due', d4: 'due', c3: 'due' } }).s;
    expect(both.items[0].steps.at(-1)!.san).toBe('c3');
  });

  it('plays the moves before the start move for you', () => {
    const { s } = session({ states: { Bc4: 'due' }, startMove: 3 });
    expect(s.phase).toBe('ask');
    expect(currentStep(s)!.san).toBe('Bc4');
    expect(boardOf(s)).toEqual(sansToUcis(['e4', 'e5', 'Nf3', 'Nc6']));
  });

  it('clamps a start move beyond the line, so its last move of yours is still asked', () => {
    const { s } = session({ states: { c3: 'due' }, startMove: 10 });
    expect(currentStep(s)!.san).toBe('c3');
  });

  it("plays White's first move for a Black deck", () => {
    const { s } = session({ color: 'b', lines: [['e4', 'c5', 'Nf3', 'd6']], states: { c5: 'due' } });
    expect(boardOf(s)).toEqual(['e2e4']);
    expect(s.phase).toBe('ask');
  });
});

describe('grading', () => {
  const at = (states: Record<string, 'new' | 'due' | 'learned'>) => session({ states, startMove: 3 }).s;

  it('due card: Good first time, Hard after a hint, Again after a miss or Show move', () => {
    const good = run(at({ Bc4: 'due' }), [{ type: 'move', uci: 'f1c4' }]);
    expect(good.effects).toEqual([expect.objectContaining({ type: 'grade', rating: Rating.Good })]);
    const hard = run(at({ Bc4: 'due' }), [{ type: 'hint' }, { type: 'move', uci: 'f1c4' }]);
    expect(hard.effects[0]).toMatchObject({ rating: Rating.Hard });
    const missed = run(at({ Bc4: 'due' }), [{ type: 'move', uci: 'f1b5' }, { type: 'tryAgain' }, { type: 'move', uci: 'f1c4' }]);
    expect(missed.effects[0]).toMatchObject({ rating: Rating.Again });
    const shown = run(at({ Bc4: 'due' }), [{ type: 'show' }, { type: 'move', uci: 'f1c4' }]);
    expect(shown.effects[0]).toMatchObject({ rating: Rating.Again });
  });

  it('card not due: no grade when right, Again when missed', () => {
    // e4 and Nf3 are learned and not due; with start move 1 they are asked but not graded.
    const early = session({ states: { Bc4: 'due' } }).s;
    expect(currentStep(early)!.san).toBe('e4');
    expect(run(early, [{ type: 'move', uci: 'e2e4' }]).effects).toEqual([]);
    expect(run(early, [{ type: 'move', uci: 'd2d4' }, { type: 'tryAgain' }, { type: 'move', uci: 'e2e4' }]).effects[0]).toMatchObject({ rating: Rating.Again });
  });

  it('new card: taught first, then graded Good; past the budget it is played for you as Later', () => {
    const s = at({ Bc4: 'new' });
    expect(s.phase).toBe('teach');
    const r = run(s, [{ type: 'move', uci: 'f1c4' }]);
    expect(r.effects[0]).toMatchObject({ rating: Rating.Good });
    expect(r.session.feedback?.outcome).toBe('taught');
    // Two new cards and a budget of one: the second is played for you.
    let t = session({ states: { Bc4: 'new', c3: 'new' }, startMove: 3, newLeft: 1 }).s;
    t = run(t, [{ type: 'move', uci: 'f1c4' }]).session;
    expect(t.phase).toBe('auto');
    t = step(t, { type: 'tick' }).session;
    expect(t.later).toBe(true);
    expect(currentStep(t)!.san).toBe('c3');
  });

  it('grades a card once per session, even when two lines share it', () => {
    let { s } = session({ states: { Nf3: 'due', c3: 'due', d4: 'due' }, startMove: 2 });
    const grades: Effect[] = [];
    for (let i = 0; i < 20 && s.phase !== 'done'; i++) {
      if (s.phase === 'ask' || s.phase === 'teach') {
        const r = step(s, { type: 'move', uci: currentStep(s)!.uci });
        grades.push(...r.effects);
        s = settle(r.session);
      } else if (s.phase === 'end') s = settle(step(s, { type: 'continue' }).session);
      else s = settle(s);
    }
    const nf3 = grades.filter((e) => e.type === 'grade' && e.cardId.endsWith('g1f3'));
    expect(nf3).toHaveLength(1);
    expect(s.phase).toBe('done');
  });
});

describe('off the book', () => {
  const at = () => session({ states: { Bc4: 'due' }, startMove: 3 }).s;

  it('Try again takes the move back; two misses show the move', () => {
    let s = run(at(), [{ type: 'move', uci: 'd2d4' }]).session;
    expect(s.phase).toBe('offbook');
    expect(boardOf(s).at(-1)).toBe('d2d4');
    s = run(s, [{ type: 'tryAgain' }]).session;
    expect(s.phase).toBe('ask');
    expect(s.shown).toBe(false);
    s = run(s, [{ type: 'move', uci: 'd2d3' }]).session;
    expect(s.shown).toBe(true);
  });

  it('Add as alternative saves the move, leaves the card ungraded and goes on with the line', () => {
    const r = run(at(), [{ type: 'move', uci: 'd2d4' }, { type: 'addAlternative' }]);
    expect(r.effects).toEqual([{ type: 'addMoves', deckId: r.session.items[0].deckId, path: sansToUcis(['e4', 'e5', 'Nf3', 'Nc6', 'd4']) }]);
    expect(boardOf(r.session).at(-1)).toBe('f1c4');
    expect(r.session.notice).toMatch(/3\.d4 is now an alternative/);
  });

  it('Make it my main move saves it as main, ungraded, and ends the line there', () => {
    const r = run(at(), [{ type: 'move', uci: 'd2d4' }, { type: 'makeMain' }]);
    expect(r.effects.map((e) => e.type)).toEqual(['addMoves', 'makeMain']);
    expect(r.session.phase).toBe('end');
  });
});

describe('several moves of yours', () => {
  it('follows the move you played when the deck goes on from it', () => {
    const lines = [['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'], ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4']];
    let { s } = session({ lines, states: { Bc4: 'due', c3: 'due' }, startMove: 3 });
    s = settle(run(s, [{ type: 'move', uci: 'f1b5' }]).session);
    expect(s.feedback?.also).toEqual(['Bc4']);
    expect(currentStep(s)!.san).toBe('Ba4');
  });

  it('says which move the line uses when yours has nothing after it', () => {
    const lines = [['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'], ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']];
    let { s } = session({ lines, states: { Bc4: 'due' }, startMove: 3 });
    s = run(s, [{ type: 'move', uci: 'f1b5' }]).session;
    expect(s.feedback?.lineUses).toBe('3.Bc4');
    expect(boardOf(s).at(-1)).toBe('f1c4');
  });
});

describe('pause after each move', () => {
  it('waits for Continue with Pause on, and plays on with it off', () => {
    const on = session({ states: { Bc4: 'due' }, startMove: 3, pause: true }).s;
    let s = run(on, [{ type: 'move', uci: 'f1c4' }]).session;
    expect(s.phase).toBe('feedback');
    expect(s.feedback?.san).toBe('3.Bc4');
    s = run(s, [{ type: 'continue' }]).session;
    expect(s.phase).toBe('auto');
    expect(s.feedback).toBeUndefined();
    const off = run(session({ states: { Bc4: 'due' }, startMove: 3 }).s, [{ type: 'move', uci: 'f1c4' }]).session;
    expect(off.phase).toBe('auto');
    expect(off.feedback?.san).toBe('3.Bc4');
  });
});

describe('the end of a line and adding moves', () => {
  it('Add what comes next saves their move and your reply, then returns to the end of the line', () => {
    let { s } = session({ lines: [italian[0]], states: { c3: 'due' }, startMove: 4 });
    s = settle(run(s, [{ type: 'move', uci: 'c2c3' }]).session);
    expect(s.phase).toBe('end');
    const r = run(s, [{ type: 'addHere' }, { type: 'move', uci: 'g8f6' }, { type: 'move', uci: 'd2d3' }]);
    expect(r.effects).toEqual([{ type: 'addMoves', deckId: s.items[0].deckId, path: [...sansToUcis(italian[0]), 'g8f6', 'd2d3'] }]);
    expect(r.session.phase).toBe('end');
    expect(r.session.notice).toBe('Saved 2 moves to this deck.');
  });

  it('Add a move here at your turn makes the move count as right', () => {
    let { s } = session({ states: { Bc4: 'due' }, startMove: 3 });
    s = run(s, [{ type: 'addHere' }, { type: 'move', uci: 'f1e2' }]).session;
    expect(s.phase).toBe('ask');
    expect(currentStep(s)!.accepted).toContain('f1e2');
    expect(run(s, [{ type: 'cancelAdd' }]).session.phase).toBe('ask');
  });
});

describe('positions mode', () => {
  it('puts the path on the board at once, asks the card, then moves to the next', () => {
    let { s } = session({ mode: 'positions', states: { Bc4: 'due', d4: 'due' } });
    expect(s.phase).toBe('ask');
    expect(boardOf(s)).toEqual(sansToUcis(['e4', 'e5', 'Nf3', 'Nc6']));
    const r = run(s, [{ type: 'move', uci: 'f1c4' }]);
    expect(r.effects[0]).toMatchObject({ rating: Rating.Good, mode: 'positions' });
    s = settle(r.session);
    expect(currentStep(s)!.san).toBe('d4');
  });
});
