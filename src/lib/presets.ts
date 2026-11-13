import { Chess } from 'chess.js';
import { bookMoves, type PlayerBook } from './book';
import { playUci, sansToUcis } from './chess';
import { makeOpponent, type Opponent } from './opponent';
import { pgnSans } from './pgn';
import type { Color, Game, Result } from './types';

/**
 * Preset sparring partners for the 2026 World Championship: the classical over-the-board games
 * of each finalist, built by scripts/build-presets.mjs from Lichess broadcasts and served as JSON.
 */
export type PresetId = 'gukesh' | 'sindarov';
export const PRESET_IDS: PresetId[] = ['gukesh', 'sindarov'];

/** Elite players' preparation runs deep, so their book does too (scouted players: BOOK_PLIES). */
export const PRESET_BOOK_PLIES = 32;
/** "Spar this opening" starts at most this many plies into a match game. */
export const SPAR_START_CAP = 20;

export interface PresetMeta {
  /** The name used in the games, e.g. "Gukesh D". */
  name: string;
  /** Short name for the UI, e.g. "Gukesh". */
  display: string;
  fideId: number;
  games: number;
  asWhite: number;
  asBlack: number;
  sources: { name: string; url: string; date: string; games: number }[];
  credit: string;
  generatedAt: string;
}

export interface PresetFile {
  meta: PresetMeta;
  games: Game[];
}

/** A game of this match as stored by the live hub (the Supabase `games` table). */
export interface MatchGame {
  id: number;
  white: PresetId | null;
  black: PresetId | null;
  status: string;
  result: Result | null;
  starts_at: string | null;
  pgn: string;
}

export interface PresetInfo {
  id: PresetId;
  meta: PresetMeta;
  /** Finished games of this match merged into the book. */
  matchGames: number;
}

/** Finished match games with moves, as Games of the preset player (the opponent is named by their short name). */
export function matchGamesFor(id: PresetId, meta: PresetMeta, games: MatchGame[]): Game[] {
  const short: Record<PresetId, string> = { gukesh: 'Gukesh', sindarov: 'Sindarov' };
  const name = (p: PresetId | null) => (p === id ? meta.name : p ? short[p] : '?');
  return games
    .filter((g) => g.status === 'finished' && g.pgn && (g.white === id || g.black === id))
    .map((g) => ({
      id: `wcc2026:${g.id}`,
      white: name(g.white),
      black: name(g.black),
      result: g.result ?? '*',
      timeClass: 'classical' as const,
      end: (g.starts_at && Date.parse(g.starts_at)) || 0,
      ucis: sansToUcis(pgnSans(g.pgn), PRESET_BOOK_PLIES + 8),
    }))
    .filter((g) => g.ucis.length > 0);
}

export function presetOpponent(id: PresetId, file: PresetFile, match: MatchGame[] = []): Opponent {
  const extra = matchGamesFor(id, file.meta, match);
  const games = [...file.games, ...extra];
  const fetchedAt = Date.parse(file.meta.generatedAt) || Date.now();
  const o = makeOpponent('preset', file.meta.name, games, fetchedAt, PRESET_BOOK_PLIES);
  return { ...o, preset: { id, meta: file.meta, matchGames: extra.length } };
}

const files = new Map<PresetId, Promise<PresetFile>>();

function fetchPreset(id: PresetId): Promise<PresetFile> {
  let p = files.get(id);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}presets/${id}.json`).then((res) => {
      if (!res.ok) throw new Error(`Could not load the ${id} preset (${res.status}).`);
      return res.json() as Promise<PresetFile>;
    });
    p.catch(() => files.delete(id));
    files.set(id, p);
  }
  return p;
}

/** Loads a preset bot. Finished games of this match, when given, are merged into its book. */
export async function loadPreset(id: PresetId, match: MatchGame[] = []): Promise<Opponent> {
  return presetOpponent(id, await fetchPreset(id), match);
}

/**
 * Where a match game left the bot's book: the first ply at which the bot (playing `botColor`)
 * would have had no book move matching the game. Sparring starts there, capped at `cap` plies.
 */
export function bookExit(book: PlayerBook, botColor: Color, ucis: string[], cap = SPAR_START_CAP): number {
  const chess = new Chess();
  const limit = Math.min(ucis.length, cap);
  for (let i = 0; i < limit; i++) {
    if (chess.turn() === botColor && !bookMoves(book, botColor, chess.fen()).some((m) => m.uci === ucis[i])) return i;
    try {
      playUci(chess, ucis[i]);
    } catch {
      return i;
    }
  }
  return limit;
}
