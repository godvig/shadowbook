// Types for presets-lib.mjs, so the TypeScript tests can import it.
import type { Game } from '../src/lib/types';

export interface PresetPlayer {
  name: string;
  display: string;
  fideId: number;
  surname: string;
  given: string[];
}

export interface PresetEvent {
  name: string;
  id: string;
  url: string;
  date: string;
}

export type SourcedGame = Game & { source?: string };

export const PRESET_PLIES: number;
export function pgnHeaders(pgn: string): Record<string, string>;
export function pgnSans(pgn: string): string[];
export function splitPgn(text: string): string[];
export function sansToUcis(sans: string[]): string[];
export function nameTokens(name: string | undefined): string[];
export function isPlayer(player: PresetPlayer, name: string | undefined, fideId?: string): boolean;
export function secondsFor60(tc: string | undefined): number | null;
export function isClassical(headers: Record<string, string>, eventName?: string): boolean;
export function gamesFromEvent(pgnText: string, player: PresetPlayer, event?: Partial<PresetEvent>): SourcedGame[];
export function dedupe<T extends Game>(games: T[]): T[];
export function presetFile(
  player: PresetPlayer,
  games: SourcedGame[],
  events: PresetEvent[],
  generatedAt?: string,
): { meta: import('../src/lib/presets').PresetMeta; games: Game[] };
