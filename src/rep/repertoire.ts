// Opening repertoire with spaced repetition. A card is a position where it is your move,
// keyed by colour + position (so transpositions are one card), holding the move(s) you play there.
import { Chess } from 'chess.js';
import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs';
import { fenKey, playUci, START_FEN, uciOf } from '../lib/chess';
import type { Color } from '../lib/types';

export interface RepEntry {
  id: string;
  color: Color;
  /** Full FEN of the position, your side to move. */
  fen: string;
  /** Moves you play here (UCI). The first is your main move; the others are also accepted. */
  moves: string[];
  /** A path from the start position to here (UCI), shown as context in review. */
  line: string[];
  card: Card;
  added: string;
}

export const entryId = (color: Color, fen: string) => `${color}|${fenKey(fen)}`;

const scheduler = fsrs({ enable_fuzz: true });

/** Positions along a line, with the move played from each. */
function walk(line: string[]): { fen: string; before: string[]; uci: string }[] {
  const chess = new Chess(START_FEN);
  const out: { fen: string; before: string[]; uci: string }[] = [];
  line.forEach((uci, i) => {
    out.push({ fen: chess.fen(), before: line.slice(0, i), uci });
    playUci(chess, uci);
  });
  return out;
}

/**
 * Records your move `uci` after `line` (UCI from the start). Returns the new or changed entry,
 * or null when the move is not yours to make (it's the other side's turn) or already stored.
 */
export function addMove(entries: Map<string, RepEntry>, color: Color, line: string[], uci: string, now = new Date()): RepEntry | null {
  const chess = new Chess(START_FEN);
  for (const u of line) playUci(chess, u);
  if (chess.turn() !== color) return null;
  const fen = chess.fen();
  const id = entryId(color, fen);
  const existing = entries.get(id);
  if (existing) {
    if (existing.moves.includes(uci)) return null;
    const next = { ...existing, moves: [...existing.moves, uci] };
    entries.set(id, next);
    return next;
  }
  const entry: RepEntry = { id, color, fen, moves: [uci], line: [...line], card: createEmptyCard(now), added: now.toISOString() };
  entries.set(id, entry);
  return entry;
}

/** Makes `uci` the main move at that position. */
export function makeMain(entry: RepEntry, uci: string): RepEntry {
  return { ...entry, moves: [uci, ...entry.moves.filter((m) => m !== uci)] };
}

/** Removes one of your moves; returns null when none remain (the card goes). */
export function removeMove(entry: RepEntry, uci: string): RepEntry | null {
  const moves = entry.moves.filter((m) => m !== uci);
  return moves.length ? { ...entry, moves } : null;
}

// ---------- PGN with variations ----------

export interface Edge {
  before: string[];
  uci: string;
}

/**
 * Every move in a PGN, including all variations, as (line before it, move).
 * Handles headers, {comments}, ;comments, NAGs, move numbers, results and nested ( ) variations.
 */
export function pgnEdges(pgn: string): Edge[] {
  const body = pgn.replace(/^\s*\[.*\]\s*$/gm, ' ').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
  const tokens = body.match(/\(|\)|[^\s()]+/g) ?? [];
  const edges: Edge[] = [];
  type Frame = { line: string[]; prevLine: string[] };
  let cur: Frame = { line: [], prevLine: [] };
  const stack: Frame[] = [];
  const position = (line: string[]) => {
    const c = new Chess(START_FEN);
    for (const u of line) playUci(c, u);
    return c;
  };
  for (const tok of tokens) {
    if (tok === '(') {
      stack.push(cur);
      // A variation replaces the last move played.
      cur = { line: [...cur.prevLine], prevLine: cur.prevLine.slice(0, -1) };
      continue;
    }
    if (tok === ')') {
      cur = stack.pop() ?? cur;
      continue;
    }
    if (/^\$\d+$/.test(tok) || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) continue;
    const san = tok.replace(/^\d+\.(\.\.)?/, '').replace(/[!?]+$/, '');
    if (!san || /^\d+\.+$/.test(tok)) continue;
    try {
      const m = position(cur.line).move(san);
      const uci = uciOf(m);
      edges.push({ before: [...cur.line], uci });
      cur = { line: [...cur.line, uci], prevLine: [...cur.line] };
    } catch {
      // Not a legal move here: skip this token and keep going.
    }
  }
  return edges;
}

/** Imports the moves of one side from a PGN. Returns how many cards were created and how many moves were added. */
export function importPgn(entries: Map<string, RepEntry>, pgnText: string, color: Color, now = new Date()): { cards: number; moves: number } {
  let cards = 0;
  let moves = 0;
  for (const game of pgnText.split(/\n\s*\n(?=\s*\[Event)/)) {
    for (const e of pgnEdges(game)) {
      const before = entries.size;
      const changed = addMove(entries, color, e.before, e.uci, now);
      if (changed) {
        moves++;
        if (entries.size > before) cards++;
      }
    }
  }
  return { cards, moves };
}

// ---------- Review ----------

export type Outcome = 'clean' | 'hint' | 'wrong';

/** First try without help = Good, with a hint = Hard, wrong or revealed = Again. */
export const ratingFor = (o: Outcome): Grade => (o === 'clean' ? Rating.Good : o === 'hint' ? Rating.Hard : Rating.Again);

export function review(entry: RepEntry, outcome: Outcome, now = new Date()): RepEntry {
  return { ...entry, card: scheduler.next(entry.card, now, ratingFor(outcome)).card };
}

/** Cards due now (learning and review), oldest first, then up to `newLeft` new cards, shallowest lines first. */
export function queue(entries: Iterable<RepEntry>, now: Date, newLeft: number): RepEntry[] {
  const all = [...entries];
  const due = all.filter((e) => e.card.state !== State.New && new Date(e.card.due).getTime() <= now.getTime()).sort((a, b) => new Date(a.card.due).getTime() - new Date(b.card.due).getTime());
  const fresh = all
    .filter((e) => e.card.state === State.New)
    .sort((a, b) => a.line.length - b.line.length || a.added.localeCompare(b.added))
    .slice(0, Math.max(0, newLeft));
  return [...due, ...fresh];
}

export function isNew(e: RepEntry) {
  return e.card.state === State.New;
}

/** The position after `line`, and whose move it is. */
export function positionAfter(line: string[]) {
  const c = new Chess(START_FEN);
  for (const u of line) playUci(c, u);
  return { fen: c.fen(), turn: c.turn() as Color };
}

/** Cards as stored: ts-fsrs dates come back from JSON as strings. */
export function revive(e: RepEntry): RepEntry {
  const c = e.card as Card & Record<string, unknown>;
  return { ...e, card: { ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review as unknown as string) : undefined } as Card };
}

export { walk };
