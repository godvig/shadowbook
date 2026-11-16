// Decks built from the user's own games: what they actually play, counted per position, cut by minimum counts and
// grouped by opening family. Pure; the games are fetched in the browser by src/lib/sources.ts and only these
// counts are kept. Building again updates the same decks by the import rules: nothing is deleted and a main move
// is never changed; a move played more often now becomes an alternative and is reported.
import { Chess } from 'chess.js';
import { fenKey, playUci, START_FEN } from '../../lib/chess';
import type { Game, TimeClass } from '../../lib/types';
import { syncCards } from './cards';
import { newDeck, START_KEY, turnOf } from './deck';
import { mergeEdges, type MainDiffers } from './importer';
import type { OpeningMap } from './openings';
import type { ParsedEdge } from './pgn';
import type { Color, Deck, Edge, LibraryData } from './types';

export const LIMITS = {
  /** Own moves besides the most played one: at least this share of the games from the position, and this many games. */
  altShare: 0.2,
  altGames: 3,
  /** Opponent replies: at least this share and this many games, at most `replies` of them. */
  replyShare: 0.05,
  replyGames: 3,
  replies: 4,
  /** In full moves. */
  depth: 10,
  /** A position is followed only when at least this many games reach it. */
  reach: 3,
  /** An opening family gets its own deck with this many games and this share of the colour's games. */
  deckGames: 10,
  deckShare: 0.05,
  /**
   * While "Other lines" holds more than this share of the colour's games, its biggest family gets a deck of its
   * own, down to families of `deckGamesMin` games.
   */
  otherShare: 0.25,
  deckGamesMin: 5,
};

/** Which games are read by default: the newest `games` of the chosen time classes, at most `months` back. */
export const PICK = { games: 500, months: 36 };

export type GamesSite = 'chesscom' | 'lichess';

export interface MoveStat {
  games: number;
  /** The user's points in those games: 1 a win, ½ a draw. */
  points: number;
}

export interface BuiltDeck {
  color: Color;
  /** The opening family ("Sicilian Defense"), or "" for the other lines. */
  opening: string;
  /** From the user's side: the family name for their own system, "vs …" for the opponent's. */
  name: string;
  games: number;
  points: number;
  edges: ParsedEdge[];
  /** Per kept move, keyed `${from}|${uci}`. */
  stats: Map<string, MoveStat>;
}

const userColor = (g: Game, username: string): Color | null => {
  const u = username.trim().toLowerCase();
  return g.white.toLowerCase() === u ? 'w' : g.black.toLowerCase() === u ? 'b' : null;
};

const pointsFor = (g: Game, c: Color): number | null =>
  g.result === '1/2-1/2' ? 0.5 : g.result === '1-0' ? Number(c === 'w') : g.result === '0-1' ? Number(c === 'b') : null;

/** "Rapport-Jobava System, with e6" and "Sicilian Defense: Najdorf" belong to "Rapport-Jobava System" and "Sicilian Defense". */
export const family = (name: string) => name.split(/[:,]/)[0].trim();

/** The user's games inside the window, newest first, and how many there are of each time class (most first). */
export function gamesInWindow(games: Game[], username: string, months = PICK.months, now = new Date()) {
  const since = new Date(now);
  since.setMonth(since.getMonth() - months);
  const inside = games.filter((g) => userColor(g, username) && g.end >= since.getTime()).sort((a, b) => b.end - a.end);
  const counts = new Map<TimeClass, number>();
  for (const g of inside) counts.set(g.timeClass, (counts.get(g.timeClass) ?? 0) + 1);
  return { games: inside, counts: [...counts].sort((a, b) => b[1] - a[1]) };
}

/** The newest `max` games of the chosen time classes, from games already sorted newest first. */
export const pickGames = (newestFirst: Game[], classes: TimeClass[], max = PICK.games) => newestFirst.filter((g) => classes.includes(g.timeClass)).slice(0, max);

interface Ply {
  from: string;
  uci: string;
  san: string;
  to: string;
  toFen: string;
}

