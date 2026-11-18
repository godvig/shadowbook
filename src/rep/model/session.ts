// A training session as a pure reducer: step(session, event) → { session, effects }. The screen only draws the
// session and sends events; grading, the order of lines and what to save are decided here, and tested here.
// Effects are what the screen must do afterwards: grade a card (FSRS and the review row) or add moves to a deck.
import { Chess } from 'chess.js';
import { fenKey, playUci, START_FEN } from '../../lib/chess';
import { cardId, isDue, isNew, Rating, type Drill } from './cards';
import { childrenOf, turnOf } from './deck';
import { enumerateLines, lineThrough } from './lines';
import type { Card, Color, Deck, Edge } from './types';

export type Grade = Rating.Again | Rating.Hard | Rating.Good;

/** One move of an item, in the order it is played. */
export interface Step {
  uci: string;
  san: string;
  from: string;
  to: string;
  /** Played by the side the user trains. */
  mine: boolean;
  /** Your moves only: every move that counts as right here, main first, and the card of the position. */
  accepted: string[];
  cardId?: string;
  /** The move in the deck, for its sign, note and arrows. */
  edge?: Edge;
}

/** What is trained: a whole line (Full lines) or one position with the path to it (Positions). */
export interface Item {
  deckId: string;
  color: Color;
  steps: Step[];
  /** Steps the user plays; the rest are played for them. */
  asked: number[];
  /** Leading steps put on the board at once, without autoplay (the path to a position). */
  instant: number;
}

export type Phase =
  /** Moves are being played for the user; the screen sends `tick` every `autoplayMs`. */
  | 'auto'
  /** The user's turn. */
  | 'ask'
  /** A new card: the move is shown with its note, then the user plays it. */
  | 'teach'
  /** The user played a legal move that is not in the book. */
  | 'offbook'
  /** After a right move, with Pause after each move on: the panel waits for Continue. */
  | 'feedback'
  /** The end of a line (Full lines). */
  | 'end'
  /** Adding moves on the board ("Add a move here", "Add what comes next"). */
  | 'extend'
  /** Nothing left to train. */
  | 'done';

export interface Feedback {
  /** The move played and its place in the line, e.g. "3…Bf5". */
  san: string;
  uci: string;
  /** The position the move was played in (full FEN), for the engine and the other book moves. */
  fen: string;
  edge?: Edge;
  /** Other moves of yours that also count here. */
  also: string[];
  /** When the line goes on with another of your moves than the one you played. */
  lineUses?: string;
  grade?: Grade;
  /** How the move was found: first time, after a hint, or after a miss or "Show move". */
  outcome: 'right' | 'hint' | 'missed' | 'taught';
  /** Not graded because the card was not due, or already graded in this session. */
  ungraded: boolean;
}

export interface Session {
  mode: 'lines' | 'positions';
  items: Item[];
  index: number;
  /** Steps of the current item on the board. */
  pos: number;
  /** The moves on the board (UCI), which can differ from the steps when the user plays another accepted move. */
  board: string[];
  phase: Phase;
  /** Fixed at the start, so the session is pure. */
  now: number;
  cards: Record<string, Card>;
  /** New cards that may still be taught today. */
  newLeft: number;
  /** Cards graded in this session: each card is graded once at most. */
  graded: string[];
  tries: number;
  hint: boolean;
  shown: boolean;
  /** The current step is a new card beyond today's budget, played for the user. */
  later: boolean;
  offMove?: string;
  feedback?: Feedback;
  pause: boolean;
  /** The current step is a new card being taught. */
  teaching: boolean;
  /** After a right move with Pause on: the move the line goes on with when Continue is pressed. */
  pending?: string;
  /** A short message, e.g. after a move was added. Cleared by the next move. */
  notice?: string;
  /** "Add a move here": the moves played so far, and the session to go back to. */
  extend?: { moves: string[]; resume: Session };
  practice: boolean;
  /** Decks' moves, for following another accepted move and for adding moves. */
  edges: Record<string, Edge[]>;
  tally: { right: number; hint: number; missed: number; taught: number };
}

