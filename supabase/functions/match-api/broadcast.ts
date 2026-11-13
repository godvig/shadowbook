// Pure helpers for syncing the match from a Lichess broadcast. No Deno or network code here,
// so the same file runs in the Edge Function and in the Vitest suite.

export type Finalist = 'gukesh' | 'sindarov';

export interface BroadcastRound {
  id: string;
  name: string;
  startsAt?: number;
  ongoing?: boolean;
  finishedAt?: number;
  finished?: boolean;
}

export interface DbGame {
  id: number;
  status: 'scheduled' | 'live' | 'finished';
  starts_at: string | null;
  pgn: string;
  result: string | null;
}

export interface GamePatch {
  white?: Finalist;
  black?: Finalist;
  status?: 'live' | 'finished';
  result?: '1-0' | '0-1' | '1/2-1/2';
  opening?: string;
  pgn?: string;
}

/** Accepts a broadcast tour URL (lichess.org/broadcast/<slug>/<id>) or a bare 8-character id. */
export function parseBroadcastId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9]{8}$/.test(s)) return s;
  try {
    const url = new URL(s);
    if (!/(^|\.)lichess\.org$/.test(url.hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'broadcast' || parts.length !== 3) return null; // tour pages have exactly /broadcast/<slug>/<id>
    return /^[A-Za-z0-9]{8}$/.test(parts[2]) ? parts[2] : null;
  } catch {
    return null;
  }
}

/** "Game 3", "Round 3", "R3" → 3. Tiebreaks and rapid/blitz rounds are not classical games of the match. */
export function gameNumber(roundName: string): number | null {
  if (/tie|armageddon|rapid|blitz|playoff/i.test(roundName)) return null;
  const m = roundName.match(/\d+/);
  const n = m ? Number(m[0]) : NaN;
  return n >= 1 && n <= 14 ? n : null;
}

export function splitPgn(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n(?=\[)/)
    .map((g) => g.trim())
    .filter((g) => g.startsWith('['));
}

export function pgnHeaders(pgn: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of pgn.matchAll(/^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm)) out[m[1]] = m[2].replace(/\\"/g, '"');
  return out;
}

export function finalist(name: string | undefined): Finalist | null {
  if (!name) return null;
  if (/gukesh/i.test(name)) return 'gukesh';
  if (/sindarov/i.test(name)) return 'sindarov';
  return null;
}

/** True when the movetext holds at least one move. */
export function hasMoves(pgn: string): boolean {
  const body = pgn.replace(/^\[.*\]\s*$/gm, '').replace(/\{[^}]*\}/g, '');
  return /\b1\.\s*[a-hKQRBNO]/.test(body);
}

/** The match game in a round's PGN: the one between the two finalists. */
export function matchGameFrom(roundPgn: string): string | null {
  return (
    splitPgn(roundPgn).find((g) => {
      const h = pgnHeaders(g);
      const w = finalist(h.White);
      const b = finalist(h.Black);
      return w && b && w !== b;
    }) ?? null
  );
}

export function patchFromPgn(pgn: string): GamePatch {
  const h = pgnHeaders(pgn);
  const patch: GamePatch = { pgn };
  const w = finalist(h.White);
  const b = finalist(h.Black);
  if (w && b && w !== b) {
    patch.white = w;
    patch.black = b;
  }
  if (h.Opening && h.Opening !== '?') patch.opening = h.Opening;
  if (h.Result === '1-0' || h.Result === '0-1' || h.Result === '1/2-1/2') {
    patch.result = h.Result;
    patch.status = 'finished';
  } else if (hasMoves(pgn)) {
    patch.status = 'live';
  }
  return patch;
}

export interface SyncStep {
  gameId: number;
  roundId: string;
  /** New start time to store, when the broadcast knows it and the db differs. */
  startsAt?: string;
  /** Fetch this round's PGN. */
  fetchPgn: boolean;
}

/**
 * Decide what to do for each round. Rounds that have started (or are ongoing) get their PGN fetched,
 * unless the game is already finished in the db and the round finished more than an hour ago.
 */
export function planSync(rounds: BroadcastRound[], games: DbGame[], now: number): SyncStep[] {
  const steps: SyncStep[] = [];
  const seen = new Set<number>();
  for (const r of rounds) {
    const n = gameNumber(r.name);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    const g = games.find((x) => x.id === n);
    if (!g) continue;
    const step: SyncStep = { gameId: n, roundId: r.id, fetchPgn: false };
    if (r.startsAt && g.status === 'scheduled') {
      const iso = new Date(r.startsAt).toISOString();
      if (!g.starts_at || new Date(g.starts_at).getTime() !== r.startsAt) step.startsAt = iso;
    }
    const finishedAt = r.finishedAt ?? (r.finished ? now : undefined);
    const started = r.ongoing || !!finishedAt || (r.startsAt !== undefined && r.startsAt <= now);
    const settled = g.status === 'finished' && finishedAt !== undefined && now - finishedAt > 60 * 60_000;
    step.fetchPgn = started && !settled;
    if (step.startsAt || step.fetchPgn) steps.push(step);
  }
  return steps;
}