function replay(ucis: string[], plies: number): Ply[] {
  const chess = new Chess(START_FEN);
  const out: Ply[] = [];
  for (const uci of ucis.slice(0, plies)) {
    const from = fenKey(chess.fen());
    let san: string;
    try {
      san = playUci(chess, uci).san;
    } catch {
      break;
    }
    out.push({ from, uci, san, to: fenKey(chess.fen()), toFen: chess.fen() });
  }
  return out;
}

interface Sample {
  plies: Ply[];
  points: number;
}

/** Counts every position the games reach, then keeps what passes the limits, walking from the start. */
function grow(sample: Sample[], color: Color): { edges: ParsedEdge[]; stats: Map<string, MoveStat> } {
  const at = new Map<string, { games: number; moves: Map<string, MoveStat & { ply: Ply }> }>();
  for (const g of sample) {
    // A game that comes back to a position counts there once.
    const seen = new Set<string>();
    for (const p of g.plies) {
      if (seen.has(p.from)) continue;
      seen.add(p.from);
      const pos = at.get(p.from) ?? { games: 0, moves: new Map() };
      pos.games++;
      const m = pos.moves.get(p.uci) ?? { games: 0, points: 0, ply: p };
      m.games++;
      m.points += g.points;
      pos.moves.set(p.uci, m);
      at.set(p.from, pos);
    }
  }
  const edges: ParsedEdge[] = [];
  const stats = new Map<string, MoveStat>();
  // Positions reached by transposition are expanded once, like lines.
  const expanded = new Set<string>();
  const walk = (key: string, ply: number) => {
    const pos = at.get(key);
    if (!pos || pos.games < LIMITS.reach || ply >= LIMITS.depth * 2 || expanded.has(key)) return;
    expanded.add(key);
    // Most played first; a tie goes to the better score, then to the move itself so the result is stable.
    const list = [...pos.moves.values()].sort((a, b) => b.games - a.games || b.points - a.points || (a.ply.uci < b.ply.uci ? -1 : 1));
    const share = (m: MoveStat) => m.games / pos.games;
    const keep =
      turnOf(key) === color
        ? list.filter((m, i) => i === 0 || (m.games >= LIMITS.altGames && share(m) >= LIMITS.altShare))
        : // A reply is only worth keeping when there is room left for your answer to it.
          ply + 1 < LIMITS.depth * 2
          ? list.filter((m) => m.games >= LIMITS.replyGames && share(m) >= LIMITS.replyShare).slice(0, LIMITS.replies)
          : [];
    keep.forEach((m, rank) => {
      const { from, uci, san, to, toFen } = m.ply;
      edges.push({ from, uci, san, to, toFen, rank });
      stats.set(`${from}|${uci}`, { games: m.games, points: m.points });
    });
    for (const m of keep) walk(m.ply.to, ply + 1);
  };
  walk(START_KEY, 0);
  return { edges, stats };
}

/** Decks for one colour: one per opening family with enough games, and one for the other lines. */
export function buildDecks(games: Game[], opts: { username: string; color: Color; openings: OpeningMap }): BuiltDeck[] {
  const mine: (Sample & { opening: string; theirs: boolean })[] = [];
  for (const g of games) {
    if (userColor(g, opts.username) !== opts.color) continue;
    const points = pointsFor(g, opts.color);
    if (points === null) continue;
    const plies = replay(g.ucis, LIMITS.depth * 2);
    if (!plies.length) continue;
    // The family, and whether the opponent's move is the one that entered it (1.d4 e5 is Black's Englund Gambit).
    let opening = '';
    let theirs = false;
    for (const p of plies) {
      const named = opts.openings[p.to];
      if (!named || family(named[1]) === opening) continue;
      opening = family(named[1]);
      theirs = turnOf(p.from) !== opts.color;
    }
    mine.push({ plies, points, opening, theirs });
  }
  const groups = new Map<string, typeof mine>();
  for (const s of mine) groups.set(s.opening, [...(groups.get(s.opening) ?? []), s]);
  const named: [string, typeof mine][] = [];
  const other: typeof mine = [];
  const rest: [string, typeof mine][] = [];
  for (const [opening, list] of groups) {
    if (opening && list.length >= LIMITS.deckGames && list.length >= LIMITS.deckShare * mine.length) named.push([opening, list]);
    else if (opening) rest.push([opening, list]);
    else other.push(...list);
  }
  // A big "Other lines" says little, so its biggest families move out while they have enough games.
  rest.sort((a, b) => b[1].length - a[1].length);
  let otherSize = other.length + rest.reduce((s, [, l]) => s + l.length, 0);
  for (const [opening, list] of rest) {
    if (otherSize > LIMITS.otherShare * mine.length && list.length >= LIMITS.deckGamesMin) {
      named.push([opening, list]);
      otherSize -= list.length;
    } else other.push(...list);
  }
  named.sort((a, b) => b[1].length - a[1].length);
  const out: BuiltDeck[] = [];
  for (const [opening, list] of [...named, ['', other] as [string, typeof mine]]) {
    if (list.length < LIMITS.reach) continue;
    const { edges, stats } = grow(list, opts.color);
    if (!edges.some((e) => turnOf(e.from) === opts.color)) continue;
    out.push({
      color: opts.color,
      opening,
      name: !opening ? `Other lines as ${opts.color === 'w' ? 'White' : 'Black'}` : againstThem(opening, list, opts.color) ? `vs ${opening}` : opening,
      games: list.length,
      points: list.reduce((s, x) => s + x.points, 0),
      edges,
      stats,
    });
  }
  return out;
}

