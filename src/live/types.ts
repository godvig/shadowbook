export type Finalist = 'gukesh' | 'sindarov';
export type Pick = Finalist | 'draw';
export type GameStatus = 'scheduled' | 'live' | 'finished';

export interface LiveGame {
  id: number;
  label: string;
  white: Finalist | null;
  black: Finalist | null;
  starts_at: string | null;
  status: GameStatus;
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  opening: string | null;
  pgn: string;
}

export interface Message {
  id: number;
  game_id: number | null;
  lichess_id: string;
  username: string;
  ply: number;
  body: string;
  created_at: string;
}

export interface Me {
  id: string;
  username: string;
  admin: boolean;
  predictions: { game_id: number; pick: Pick }[];
  matchPick: Finalist | null;
}

export const NAMES: Record<Finalist, string> = { gukesh: 'Gukesh', sindarov: 'Sindarov' };

export interface SyncSettings {
  broadcast_id: string | null;
  enabled: boolean;
  last_run: string | null;
  last_summary: string | null;
  last_error: string | null;
}