export type Event =
  | { type: 'tick' }
  | { type: 'move'; uci: string }
  | { type: 'hint' }
  | { type: 'show' }
  | { type: 'tryAgain' }
  | { type: 'addAlternative' }
  | { type: 'makeMain' }
  | { type: 'continue' }
  | { type: 'addHere' }
  | { type: 'cancelAdd' }
  | { type: 'pause'; on: boolean };

export type Effect =
  | { type: 'grade'; cardId: string; deckId: string; rating: Grade; mode: Session['mode'] }
  /** Add the moves of `path` (UCI from the start) to the deck. */
  | { type: 'addMoves'; deckId: string; path: string[] }
  /** Make `uci` the main move at `from` in the deck (after adding it). */
  | { type: 'makeMain'; deckId: string; path: string[]; from: string; uci: string };

export interface SessionOptions {
  now: Date;
  cards: Card[];
  newLeft: number;
  pause: boolean;
  /** Train the items even when nothing in them is due, e.g. one position chosen from Insights. */
  practice?: boolean;
}

// ---------- building items ----------

const ownAt = (kids: Map<string, Edge[]>, key: string) => (kids.get(key) ?? []).filter((e) => e.mine);

function stepsOf(deck: Pick<Deck, 'color'>, kids: Map<string, Edge[]>, line: Edge[]): Step[] {
  return line.map((e) => {
    const own = e.mine ? ownAt(kids, e.from) : [];
    return {
      uci: e.uci,
      san: e.san,
      from: e.from,
      to: e.to,
      mine: e.mine,
      accepted: own.map((x) => x.uci),
      cardId: e.mine && own.length ? cardId(deck.color, e.from, own[0].uci) : undefined,
      edge: e,
    };
  });
}

const depthOf = (index: number) => Math.floor(index / 2) + 1;

/** Your moves at or after the start move; a start move beyond the line still asks its last move of yours. */
function askedIn(steps: Step[], startMove: number): number[] {
  const own = steps.map((s, i) => (s.mine && s.cardId ? i : -1)).filter((i) => i >= 0);
  if (!own.length) return [];
  const start = Math.min(startMove, depthOf(own[own.length - 1]));
  return own.filter((i) => depthOf(i) >= start);
}

const wanted = (c: Card | undefined, now: number) => !!c && (isNew(c) || isDue(c, new Date(now)));

/** Full lines: the deck's lines that have a card due now or new, most due first. */
export function linesFor(deck: Deck, edges: Edge[], cards: Record<string, Card>, now: Date): Item[] {
  const kids = childrenOf(edges);
  const items: (Item & { due: number })[] = [];
  for (const line of enumerateLines(edges)) {
    const steps = stepsOf(deck, kids, line);
    const asked = askedIn(steps, deck.startMove);
    const due = asked.filter((i) => wanted(cards[steps[i].cardId!], now.getTime())).length;
    if (due) items.push({ deckId: deck.id, color: deck.color, steps, asked, instant: 0, due });
  }
  items.sort((a, b) => b.due - a.due);
  for (const it of items) delete (it as Partial<typeof it>).due;
  return items;
}

/** Positions: one item per drill, the path to it put on the board at once. */
export function positionsFor(drills: Drill[], colorOf: (deckId: string) => Color, edges: Record<string, Edge[]>): Item[] {
  return drills.map((d) => {
    const color = colorOf(d.deckId);
    const chess = new Chess(START_FEN);
    const steps: Step[] = [];
    for (const uci of [...d.path, d.moves[0]]) {
      const from = fenKey(chess.fen());
      const san = playUci(chess, uci).san;
      steps.push({ uci, san, from, to: fenKey(chess.fen()), mine: turnOf(from) === color, accepted: [], edge: (edges[d.deckId] ?? []).find((e) => e.from === from && e.uci === uci) });
    }
    const last = steps[steps.length - 1];
    last.accepted = d.moves;
    last.cardId = d.card.id;
    return { deckId: d.deckId, color, steps, asked: [steps.length - 1], instant: steps.length - 1 };
  });
}

