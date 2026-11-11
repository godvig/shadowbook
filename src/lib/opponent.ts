import { buildBook, type PlayerBook } from './book';
import { demoGames, DEMO_USERNAME } from './demo';
import { fetchChessCom, fetchLichess, type FetchOptions } from './sources';
import { loadPlayer, savePlayer } from './storage';
import type { Game, Site, TimeClass } from './types';

/** A scouted player: their games and the opening book built from them. */
export interface Opponent {
  site: Site;
  username: string;
  games: Game[];
  book: PlayerBook;
  timeClasses: TimeClass[] | null;
  fetchedAt: number;
}

const FRESH_MS = 6 * 60 * 60 * 1000;

export function makeOpponent(site: Site, username: string, games: Game[], fetchedAt = Date.now()): Opponent {
  // Use the spelling the site uses, e.g. "Wille350" even if typed "wille350".
  const lower = username.toLowerCase();
  const sample = games.find((g) => g.white.toLowerCase() === lower || g.black.toLowerCase() === lower);
  const name = sample ? (sample.white.toLowerCase() === lower ? sample.white : sample.black) : username;
  return { site, username: name, games, book: buildBook(games, name), timeClasses: null, fetchedAt };
}

export function withTimeClasses(o: Opponent, timeClasses: TimeClass[] | null): Opponent {
  return { ...o, timeClasses, book: buildBook(o.games, o.username, timeClasses ?? undefined) };
}

export function demoOpponent(): Opponent {
  return makeOpponent('demo', DEMO_USERNAME, demoGames());
}

export async function scout(site: 'chess.com' | 'lichess', username: string, opts: FetchOptions & { refresh?: boolean } = {}): Promise<Opponent> {
  const cached = await loadPlayer(site, username);
  if (cached && !opts.refresh && Date.now() - cached.fetchedAt < FRESH_MS) {
    return makeOpponent(site, cached.username, cached.games, cached.fetchedAt);
  }
  const games = site === 'chess.com' ? await fetchChessCom(username, opts) : await fetchLichess(username, opts);
  const opponent = makeOpponent(site, username, games);
  await savePlayer({ site, username: opponent.username, fetchedAt: opponent.fetchedAt, games });
  return opponent;
}

export function ratingFor(o: Opponent): number {
  const r = o.book.ratings;
  const pref: TimeClass[] = o.timeClasses ?? ['rapid', 'blitz', 'classical', 'bullet', 'daily'];
  for (const tc of pref) if (r[tc]) return r[tc]!;
  const any = Object.values(r)[0];
  return any ?? 1500;
}
