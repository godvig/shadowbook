import { BOOK_PLIES } from './book';
import { sansToUcis } from './chess';
import { pgnHeaders, pgnSans, splitPgn, timeClassFromControl, toResult } from './pgn';
import type { Game, TimeClass } from './types';

/** Only the opening matters for sparring, so games are stored truncated. */
const KEEP_PLIES = BOOK_PLIES + 16;

export class SourceError extends Error {
  constructor(
    message: string,
    readonly kind: 'not-found' | 'network' | 'empty' | 'other',
  ) {
    super(message);
  }
}

export interface FetchOptions {
  onProgress?: (msg: string) => void;
  signal?: AbortSignal;
  /** How many months of chess.com archives to read (newest first). */
  months?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { signal });
    } catch (e) {
      if (signal?.aborted) throw e;
      if (attempt === 2) throw new SourceError('Could not reach the server. Check your connection, or upload a PGN file instead.', 'network');
      await sleep(800 * (attempt + 1));
      continue;
    }
    if (res.status === 404) throw new SourceError('No player with that username was found.', 'not-found');
    if (res.status === 429) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new SourceError(`The server answered ${res.status}.`, 'other');
    return (await res.json()) as T;
  }
  throw new SourceError('The server is busy. Try again in a minute.', 'network');
}

interface ChessComPlayer {
  username: string;
  rating?: number;
}
interface ChessComGame {
  url?: string;
  uuid?: string;
  pgn?: string;
  rules?: string;
  time_class?: string;
  end_time?: number;
  white: ChessComPlayer;
  black: ChessComPlayer;
}

const CC_CLASSES: Record<string, TimeClass> = { bullet: 'bullet', blitz: 'blitz', rapid: 'rapid', daily: 'daily' };

export function gameFromChessCom(j: ChessComGame): Game | null {
  if ((j.rules && j.rules !== 'chess') || !j.pgn) return null;
  const h = pgnHeaders(j.pgn);
  if (h.SetUp === '1') return null;
  return {
    id: j.url ?? j.uuid ?? `${j.white.username}-${j.black.username}-${j.end_time}`,
    white: j.white.username,
    black: j.black.username,
    whiteElo: j.white.rating,
    blackElo: j.black.rating,
    result: toResult(h.Result),
    timeClass: CC_CLASSES[j.time_class ?? ''] ?? timeClassFromControl(h.TimeControl),
    end: (j.end_time ?? 0) * 1000,
    ucis: sansToUcis(pgnSans(j.pgn), KEEP_PLIES),
  };
}

/** Reads the newest `months` monthly archives from the chess.com Published-Data API. */
export async function fetchChessCom(username: string, opts: FetchOptions = {}): Promise<Game[]> {
  const user = encodeURIComponent(username.trim().toLowerCase());
  opts.onProgress?.('Looking up the player on chess.com…');
  const { archives } = await fetchJson<{ archives: string[] }>(`https://api.chess.com/pub/player/${user}/games/archives`, opts.signal);
  if (!archives.length) throw new SourceError('This player has no public games on chess.com.', 'empty');
  const recent = archives.slice(-(opts.months ?? 18)).reverse();
  const games: Game[] = [];
  for (let i = 0; i < recent.length; i++) {
    opts.onProgress?.(`Reading ${recent[i].slice(-7)} (${i + 1}/${recent.length}) – ${games.length} games so far`);
    const { games: month } = await fetchJson<{ games: ChessComGame[] }>(recent[i], opts.signal);
    for (const j of month) {
      const g = gameFromChessCom(j);
      if (g) games.push(g);
    }
  }
  if (!games.length) throw new SourceError('No standard chess games found for this player.', 'empty');
  return games;
}

interface LichessGame {
  id: string;
  variant: string;
  speed: string;
  lastMoveAt?: number;
  winner?: 'white' | 'black';
  status: string;
  moves?: string;
  initialFen?: string;
  players: Record<'white' | 'black', { user?: { name: string }; rating?: number }>;
}

const LI_CLASSES: Record<string, TimeClass> = {
  ultraBullet: 'bullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'daily',
};

export function gameFromLichess(j: LichessGame): Game | null {
  if (j.variant !== 'standard' || j.initialFen || !j.moves) return null;
  const unfinished = ['created', 'started', 'aborted', 'unknownFinish'].includes(j.status);
  return {
    id: `lichess:${j.id}`,
    white: j.players.white.user?.name ?? 'Anonymous',
    black: j.players.black.user?.name ?? 'Anonymous',
    whiteElo: j.players.white.rating,
    blackElo: j.players.black.rating,
    result: unfinished ? '*' : j.winner === 'white' ? '1-0' : j.winner === 'black' ? '0-1' : '1/2-1/2',
    timeClass: LI_CLASSES[j.speed] ?? 'unknown',
    end: j.lastMoveAt ?? 0,
    ucis: sansToUcis(j.moves.split(' '), KEEP_PLIES),
  };
}

/** Streams up to `max` games from the Lichess export API (no token needed). */
export async function fetchLichess(username: string, opts: FetchOptions & { max?: number } = {}): Promise<Game[]> {
  const user = encodeURIComponent(username.trim());
  opts.onProgress?.('Downloading games from Lichess…');
  let res: Response;
  try {
    res = await fetch(`https://lichess.org/api/games/user/${user}?max=${opts.max ?? 800}&moves=true&clocks=false&evals=false&opening=false`, {
      headers: { Accept: 'application/x-ndjson' },
      signal: opts.signal,
    });
  } catch {
    throw new SourceError('Could not reach Lichess. Check your connection, or upload a PGN file instead.', 'network');
  }
  if (res.status === 404) throw new SourceError('No player with that username was found on Lichess.', 'not-found');
  if (!res.ok) throw new SourceError(`Lichess answered ${res.status}.`, 'other');
  const games: Game[] = [];
  for (const line of (await res.text()).split('\n')) {
    if (!line.trim()) continue;
    const g = gameFromLichess(JSON.parse(line) as LichessGame);
    if (g) games.push(g);
  }
  if (!games.length) throw new SourceError('No standard chess games found for this player.', 'empty');
  return games;
}

/** Parses a PGN file (e.g. an export from any site). */
export function gamesFromPgn(text: string): Game[] {
  const games: Game[] = [];
  splitPgn(text).forEach((pgn, i) => {
    const h = pgnHeaders(pgn);
    if (!h.White || !h.Black || h.SetUp === '1') return;
    const date = (h.UTCDate ?? h.EndDate ?? h.Date ?? '').replace(/\./g, '-');
    const url = h.Link ?? (h.Site?.startsWith('http') ? h.Site : undefined);
    games.push({
      id: url ?? `pgn:${i}:${h.White}:${h.Black}:${date}`,
      white: h.White,
      black: h.Black,
      whiteElo: Number(h.WhiteElo) || undefined,
      blackElo: Number(h.BlackElo) || undefined,
      result: toResult(h.Result),
      timeClass: timeClassFromControl(h.TimeControl),
      end: Date.parse(date) || 0,
      ucis: sansToUcis(pgnSans(pgn), KEEP_PLIES),
    });
  });
  return games;
}

/** The username that appears in most games of a PGN file – usually the file's owner. */
export function mostFrequentPlayer(games: Game[]): string | null {
  const counts = new Map<string, number>();
  for (const g of games) {
    for (const p of [g.white, g.black]) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let best: string | null = null;
  let max = 0;
  for (const [p, n] of counts) if (n > max) [best, max] = [p, n];
  return best;
}