// ---------- the reducer ----------

export function startSession(mode: Session['mode'], items: Item[], edges: Record<string, Edge[]>, o: SessionOptions): Session {
  const s: Session = {
    mode,
    items,
    index: 0,
    pos: 0,
    board: [],
    phase: 'auto',
    now: o.now.getTime(),
    cards: Object.fromEntries(o.cards.map((c) => [c.id, c])),
    newLeft: o.newLeft,
    graded: [],
    tries: 0,
    hint: false,
    shown: false,
    later: false,
    teaching: false,
    pause: o.pause,
    practice: !!o.practice,
    edges,
    tally: { right: 0, hint: 0, missed: 0, taught: 0 },
  };
  return enterItem(s, 0);
}

export const currentItem = (s: Session): Item | undefined => s.items[s.index];
export const currentStep = (s: Session): Step | undefined => currentItem(s)?.steps[s.pos];

/** Whether an item still has something to train: a due card, or a new card while today's budget lasts. */
function worthTraining(s: Session, it: Item): boolean {
  if (s.practice) return it.asked.length > 0;
  return it.asked.some((i) => {
    const id = it.steps[i].cardId!;
    const c = s.cards[id];
    if (!c || s.graded.includes(id)) return false;
    return isNew(c) ? s.newLeft > 0 : isDue(c, new Date(s.now));
  });
}

function enterItem(s: Session, index: number): Session {
  let i = index;
  while (i < s.items.length && !worthTraining(s, s.items[i])) i++;
  if (i >= s.items.length) return { ...s, index: i, phase: 'done', feedback: undefined, pending: undefined };
  const it = s.items[i];
  return arrive({ ...s, index: i, pos: it.instant, board: it.steps.slice(0, it.instant).map((x) => x.uci), feedback: undefined, pending: undefined, offMove: undefined });
}

/** Decides what happens at the current step: ask, teach, or play it for the user. */
function arrive(s: Session): Session {
  const it = currentItem(s)!;
  const st = currentStep(s);
  const fresh = { tries: 0, hint: false, shown: false, later: false, teaching: false, offMove: undefined };
  // The end of a line waits for "Next line"; in Positions the next card follows after one tick.
  if (!st) return { ...s, ...fresh, phase: s.mode === 'lines' ? 'end' : 'auto' };
  if (!it.asked.includes(s.pos)) return { ...s, ...fresh, phase: 'auto' };
  const c = s.cards[st.cardId!];
  if (c && isNew(c) && !s.graded.includes(c.id)) {
    if (s.newLeft > 0 || s.practice) return { ...s, ...fresh, phase: 'teach', teaching: true, newLeft: s.newLeft - 1 };
    return { ...s, ...fresh, phase: 'auto', later: true };
  }
  return { ...s, ...fresh, phase: 'ask' };
}

/** Plays the current step (or `uci` in its place) and moves on. */
const advance = (s: Session, uci = currentStep(s)!.uci): Session => arrive({ ...s, pos: s.pos + 1, board: [...s.board, uci] });

function fenOf(board: string[]): string {
  const c = new Chess(START_FEN);
  for (const u of board) playUci(c, u);
  return c.fen();
}

function sanIn(board: string[], uci: string): string {
  try {
    return playUci(new Chess(fenOf(board)), uci).san;
  } catch {
    return uci;
  }
}

const numbered = (ply: number, san: string) => `${depthOf(ply)}${ply % 2 ? '…' : '.'}${san}`;
const replaceItem = (s: Session, it: Item) => s.items.map((x, i) => (i === s.index ? it : x));