/**
 * Whether a family is the opponent's opening. A defence is always Black's, even when White's move entered it
 * (1.d4 e6 2.e4 is a French); otherwise it belongs to whoever played the move that entered it in most games.
 */
function againstThem(opening: string, list: { theirs: boolean }[], color: Color): boolean {
  if (/\b(Defen[cs]e|Countergambit)\b/.test(opening)) return color === 'w';
  return list.filter((s) => s.theirs).length * 2 > list.length;
}

export interface PlannedDeck {
  built: BuiltDeck;
  deck: Deck;
  /** False when it updates a deck built before from the same games source and opening. */
  isNew: boolean;
  edges: Edge[];
  added: number;
  /** Positions where you now play another move more often than your main move. That move is now an alternative. */
  mainDiffers: MainDiffers[];
}

/** What saving would do, for the preview. Nothing is written. */
export function planBuild(lib: LibraryData, built: BuiltDeck[], src: { site: GamesSite; username: string }, now = new Date()): PlannedDeck[] {
  const username = src.username.trim();
  return built.map((b, i) => {
    const source = { kind: 'games' as const, site: src.site, username, builtAt: now.toISOString(), opening: b.opening };
    const existing = lib.decks.find(
      (d) => d.color === b.color && d.source.kind === 'games' && d.source.site === src.site && d.source.username.toLowerCase() === username.toLowerCase() && d.source.opening === b.opening,
    );
    if (!existing) {
      // One millisecond apart, so the decks keep this order.
      const deck = newDeck({ name: b.name, color: b.color, source }, new Date(now.getTime() + i));
      return { built: b, deck, isNew: true, edges: b.edges.map((e) => ({ ...e, deckId: deck.id, mine: turnOf(e.from) === b.color })), added: b.edges.length, mainDiffers: [] };
    }
    const m = mergeEdges({ ...existing, source }, lib.edges.filter((e) => e.deckId === existing.id), { edges: b.edges }, now);
    return { built: b, deck: m.deck, isNew: false, edges: m.edges, added: m.added, mainDiffers: m.mainDiffers };
  });
}

/** The library after saving the chosen decks (built from games, or any new deck), and what to write. */
export function commitBuild(lib: LibraryData, planned: Pick<PlannedDeck, 'deck' | 'edges' | 'isNew'>[], now = new Date()) {
  const ids = new Set(planned.map((p) => p.deck.id));
  const decks = [...lib.decks.map((d) => planned.find((p) => p.deck.id === d.id)?.deck ?? d), ...planned.filter((p) => p.isNew).map((p) => p.deck)];
  const edges = [...lib.edges.filter((e) => !ids.has(e.deckId)), ...planned.flatMap((p) => p.edges)];
  const synced = syncCards(decks, edges, lib.cards, now);
  return {
    lib: { decks, edges, cards: synced.cards },
    write: { decks: planned.map((p) => p.deck), edges: planned.map((p) => ({ deckId: p.deck.id, edges: p.edges })), cards: synced.added, deleteCards: synced.removed },
  };
}
