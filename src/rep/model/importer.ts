// Importing PGN and Lichess studies: one deck per chapter. A chapter imported before (same study and chapter id)
// updates its deck instead. Shadowbook is the original: re-import never deletes a move and never changes a main
// move; new moves are added (as alternatives where a main move exists), the source's signs, notes and shapes only
// fill fields that are empty here, and every difference is reported.
import { ucisToSanLine } from '../../lib/chess';
import { syncCards } from './cards';
import { childrenOf, newDeck, turnOf } from './deck';
import { enumerateLines } from './lines';
import { deckName, type OpeningMap } from './openings';
import { parsePgn, type ParsedEdge, type ParsedGame } from './pgn';
import type { Color, Deck, DeckSource, Edge, LibraryData } from './types';

export interface DeckImport {
  deck: Deck;
  created: boolean;
  added: number;
  /** Moves that got a sign, note or shapes they did not have. */
  updated: number;
  /** Re-import only: moves the deck has that the source no longer has. */
  missing: string[];
  /** Re-import only: positions where the source's main move is not yours. */
  mainDiffers: string[];
}

export interface ImportResult {
  lib: LibraryData;
  decks: DeckImport[];
  /** Chapters from a custom position, which a deck cannot hold. */
  skipped: number;
  /** Chapters without a single readable move. */
  empty: number;
  nullMoves: number;
  illegal: number;
  /** What to write: the decks touched (with all their edges) and the card changes. */
  write: { decks: Deck[]; edges: { deckId: string; edges: Edge[] }[]; cardsAdded: LibraryData['cards']; cardsRemoved: string[] };
}

const sameSource = (a: DeckSource, b: DeckSource) =>
  a.kind === 'lichess' && b.kind === 'lichess' && a.studyId === b.studyId && !!a.chapterId && a.chapterId === b.chapterId;

const fill = <T extends string | unknown[]>(ours: T | undefined, theirs: T | undefined) => (ours?.length ? ours : theirs);

/** The SAN line to every position of a deck, along the first line that reaches it. */
function pathsTo(edges: Edge[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const line of enumerateLines(edges)) line.forEach((e, i) => out.has(e.from) || out.set(e.from, line.slice(0, i).map((x) => x.uci)));
  return out;
}

function merge(deck: Deck, edges: Edge[], game: ParsedGame, now: Date): { deck: Deck; edges: Edge[]; added: number; updated: number; missing: string[]; mainDiffers: string[] } {
  const out = [...edges];
  const index = new Map(out.map((e, i) => [`${e.from}|${e.uci}`, i]));
  let added = 0;
  let updated = 0;
  const parsedKeys = new Set(game.edges.map((e) => `${e.from}|${e.uci}`));
  const nextRank = new Map<string, number>();
  for (const e of out) nextRank.set(e.from, Math.max(nextRank.get(e.from) ?? 0, e.rank + 1));
  for (const p of [...game.edges].sort((a, b) => a.rank - b.rank)) {
    const i = index.get(`${p.from}|${p.uci}`);
    if (i === undefined) {
      const rank = nextRank.get(p.from) ?? 0;
      nextRank.set(p.from, rank + 1);
      index.set(`${p.from}|${p.uci}`, out.length);
      out.push({ ...p, deckId: deck.id, mine: turnOf(p.from) === deck.color, rank });
      added++;
      continue;
    }
    // Ours win: the source only fills a sign, note or shapes that are empty here.
    const cur = out[i];
    const next = { ...cur, glyph: cur.glyph ?? p.glyph, comment: fill(cur.comment, p.comment), shapes: fill(cur.shapes, p.shapes), nags: fill(cur.nags, p.nags) };
    if (JSON.stringify(next) !== JSON.stringify(cur)) {
      out[i] = next;
      updated++;
    }
  }
  const paths = pathsTo(out);
  const say = (from: string, uci: string) => ucisToSanLine([...(paths.get(from) ?? []), uci]);
  const missing = edges.filter((e) => !parsedKeys.has(`${e.from}|${e.uci}`)).map((e) => say(e.from, e.uci));
  const theirs = childrenOf(game.edges);
  const ours = childrenOf(edges);
  const mainDiffers: string[] = [];
  for (const [from, list] of ours) {
    const mine = list.find((e) => e.mine);
    const main = theirs.get(from)?.[0];
    if (mine && main && turnOf(from) === deck.color && main.uci !== mine.uci) {
      mainDiffers.push(`${say(from, mine.uci)}: the study plays ${say(from, main.uci).split(' ').pop()} instead`);
    }
  }
  return { deck: { ...deck, intro: deck.intro || game.intro, updatedAt: now.toISOString() }, edges: out, added, updated, missing, mainDiffers };
}

