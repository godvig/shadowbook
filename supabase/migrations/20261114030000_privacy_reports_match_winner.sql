-- Shadowbook Live: reports on chat messages, and a prediction for the winner of the whole match.

-- Reports: private (only the Edge Function reads them). Three reports from different players hide a message.
create table public.reports (
  message_id bigint not null references public.messages (id) on delete cascade,
  lichess_id text not null references public.players (lichess_id) on delete cascade,
  reason     text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (message_id, lichess_id)
);
alter table public.reports enable row level security;
grant select, insert, update, delete on public.reports to service_role;

-- Who wins the match. One pick per player, locked when game 1 starts.
create table public.match_predictions (
  lichess_id text primary key references public.players (lichess_id) on delete cascade,
  pick       text not null check (pick in ('gukesh', 'sindarov')),
  created_at timestamptz not null default now()
);
alter table public.match_predictions enable row level security;
grant select, insert, update, delete on public.match_predictions to service_role;

-- The match result, set by an admin when it is decided (tiebreaks included).
create table public.match_info (
  id     smallint primary key default 1 check (id = 1),
  winner text check (winner in ('gukesh', 'sindarov'))
);
insert into public.match_info (id) values (1);
alter table public.match_info enable row level security;
create policy "match info is public" on public.match_info for select to anon, authenticated using (true);
grant select on public.match_info to anon, authenticated;
grant select, insert, update, delete on public.match_info to service_role;
alter publication supabase_realtime add table public.match_info;

create view public.match_tally as
  select pick, count(*)::int as votes from public.match_predictions group by pick;
grant select on public.match_tally to anon, authenticated, service_role;

-- Leaderboard: game points as before, plus 3 for calling the match winner.
create or replace view public.leaderboard as
  with shares as (
    select game_id, pick, votes::numeric / sum(votes) over (partition by game_id) as share
    from public.prediction_tally
  ),
  scored as (
    select p.lichess_id,
           case when s.share < 1.0 / 3 then 2 else 1 end as pts
    from public.predictions p
    join public.games g on g.id = p.game_id and g.status = 'finished'
    join shares s on s.game_id = p.game_id and s.pick = p.pick
    where public.game_winner(g) = p.pick
    union all
    select mp.lichess_id, 3
    from public.match_predictions mp
    join public.match_info mi on mi.winner = mp.pick
  )
  select pl.username, coalesce(sum(sc.pts), 0)::int as points, count(sc.pts)::int as correct
  from public.players pl
  join scored sc on sc.lichess_id = pl.lichess_id
  where not pl.banned
  group by pl.username
  order by points desc, correct desc, pl.username;
