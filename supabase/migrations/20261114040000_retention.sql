-- Retention, as promised on the privacy page: an account (and, through the cascades, its predictions,
-- messages, reactions and reports) is removed three months after it was last used, never before
-- 31 March 2027. Every authenticated call to match-api updates last_seen.
alter table public.players add column last_seen timestamptz not null default now();

create function public.remove_inactive_players() returns integer
language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  if now() < timestamptz '2027-03-31 00:00:00+00' then
    return 0;
  end if;
  delete from public.players where last_seen < now() - interval '3 months';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.remove_inactive_players() from public, anon, authenticated;

-- Once a day at 03:17 UTC. Does nothing until 31 March 2027.
select cron.schedule('remove-inactive-players', '17 3 * * *', $$ select public.remove_inactive_players(); $$);
