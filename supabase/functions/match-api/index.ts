// Shadowbook Live – the only write path into the database.
// Callers send their Lichess OAuth token in `x-lichess-token`; we verify it against
// lichess.org/api/account and act with the service role on their behalf.
//
// It also keeps the games in sync with a Lichess broadcast: a scheduled job (pg_cron) calls
// { action: 'sync' } with the `x-sync-secret` header every 30 seconds.
//
// Secrets: ADMIN_LICHESS_IDS (comma-separated, lower case), ALLOWED_ORIGINS (comma-separated),
// SYNC_SECRET (the same value the cron job sends). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { matchGameFrom, parseBroadcastId, patchFromPgn, planSync, type BroadcastRound, type DbGame } from './broadcast.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const admins = new Set((Deno.env.get('ADMIN_LICHESS_IDS') ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean));
const origins = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://shadowbook.godvig.com,https://godvig.github.io,http://localhost:5173').split(',').map((s) => s.trim());

const syncSecret = Deno.env.get('SYNC_SECRET') ?? '';
const LICHESS = 'https://lichess.org';
const UA = { 'User-Agent': 'Shadowbook Live (shadowbook.godvig.com)' };

const PICKS = ['gukesh', 'draw', 'sindarov'];
const POST_GAP_MS = 4000;

type User = { id: string; username: string };
const tokenCache = new Map<string, { user: User; until: number }>();

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-lichess-token, x-sync-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

