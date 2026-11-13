import { Chess } from 'chess.js';
import { START_FEN } from '../lib/chess';
import type { Finalist, LiveGame, Pick } from './types';

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
