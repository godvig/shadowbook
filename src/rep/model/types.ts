// The Library's data model: a move graph for both sides, grouped into decks. Cards exist only for positions
// where the user moves, and are shared by decks that agree on the main move there.
import type { Card as FsrsCard } from 'ts-fsrs';
import type { Color } from '../../lib/types';

export type { Color };
export type Glyph = '!!' | '!' | '!?' | '?!' | '?' | '??';
export type Brush = 'green' | 'red' | 'blue' | 'yellow';
/** A circle when `dest` is absent, otherwise an arrow. */
export interface Shape {
  orig: string;
  dest?: string;
  brush: Brush;
}

export type DeckSource =
  | { kind: 'board' }
  | { kind: 'pgn' }
  | { kind: 'lichess'; studyId: string; chapterId?: string; url: string; studyName?: string }
  | { kind: 'starter'; starterId: string }
  /** `opening` is the family the deck was grouped by ("Sicilian Defense", or "" for the other lines). */
  | { kind: 'games'; site: 'chesscom' | 'lichess'; username: string; builtAt: string; opening: string };

export interface Deck {
  id: string;
  /** Chapter name, else opening name; editable. */
  name: string;
  /** The side the user plays. */
  color: Color;
  source: DeckSource;
  /** 1..10: first full move the user plays in training. */
  startMove: number;
  /** Comment before the first move. */
  intro?: string;
  createdAt: string;
  updatedAt: string;
  lastTrainedAt?: string;
}

/** One move in one deck. Key: [deckId, from, uci]. */
export interface Edge {
  deckId: string;
  /** fenKey of the position before the move. */
  from: string;
  uci: string;
  san: string;
  /** fenKey after the move. */
  to: string;
  /** Full FEN after the move, for display. */
  toFen: string;
  /** Moved by deck.color. */
  mine: boolean;
  /** Order among moves from `from` in this deck; 0 = main. */
  rank: number;
  glyph?: Glyph;
  comment?: string;
  /** Shown in the position after the move. */
  shapes?: Shape[];
  /** Other NAGs, kept only so export round-trips. */
  nags?: number[];
}

/** A fact to remember: "in this position I play this move". */
export interface Card {
  /** `${color}|${fenKey}|${uci}` where uci is the main move. */
  id: string;
  color: Color;
  /** Full FEN of the position. */
  fen: string;
  fsrs: FsrsCard;
  addedAt: string;
}

/** Append-only log, for statistics. */
export interface Review {
  id?: number;
  cardId: string;
  deckId: string;
  at: string;
  rating: 1 | 2 | 3 | 4;
  mode: 'lines' | 'positions';
  wasDue: boolean;
  elapsedDays: number;
  stateBefore: number;
}

export interface Settings {
  newPerDay: number;
  /** FSRS request_retention. */
  retention: number;
  /** Last used training mode. */
  mode: 'lines' | 'positions';
  autoplayMs: number;
  /** Training waits after each move of yours, so the panel can be read. */
  pauseAfterMove: boolean;
  /** The panel lists your other library moves in the position. */
  showBookMoves: boolean;
  /** The panel asks Lichess's cloud evaluation for Stockfish's best move (sends the position to Lichess). */
  engine: boolean;
}

export const DEFAULT_SETTINGS: Settings = { newPerDay: 20, retention: 0.9, mode: 'lines', autoplayMs: 350, pauseAfterMove: true, showBookMoves: true, engine: true };

/** Everything the Library holds, as plain arrays. */
export interface LibraryData {
  decks: Deck[];
  edges: Edge[];
  cards: Card[];
}