export interface ImportOptions {
  /** Colour for games without an Orientation tag. */
  color: Color;
  /** Where each game comes from; decides whether it updates an existing deck. */
  source(game: ParsedGame): DeckSource;
  openings: OpeningMap;
  now?: Date;
}

export function importText(lib: LibraryData, text: string, opts: ImportOptions): ImportResult {
  const now = opts.now ?? new Date();
  const games = parsePgn(text);
  const decks = [...lib.decks];
  const edgesByDeck = new Map<string, Edge[]>();
  for (const e of lib.edges) edgesByDeck.set(e.deckId, [...(edgesByDeck.get(e.deckId) ?? []), e]);
  const results: DeckImport[] = [];
  const touched = new Set<string>();
  let skipped = 0;
  let empty = 0;
  let nullMoves = 0;
  let illegal = 0;
  for (const game of games) {
    nullMoves += game.skipped.nullMoves;
    illegal += game.skipped.illegal;
    if (!game.fromStart) {
      skipped++;
      continue;
    }
    if (!game.edges.length) {
      empty++;
      continue;
    }
    const color = game.orientation ?? opts.color;
    const source = opts.source(game);
    const at = decks.findIndex((d) => d.color === color && sameSource(d.source, source));
    if (at >= 0) {
      const m = merge(decks[at], edgesByDeck.get(decks[at].id) ?? [], game, now);
      decks[at] = m.deck;
      edgesByDeck.set(m.deck.id, m.edges);
      touched.add(m.deck.id);
      results.push({ deck: m.deck, created: false, added: m.added, updated: m.updated, missing: m.missing, mainDiffers: m.mainDiffers });
      continue;
    }
    // One millisecond apart, so the decks keep the order of the chapters.
    const deck = newDeck({ name: deckName(game, opts.openings, color), color, source, intro: game.intro }, new Date(now.getTime() + results.length));
    const edges = game.edges.map((p: ParsedEdge): Edge => ({ ...p, deckId: deck.id, mine: turnOf(p.from) === color }));
    decks.push(deck);
    edgesByDeck.set(deck.id, edges);
    touched.add(deck.id);
    results.push({ deck, created: true, added: edges.length, updated: 0, missing: [], mainDiffers: [] });
  }
  const edges = [...edgesByDeck.values()].flat();
  const synced = syncCards(decks, edges, lib.cards, now);
  return {
    lib: { decks, edges, cards: synced.cards },
    decks: results,
    skipped,
    empty,
    nullMoves,
    illegal,
    write: {
      decks: decks.filter((d) => touched.has(d.id)),
      edges: [...touched].map((id) => ({ deckId: id, edges: edgesByDeck.get(id) ?? [] })),
      cardsAdded: synced.added,
      cardsRemoved: synced.removed,
    },
  };
}

/** A short report for the person importing. */
export function importMessage(r: ImportResult): string[] {
  const lines: string[] = [];
  const made = r.decks.filter((d) => d.created);
  const again = r.decks.filter((d) => !d.created);
  const n = (k: number, one: string, many = one + 's') => `${k} ${k === 1 ? one : many}`;
  if (made.length) lines.push(`Added ${n(made.length, 'deck')}: ${made.map((d) => d.deck.name).join(', ')}.`);
  for (const d of again) {
    const what = [d.added && `${n(d.added, 'new move')}`, d.updated && `${n(d.updated, 'move')} with new signs or notes`].filter(Boolean).join(', ');
    lines.push(`Updated “${d.deck.name}”: ${what || 'nothing new'}.`);
    for (const m of d.mainDiffers) lines.push(`Main move kept, ${m}.`);
    for (const m of d.missing) lines.push(`Not in the study any more (kept here): ${m}.`);
  }
  if (!r.decks.length) lines.push('Nothing to import: no moves from the normal start position.');
  if (r.skipped) lines.push(`${n(r.skipped, 'chapter')} skipped (custom start position).`);
  if (r.empty) lines.push(`${n(r.empty, 'chapter')} without moves skipped.`);
  if (r.nullMoves) lines.push(`${n(r.nullMoves, 'variation')} cut short at a null move (--).`);
  if (r.illegal) lines.push(`${n(r.illegal, 'unreadable bit', 'unreadable bits')} skipped.`);
  return lines;
}