function rightMove(s: Session, uci: string): { session: Session; effects: Effect[] } {
  const it = currentItem(s)!;
  const st = currentStep(s)!;
  const id = st.cardId!;
  const card = s.cards[id];
  const missed = s.tries > 0 || s.shown;
  let grade: Grade | undefined;
  if (card && !s.graded.includes(id)) {
    if (s.teaching) grade = missed ? Rating.Again : Rating.Good;
    else if (isDue(card, new Date(s.now))) grade = missed ? Rating.Again : s.hint ? Rating.Hard : Rating.Good;
    // A card that is not due is not graded when right, and Again when missed.
    else if (missed) grade = Rating.Again;
  }
  const outcome: Feedback['outcome'] = s.teaching ? 'taught' : missed ? 'missed' : s.hint ? 'hint' : 'right';
  const tally = { ...s.tally };
  tally[outcome === 'taught' ? 'taught' : outcome === 'right' ? 'right' : outcome] += 1;

  // Follow the move the user played if the deck goes on from it; otherwise the line goes on with its own move.
  let next = it;
  let lineUses: string | undefined;
  if (uci !== st.uci && s.mode === 'lines') {
    const edges = s.edges[it.deckId] ?? [];
    const kids = childrenOf(edges);
    const played = edges.find((e) => e.from === st.from && e.uci === uci);
    if (played && kids.get(played.to)?.length) {
      const steps = [...it.steps.slice(0, s.pos), ...stepsOf({ color: it.color }, kids, lineThrough(edges, [...s.board, uci]).moves.slice(s.pos))];
      const later = steps.map((x, i) => (i > s.pos && x.mine && x.cardId ? i : -1)).filter((i) => i >= 0);
      next = { ...it, steps, asked: [...it.asked.filter((i) => i <= s.pos), ...later] };
    } else lineUses = numbered(s.pos, st.san);
  }
  const feedback: Feedback = {
    san: numbered(s.pos, sanIn(s.board, uci)),
    uci,
    fen: fenOf(s.board),
    edge: (s.edges[it.deckId] ?? []).find((e) => e.from === st.from && e.uci === uci) ?? (uci === st.uci ? st.edge : undefined),
    also: st.accepted.filter((m) => m !== uci).map((m) => sanIn(s.board, m)),
    lineUses,
    grade,
    outcome,
    ungraded: grade === undefined,
  };
  const effects: Effect[] = grade !== undefined ? [{ type: 'grade', cardId: id, deckId: it.deckId, rating: grade, mode: s.mode }] : [];
  const moved: Session = { ...s, items: replaceItem(s, next), tally, graded: grade !== undefined ? [...s.graded, id] : s.graded, feedback };
  const onLine = lineUses ? st.uci : uci;
  // With Pause on, the move stays on the board while the panel is read, and Continue plays on.
  if (s.pause) return { session: { ...moved, phase: 'feedback', board: [...s.board, uci], pending: onLine }, effects };
  return { session: advance(moved, onLine), effects };
}

