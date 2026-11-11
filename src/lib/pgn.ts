import type { Result, TimeClass } from './types';

export function pgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const m of pgn.matchAll(/^\[(\w+)\s+"([^"]*)"\]/gm)) headers[m[1]] = m[2];
  return headers;
}

/** Extracts main-line SAN moves, ignoring comments, variations, NAGs and move numbers. */
export function pgnSans(pgn: string): string[] {
  const body = pgn
    .replace(/^\[.*\]\s*$/gm, '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ');
  let depth = 0;
  let clean = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) clean += ch;
  }
  return clean
    .split(/\s+/)
    .map((t) => t.replace(/^\d+\.+/, '').replace(/[!?]+$/, ''))
    .filter((t) => t && !/^\$\d+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}

/** Splits a multi-game PGN file into single games. */
export function splitPgn(text: string): string[] {
  return text.split(/(?=^\[Event\s)/m).map((s) => s.trim()).filter(Boolean);
}

export function toResult(s: string | undefined): Result {
  return s === '1-0' || s === '0-1' || s === '1/2-1/2' ? s : '*';
}

/** Classifies a PGN TimeControl tag ("600+5", "1/86400") like the big sites do. */
export function timeClassFromControl(tc: string | undefined): TimeClass {
  if (!tc || tc === '-' || tc === '?') return 'unknown';
  if (tc.includes('/')) return 'daily';
  const [base, inc] = tc.split('+').map(Number);
  if (!Number.isFinite(base)) return 'unknown';
  const estimate = base + 40 * (inc || 0);
  if (estimate < 180) return 'bullet';
  if (estimate < 600) return 'blitz';
  if (estimate < 1800) return 'rapid';
  return 'classical';
}
