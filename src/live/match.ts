import { Chess } from 'chess.js';
import { START_FEN } from '../lib/chess';
import { NAMES, type Finalist, type LiveGame, type Pick } from './types';

/** Who won, by player rather than colour. Null while undecided. */
export function winnerOf(g: { result: LiveGame['result']; white: LiveGame['white']; black: LiveGame['black'] }): Pick | null {
  if (g.result === '1/2-1/2') return 'draw';
  if (g.result === '1-0') return g.white;
  if (g.result === '0-1') return g.black;
  return null;
}

/** Match score; a draw is half a point each. */
export function matchScore(games: LiveGame[]): Record<Finalist, number> {
  const s = { gukesh: 0, sindarov: 0 };
  for (const g of games) {
    if (g.status !== 'finished') continue;
    const w = winnerOf(g);
    if (w === 'draw') {
      s.gukesh += 0.5;
      s.sindarov += 0.5;
    } else if (w) s[w] += 1;
  }
  return s;
}

export const fmtScore = (n: number) => (n % 1 ? `${Math.floor(n) || ''}½` : String(n));

/** Predictions stay open until the game is marked live or its start time passes. */
export function isOpen(g: LiveGame, now = Date.now()): boolean {
  return g.status === 'scheduled' && (!g.starts_at || new Date(g.starts_at).getTime() > now);
}

/** The game people should be predicting next. */
export const nextGame = (games: LiveGame[], now = Date.now()) => games.find((g) => isOpen(g, now)) ?? null;

/** Same scoring as the leaderboard view: 1 point, or 2 when under a third of voters agreed. */
export function pointsFor(pick: Pick, winner: Pick | null, share: number): number {
  if (!winner || pick !== winner) return 0;
  return share < 1 / 3 ? 2 : 1;
}

export function percentages(votes: Partial<Record<Pick, number>>): Record<Pick, number> {
  const total = (votes.gukesh ?? 0) + (votes.draw ?? 0) + (votes.sindarov ?? 0);
  const pct = (n = 0) => (total ? Math.round((100 * n) / total) : 0);
  return { gukesh: pct(votes.gukesh), draw: pct(votes.draw), sindarov: pct(votes.sindarov) };
}

/** SAN moves of a PGN, tolerant of headers, comments and results. */
export function sanMoves(pgn: string): string[] {
  if (!pgn.trim()) return [];
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return [];
  }
  return chess.history();
}

/** "14...e5" for the move that produced ply `ply` (1 = White's first move). */
export function moveLabel(sans: string[], ply: number): string {
  if (ply <= 0 || ply > sans.length) return 'start';
  const n = Math.ceil(ply / 2);
  return ply % 2 ? `${n}.${sans[ply - 1]}` : `${n}...${sans[ply - 1]}`;
}

export function positionAt(sans: string[], ply: number): { fen: string; lastMove?: string } {
  const chess = new Chess(START_FEN);
  let lastMove: string | undefined;
  for (const san of sans.slice(0, Math.max(0, ply))) {
    const m = chess.move(san);
    lastMove = m.from + m.to;
  }
  return { fen: chess.fen(), lastMove };
}

export function countdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const hms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':');
  return d ? `${d}d ${hms}` : hms;
}

/** Each side's clock ([%clk h:mm:ss]) after `ply` half-moves, as broadcast PGNs carry them. */
export function clocksAt(pgn: string, ply: number): { w?: string; b?: string } {
  const body = pgn.replace(/^\[.*\]\s*$/gm, '');
  const out: { w?: string; b?: string } = {};
  let n = 0;
  for (const t of body.match(/\{[^}]*\}|[^\s{}]+/g) ?? []) {
    if (t.startsWith('{')) {
      const clk = t.match(/\[%clk\s+([\d:]+)/);
      if (clk && n > 0 && n <= ply) out[n % 2 ? 'w' : 'b'] = clk[1].replace(/^0:/, '');
    } else if (!/^\d+\.+$|^\d+\.+\S|^(1-0|0-1|1\/2-1\/2|\*)$|^\$\d+$/.test(t)) {
      n++;
    } else if (/^\d+\.+\S/.test(t)) {
      n++; // "12.e4" written without a space
    }
  }
  return out;
}

/** What the Community call column shows: nothing, a lone call, or the shares with the leading call (from 2 calls). */
export type CommunityCall =
  | { kind: 'none' }
  | { kind: 'few'; calls: number }
  | { kind: 'bar'; calls: number; pct: Record<Pick, number>; lead: Pick | 'split' };

export const MIN_CALLS_FOR_BAR = 2;

export function communityCall(votes: Partial<Record<Pick, number>>): CommunityCall {
  const counts: [Pick, number][] = [
    ['gukesh', votes.gukesh ?? 0],
    ['draw', votes.draw ?? 0],
    ['sindarov', votes.sindarov ?? 0],
  ];
  const calls = counts.reduce((n, [, c]) => n + c, 0);
  if (!calls) return { kind: 'none' };
  if (calls < MIN_CALLS_FOR_BAR) return { kind: 'few', calls };
  // Compare raw counts, not rounded percentages: 2–2–1 is a split even though both round to 40%.
  const [first, second] = [...counts].sort((a, b) => b[1] - a[1]);
  return { kind: 'bar', calls, pct: percentages(votes), lead: first[1] === second[1] ? 'split' : first[0] };
}

/** The ply a board key moves to (Left/Right one move, Home/End to the ends), or undefined for any other key. */
export function stepKey(key: string, ply: number, last: number): number | undefined {
  if (key === 'ArrowLeft') return Math.max(0, ply - 1);
  if (key === 'ArrowRight') return Math.min(last, ply + 1);
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  return undefined;
}

/** The call's text, always with the number of calls: "Draw · 2 calls", "Split · 4 calls", "1 call". */
export function callLabel(c: CommunityCall): string {
  if (c.kind === 'none') return '–';
  const n = `${c.calls} ${c.calls === 1 ? 'call' : 'calls'}`;
  if (c.kind === 'few') return n;
  return `${c.lead === 'split' ? 'Split' : c.lead === 'draw' ? 'Draw' : NAMES[c.lead]} · ${n}`;
}
