-- Shadowbook Live: keep the games in sync with a Lichess broadcast.
-- Run this once in the SQL Editor after the first migration.

create table public.sync_settings (
  id           smallint primary key default 1 check (id = 1),
  broadcast_id text,                 -- Lichess broadcast tour id, set from the admin panel
  enabled      boolean not null default false,
  last_run     timestamptz,
  last_summary text,
  last_error   text
);
insert into public.sync_settings (id) values (1);

alter table public.sync_settings enable row level security;
create policy "sync status is public" on public.sync_settings for select to anon, authenticated using (true);
grant select on public.sync_settings to anon, authenticated;
alter publication supabase_realtime add table public.sync_settings;

-- A random shared secret between the cron job and the Edge Function, kept in Vault.
-- After running this file, read it with:
--   select decrypted_secret from vault.decrypted_secrets where name = 'match_sync_secret';
-- and add it to the Edge Function secrets as SYNC_SECRET.
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'match_sync_secret');

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Every 30 seconds. If your project's pg_cron does not accept seconds, use '* * * * *' (every minute).
select cron.schedule(
  'match-sync',
  '30 seconds',
  $$
  select net.http_post(
    url := 'https://axpcobcbzetbcyvuugah.supabase.co/functions/v1/match-api',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'match_sync_secret')
    ),
    body := '{"action":"sync"}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