export function step(s: Session, e: Event): { session: Session; effects: Effect[] } {
  const none = (session: Session) => ({ session, effects: [] as Effect[] });
  switch (e.type) {
    case 'pause':
      return none({ ...s, pause: e.on });

    case 'tick':
      if (s.phase !== 'auto') return none(s);
      if (!currentStep(s)) return none(s.mode === 'lines' ? { ...s, phase: 'end' } : enterItem(s, s.index + 1));
      return none(advance(s));

    case 'hint':
      return none(s.phase === 'ask' ? { ...s, hint: true } : s);

    case 'show':
      return none(s.phase === 'ask' || s.phase === 'offbook' ? { ...s, phase: s.teaching ? 'teach' : 'ask', shown: true, offMove: undefined } : s);

    case 'move': {
      if (s.phase === 'extend') return extendMove(s, e.uci);
      if (s.phase !== 'ask' && s.phase !== 'teach') return none(s);
      const cleared = { ...s, feedback: undefined, notice: undefined };
      if (currentStep(s)!.accepted.includes(e.uci)) return rightMove(cleared, e.uci);
      // Off the book. After two misses the move is shown with an arrow.
      const tries = s.tries + 1;
      return none({ ...cleared, tries, phase: 'offbook', offMove: e.uci, shown: s.shown || tries >= 2 });
    }

    case 'tryAgain':
      return none(s.phase === 'offbook' ? { ...s, phase: s.teaching ? 'teach' : 'ask', offMove: undefined } : s);

    case 'addAlternative':
    case 'makeMain': {
      if (s.phase !== 'offbook' || !s.offMove) return none(s);
      const it = currentItem(s)!;
      const st = currentStep(s)!;
      const uci = s.offMove;
      const path = [...s.board, uci];
      const san = numbered(s.pos, sanIn(s.board, uci));
      // Adding a move leaves the card ungraded.
      if (e.type === 'addAlternative') {
        const steps = it.steps.map((x, i) => (i === s.pos ? { ...x, accepted: [...x.accepted, uci] } : x));
        const added = { ...s, items: replaceItem(s, { ...it, steps }), offMove: undefined, notice: `${san} is now an alternative here. This line goes on with ${numbered(s.pos, st.san)}.` };
        return { session: advance(added), effects: [{ type: 'addMoves', deckId: it.deckId, path }] };
      }
      // The new main move has nothing after it yet, so the line ends here, ready for "Add what comes next".
      return {
        session: { ...s, board: path, phase: 'end', offMove: undefined, notice: `${san} is now your main move here.` },
        effects: [
          { type: 'addMoves', deckId: it.deckId, path },
          { type: 'makeMain', deckId: it.deckId, path, from: st.from, uci },
        ],
      };
    }

    case 'continue':
      // The panel has been read: it goes away and the line plays on.
      if (s.phase === 'feedback') return none(advance({ ...s, board: s.board.slice(0, -1), feedback: undefined }, s.pending));
      if (s.phase === 'end') return none(enterItem({ ...s, notice: undefined }, s.index + 1));
      return none(s);

    case 'addHere':
      if (s.phase === 'done' || s.phase === 'extend' || s.phase === 'offbook') return none(s);
      return none({ ...s, phase: 'extend', extend: { moves: [], resume: s }, notice: undefined });

    case 'cancelAdd':
      return none(s.extend ? s.extend.resume : s);
  }
}

/** "Add a move here": moves are played for both sides; the first move of yours ends it, and they are all saved. */
function extendMove(s: Session, uci: string): { session: Session; effects: Effect[] } {
  const x = s.extend!;
  const resume = x.resume;
  const it = currentItem(resume)!;
  const moves = [...x.moves, uci];
  const board = [...resume.board, ...moves];
  const mover = turnOf(fenKey(fenOf([...resume.board, ...x.moves])));
  if (mover !== it.color) return { session: { ...s, extend: { ...x, moves } }, effects: [] };
  const effects: Effect[] = [{ type: 'addMoves', deckId: it.deckId, path: board }];
  const notice = `Saved ${moves.length === 1 ? 'your move' : `${moves.length} moves`} to this deck.`;
  // Back to where training was. A move of yours added at your turn now also counts as right there.
  if ((resume.phase === 'ask' || resume.phase === 'teach') && moves.length === 1) {
    const steps = it.steps.map((st, i) => (i === resume.pos ? { ...st, accepted: [...st.accepted, uci] } : st));
    return { session: { ...resume, items: replaceItem(resume, { ...it, steps }), notice }, effects };
  }
  return { session: { ...resume, notice }, effects };
}

/** The moves on the board, with the extension being added. */
export const boardOf = (s: Session): string[] => (s.phase === 'extend' && s.extend ? [...s.extend.resume.board, ...s.extend.moves] : s.offMove ? [...s.board, s.offMove] : s.board);