async function lichessUser(token: string): Promise<User | null> {
  const hit = tokenCache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  const res = await fetch('https://lichess.org/api/account', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const a = await res.json();
  const user = { id: String(a.id).toLowerCase(), username: String(a.username) };
  tokenCache.set(token, { user, until: Date.now() + 10 * 60_000 });
  return user;
}

/** Pull the broadcast and update the games table. Returns a one-line summary. */
async function runSync(): Promise<string> {
  const { data: settings } = await db.from('sync_settings').select('*').eq('id', 1).single();
  if (!settings?.enabled || !settings.broadcast_id) return 'Sync is off.';
  const started = new Date().toISOString();
  try {
    const tourRes = await fetch(`${LICHESS}/api/broadcast/${settings.broadcast_id}`, { headers: UA });
    if (!tourRes.ok) throw new Error(`Lichess answered ${tourRes.status} for the broadcast.`);
    const tour = (await tourRes.json()) as { rounds?: BroadcastRound[] };
    const { data: games } = await db.from('games').select('id, status, starts_at, pgn, result');
    const steps = planSync(tour.rounds ?? [], (games ?? []) as DbGame[], Date.now());
    const done: string[] = [];
    for (const step of steps) {
      const patch: Record<string, unknown> = {};
      if (step.startsAt) patch.starts_at = step.startsAt;
      if (step.fetchPgn) {
        const res = await fetch(`${LICHESS}/api/broadcast/round/${step.roundId}.pgn`, { headers: UA });
        if (!res.ok) throw new Error(`Lichess answered ${res.status} for game ${step.gameId}.`);
        const pgn = matchGameFrom(await res.text());
        if (pgn) {
          const current = (games ?? []).find((g) => g.id === step.gameId) as DbGame | undefined;
          const p = patchFromPgn(pgn);
          if (current?.status === 'finished' && !p.result) delete p.status; // never reopen a game an admin closed
          if (current?.pgn !== p.pgn || current?.status !== (p.status ?? current?.status) || current?.result !== (p.result ?? current?.result)) Object.assign(patch, p);
        }
      }
      if (Object.keys(patch).length) {
        patch.updated_at = new Date().toISOString();
        const { error } = await db.from('games').update(patch).eq('id', step.gameId);
        if (error) throw new Error(error.message);
        done.push(`game ${step.gameId}${patch.status ? ` (${patch.status})` : ''}`);
      }
    }
    const summary = done.length ? `Updated ${done.join(', ')}.` : 'Up to date.';
    await db.from('sync_settings').update({ last_run: started, last_error: null, last_summary: summary }).eq('id', 1);
    return summary;
  } catch (e) {
    const msg = (e as Error).message;
    await db.from('sync_settings').update({ last_run: started, last_error: msg }).eq('id', 1);
    throw e;
  }
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Invalid JSON.' });
  }

  // The scheduled job: no user, a shared secret instead.
  if (body.action === 'sync' && req.headers.get('x-sync-secret')) {
    if (!syncSecret || req.headers.get('x-sync-secret') !== syncSecret) return reply(403, { error: 'Bad sync secret.' });
    try {
      return reply(200, { summary: await runSync() });
    } catch (e) {
      return reply(502, { error: (e as Error).message });
    }
  }

  const token = req.headers.get('x-lichess-token');
  const user = token ? await lichessUser(token) : null;
  if (!user) return reply(401, { error: 'Log in with Lichess first.' });

  const { data: player, error: pErr } = await db
    .from('players')
    .upsert({ lichess_id: user.id, username: user.username }, { onConflict: 'lichess_id' })
    .select('banned')
    .single();
  if (pErr) {
    console.error('players upsert failed', pErr);
    return reply(500, { error: `Could not save your profile (${pErr.code ?? 'db error'}).` });
  }
  if (player.banned) return reply(403, { error: 'This account cannot post or vote here.' });

  const isAdmin = admins.has(user.id);

  switch (body.action) {
    case 'whoami': {
      const { data } = await db.from('predictions').select('game_id, pick').eq('lichess_id', user.id);
      const { data: mp } = await db.from('match_predictions').select('pick').eq('lichess_id', user.id).maybeSingle();
      return reply(200, { ...user, admin: isAdmin, predictions: data ?? [], matchPick: mp?.pick ?? null });
    }

    case 'predict_match': {
      const pick = String(body.pick);
      if (pick !== 'gukesh' && pick !== 'sindarov') return reply(400, { error: 'Pick Gukesh or Sindarov.' });
      const { data: g1 } = await db.from('games').select('status, starts_at').eq('id', 1).single();
      const started = !g1 || g1.status !== 'scheduled' || (g1.starts_at && new Date(g1.starts_at).getTime() <= Date.now());
      if (started) return reply(409, { error: 'The match winner pick locked when game 1 started.' });
      const { error } = await db.from('match_predictions').upsert({ lichess_id: user.id, pick, created_at: new Date().toISOString() });
      return error ? reply(500, { error: 'Could not save your pick.' }) : reply(200, { ok: true });
    }

    case 'report': {
      const messageId = Number(body.messageId);
      const reason = String(body.reason ?? '').trim().slice(0, 200) || null;
      const { data: msg } = await db.from('messages').select('lichess_id').eq('id', messageId).maybeSingle();
      if (!msg) return reply(404, { error: 'That message is gone.' });
      if (msg.lichess_id === user.id) return reply(400, { error: 'You cannot report your own message.' });
      const { error } = await db.from('reports').upsert({ message_id: messageId, lichess_id: user.id, reason });
      if (error) return reply(500, { error: 'Could not send the report.' });
      const { count } = await db.from('reports').select('*', { count: 'exact', head: true }).eq('message_id', messageId);
      if ((count ?? 0) >= 3) await db.from('messages').update({ hidden: true }).eq('id', messageId);
      return reply(200, { ok: true });
    }

    case 'my_data': {
      const [predictions, matchPick, messages, reactions, reports] = await Promise.all([
        db.from('predictions').select('game_id, pick, created_at').eq('lichess_id', user.id),
        db.from('match_predictions').select('pick, created_at').eq('lichess_id', user.id),
        db.from('messages').select('id, game_id, ply, body, hidden, created_at').eq('lichess_id', user.id),
        db.from('reactions').select('message_id, glyph, created_at').eq('lichess_id', user.id),
        db.from('reports').select('message_id, reason, created_at').eq('lichess_id', user.id),
      ]);
      const { data: profile } = await db.from('players').select('lichess_id, username, created_at').eq('lichess_id', user.id).single();
      return reply(200, {
        exportedAt: new Date().toISOString(),
        profile,
        predictions: predictions.data ?? [],
        matchWinnerPick: matchPick.data ?? [],
        messages: messages.data ?? [],
        reactions: reactions.data ?? [],
        reports: reports.data ?? [],
      });
    }

    case 'delete_me': {
      // Cascades to predictions, the match pick, messages, reactions and reports.
      const { error } = await db.from('players').delete().eq('lichess_id', user.id);
      tokenCache.delete(token!);
      return error ? reply(500, { error: 'Could not delete your account. Try again.' }) : reply(200, { ok: true });
    }

    case 'predict': {
      const gameId = Number(body.gameId);
      const pick = String(body.pick);
      if (!PICKS.includes(pick)) return reply(400, { error: 'Unknown pick.' });
      const { data: g } = await db.from('games').select('status, starts_at').eq('id', gameId).single();
      if (!g) return reply(404, { error: 'No such game.' });
      const started = g.status !== 'scheduled' || (g.starts_at && new Date(g.starts_at).getTime() <= Date.now());
      if (started) return reply(409, { error: 'Predictions for this game are locked.' });
      const { error } = await db.from('predictions').upsert({ game_id: gameId, lichess_id: user.id, pick, created_at: new Date().toISOString() });
      return error ? reply(500, { error: 'Could not save your prediction.' }) : reply(200, { ok: true });
    }

    case 'post': {
      const text = String(body.body ?? '').trim();
      if (!text || text.length > 500) return reply(400, { error: 'Messages are 1–500 characters.' });
      const gameId = body.gameId == null ? null : Number(body.gameId);
      const ply = Math.max(0, Math.floor(Number(body.ply) || 0));
      const { data: last } = await db
        .from('messages')
        .select('created_at')
        .eq('lichess_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last && Date.now() - new Date(last.created_at).getTime() < POST_GAP_MS) return reply(429, { error: 'Slow down a little.' });
      const { error } = await db.from('messages').insert({ game_id: gameId, lichess_id: user.id, username: user.username, ply, body: text });
      return error ? reply(500, { error: 'Could not post your message.' }) : reply(200, { ok: true });
    }

    case 'react': {
      const messageId = Number(body.messageId);
      const glyph = String(body.glyph);
      if (!['!!', '!', '?', '??', '½'].includes(glyph)) return reply(400, { error: 'Unknown reaction.' });
      const key = { message_id: messageId, lichess_id: user.id, glyph };
      // At most 30 reactions a minute per player: plenty for real use, a wall for scripts.
      const since = new Date(Date.now() - 60_000).toISOString();
      const { count: recent } = await db.from('reactions').select('*', { count: 'exact', head: true }).eq('lichess_id', user.id).gte('created_at', since);
      if ((recent ?? 0) >= 30) return reply(429, { error: 'Easy on the reactions. Try again in a minute.' });
      const { data: existing } = await db.from('reactions').select('glyph').match(key).maybeSingle();
      const { error } = existing ? await db.from('reactions').delete().match(key) : await db.from('reactions').insert(key);
      return error ? reply(400, { error: 'Could not save your reaction.' }) : reply(200, { ok: true, on: !existing });
    }

    case 'admin_game': {
      if (!isAdmin) return reply(403, { error: 'Admins only.' });
      const allowed = ['white', 'black', 'starts_at', 'status', 'result', 'opening', 'pgn'];
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of allowed) if (k in (body.patch as object)) patch[k] = (body.patch as Record<string, unknown>)[k] === '' ? null : (body.patch as Record<string, unknown>)[k];
      if (patch.pgn === null) patch.pgn = '';
      const { error } = await db.from('games').update(patch).eq('id', Number(body.gameId));
      return error ? reply(400, { error: error.message }) : reply(200, { ok: true });
    }

    case 'admin_reports': {
      if (!isAdmin) return reply(403, { error: 'Admins only.' });
      const { data: reps } = await db.from('reports').select('message_id, reason, lichess_id, created_at').order('created_at', { ascending: false }).limit(200);
      const ids = [...new Set((reps ?? []).map((r) => r.message_id))];
      const { data: msgs } = ids.length ? await db.from('messages').select('id, username, lichess_id, body, hidden, game_id').in('id', ids) : { data: [] };
      const out = (msgs ?? []).map((m) => ({
        ...m,
        reports: (reps ?? []).filter((r) => r.message_id === m.id).map((r) => ({ by: r.lichess_id, reason: r.reason })),
      }));
      return reply(200, { messages: out });
    }

    case 'admin_dismiss': {
      if (!isAdmin) return reply(403, { error: 'Admins only.' });
      const id = Number(body.messageId);
      await db.from('reports').delete().eq('message_id', id);
      const { error } = await db.from('messages').update({ hidden: false }).eq('id', id);
      return error ? reply(400, { error: error.message }) : reply(200, { ok: true });
    }

    case 'admin_match_winner': {
      if (!isAdmin) return reply(403, { error: 'Admins only.' });
      const w = body.winner === 'gukesh' || body.winner === 'sindarov' ? body.winner : null;
      const { error } = await db.from('match_info').update({ winner: w }).eq('id', 1);
      return error ? reply(400, { error: error.message }) : reply(200, { ok: true });
    }

    case 'admin_hide': {
      if (!isAdmin) return reply(403, { error: 'Admins only.' });
      const { error } = await db.from('messages').update({ hidden: true }).eq('id', Number(body.messageId));
      return error ? reply(400, { error: error.message }) : reply(200, { ok: true });
    }

    case 'admin_ban': {
      if (!isAdmin) return reply(403, { error: 'Admins only.' });
      const id = String(body.lichessId ?? '').toLowerCase();
      await db.from('messages').update({ hidden: true }).eq('lichess_id', id);
      const { error } = await db.from('players').update({ banned: true }).eq('lichess_id', id);
      return error ? reply(400, { error: error.message }) : reply(200, { ok: true });
    }

    case 'admin_sync_settings': {
      if (!isAdmin) return reply(403, { error: 'Admins only.' });
      const patch: Record<string, unknown> = {};
      if (typeof body.broadcast === 'string') {
        const id = body.broadcast.trim() ? parseBroadcastId(body.broadcast) : null;
        if (body.broadcast.trim() && !id) return reply(400, { error: 'Paste the broadcast page link (lichess.org/broadcast/<name>/<id>) or its 8-character id.' });
        patch.broadcast_id = id;
      }
      if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
      const { error } = await db.from('sync_settings').update(patch).eq('id', 1);
      return error ? reply(400, { error: error.message }) : reply(200, { ok: true });
    }

    case 'admin_sync_now': {
      if (!isAdmin) return reply(403, { error: 'Admins only.' });
      try {
        return reply(200, { summary: await runSync() });
      } catch (e) {
        return reply(502, { error: (e as Error).message });
      }
    }

    default:
      return reply(400, { error: 'Unknown action.' });
  }
});
