// The nine starter openings in ./starters/*.pgn: tags Event (name), Orientation and Pitch (one line for the card).
import { newDeck, turnOf } from './model/deck';
import { parsePgn, type ParsedEdge } from './model/pgn';
import type { Color, Deck, Edge } from './model/types';

export interface Starter {
  /** The file name, e.g. "italian". */
  id: string;
  name: string;
  color: Color;
  pitch: string;
  edges: ParsedEdge[];
}

const files = import.meta.glob<string>('./starters/*.pgn', { query: '?raw', import: 'default', eager: true });

// White first, in the order of the plan's table; the Jobava London was added after it, next to the London.
const ORDER = ['italian', 'ruy-lopez', 'london', 'jobava-london', 'queens-gambit', 'sicilian', 'french', 'caro-kann', 'kings-indian'];

export const STARTERS: Starter[] = Object.entries(files)
  .map(([path, text]) => {
    const [game] = parsePgn(text);
    return { id: path.replace(/^.*\/|\.pgn$/g, ''), name: game.tags.Event, color: game.orientation ?? 'w', pitch: game.tags.Pitch ?? '', edges: game.edges };
  })
  .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

/** A starter as a deck of the user's own, ready to save. */
export function starterDeck(s: Starter, now = new Date()): { deck: Deck; edges: Edge[] } {
  const deck = newDeck({ name: s.name, color: s.color, source: { kind: 'starter', starterId: s.id } }, now);
  return { deck, edges: s.edges.map((e) => ({ ...e, deckId: deck.id, mine: turnOf(e.from) === s.color })) };
}
