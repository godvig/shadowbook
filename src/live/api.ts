import { createClient } from '@supabase/supabase-js';
import { API_URL, SUPABASE_KEY, SUPABASE_URL } from './config';
import { getToken } from './lichessAuth';
import type { Reaction } from './chat';
import type { Finalist, LiveGame, Me, Message, Pick, SyncSettings } from './types';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

export async function loadGames(): Promise<LiveGame[]> {
  const { data, error } = await supabase.from('games').select('*').order('id');
  if (error) throw error;
  return data as LiveGame[];
}

export async function loadMessages(): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, game_id, lichess_id, username, ply, body, created_at')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data as Message[]).reverse();
}

export async function loadReactions(): Promise<Reaction[]> {
  const { data, error } = await supabase.from('reactions').select('message_id, lichess_id, glyph').order('created_at', { ascending: false }).limit(3000);
  if (error) return [];
  return data as Reaction[];
}

export async function loadMatchTally(): Promise<Partial<Record<Finalist, number>>> {
  const { data } = await supabase.from('match_tally').select('pick, votes');
  const out: Partial<Record<Finalist, number>> = {};
  for (const r of (data ?? []) as { pick: Finalist; votes: number }[]) out[r.pick] = r.votes;
  return out;
}

export async function loadMatchWinner(): Promise<Finalist | null> {
  const { data } = await supabase.from('match_info').select('winner').eq('id', 1).maybeSingle();
  return (data?.winner as Finalist | null) ?? null;
}

export async function loadTally(): Promise<Record<number, Partial<Record<Pick, number>>>> {
  const { data, error } = await supabase.from('prediction_tally').select('*');
  if (error) throw error;
  const out: Record<number, Partial<Record<Pick, number>>> = {};
  for (const r of data as { game_id: number; pick: Pick; votes: number }[]) (out[r.game_id] ??= {})[r.pick] = r.votes;
  return out;
}

export async function loadLeaderboard(): Promise<{ username: string; points: number; correct: number }[]> {
  const { data, error } = await supabase.from('leaderboard').select('*').limit(10);
  if (error) throw error;
  return data as { username: string; points: number; correct: number }[];
}

export async function loadSync(): Promise<SyncSettings | null> {
  const { data } = await supabase.from('sync_settings').select('broadcast_id, enabled, last_run, last_summary, last_error').eq('id', 1).maybeSingle();
  return (data as SyncSettings | null) ?? null;
}

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new Error('Log in with Lichess first.');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, 'x-lichess-token': token },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body as T;
}

export const whoami = () => call<Me>('whoami');
export const predict = (gameId: number, pick: Pick) => call('predict', { gameId, pick });
export const post = (gameId: number | null, ply: number, body: string) => call('post', { gameId, ply, body });
export const adminGame = (gameId: number, patch: Partial<LiveGame>) => call('admin_game', { gameId, patch });
export const adminHide = (messageId: number) => call('admin_hide', { messageId });
export const adminBan = (lichessId: string) => call('admin_ban', { lichessId });
export const adminSyncSettings = (patch: { broadcast?: string; enabled?: boolean }) => call('admin_sync_settings', patch);
export const adminSyncNow = () => call<{ summary: string }>('admin_sync_now');
export const react = (messageId: number, glyph: string) => call<{ on: boolean }>('react', { messageId, glyph });
export const predictMatch = (pick: Finalist) => call('predict_match', { pick });
export const report = (messageId: number) => call('report', { messageId });
export const myData = () => call<Record<string, unknown>>('my_data');
export const deleteMe = () => call('delete_me');
export interface ReportedMessage {
  id: number;
  username: string;
  lichess_id: string;
  body: string;
  hidden: boolean;
  game_id: number | null;
  reports: { by: string; reason: string | null }[];
}
export const adminReports = () => call<{ messages: ReportedMessage[] }>('admin_reports');
export const adminDismiss = (messageId: number) => call('admin_dismiss', { messageId });
export const adminMatchWinner = (winner: Finalist | null) => call('admin_match_winner', { winner });
