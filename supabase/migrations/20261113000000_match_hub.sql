-- Shadowbook Live: match hub for the 2026 World Championship match.
-- Reads are public (anon). Every write goes through the match-api Edge Function,
-- which verifies the caller's Lichess token and uses the service role.

create table public.games (
  id         smallint primary key check (id between 1 and 20), -- 1-14 classical, 15+ tiebreaks
  label      text not null,
  white      text check (white in ('gukesh', 'sindarov')),
  black      text check (black in ('gukesh', 'sindarov')),
  starts_at  timestamptz,
  status     text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished')),
  result     text check (result in ('1-0', '0-1', '1/2-1/2')),
  opening    text,
  pgn        text not null default '',
  updated_at timestamptz not null default now()
);

create table public.players (
  lichess_id text primary key,
  username   text not null,
  banned     boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.predictions (
  game_id    smallint not null references public.games (id) on delete cascade,
  lichess_id text not null references public.players (lichess_id) on delete cascade,
  pick       text not null check (pick in ('gukesh', 'draw', 'sindarov')),
  created_at timestamptz not null default now(),
  primary key (game_id, lichess_id)
);

create table public.messages (
  id         bigint generated always as identity primary key,
  game_id    smallint references public.games (id) on delete cascade, -- null = #match channel
  lichess_id text not null references public.players (lichess_id) on delete cascade,
  username   text not null,
  ply        integer not null default 0 check (ply >= 0),
  body       text not null check (char_length(body) between 1 and 500),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_channel_idx on public.messages (game_id, created_at desc);
create index messages_author_idx on public.messages (lichess_id, created_at desc);

alter table public.games       enable row level security;
alter table public.players     enable row level security;
alter table public.predictions enable row level security;
alter table public.messages    enable row level security;

-- Public read access. Nothing else is granted: no client can write directly.
create policy "games are public" on public.games for select to anon, authenticated using (true);
create policy "visible messages are public" on public.messages for select to anon, authenticated using (not hidden);
grant select on public.games, public.messages to anon, authenticated;

-- Who won a game, by player rather than colour (colours alternate).
create function public.game_winner(g public.games) returns text
language sql immutable as $$
  select case
    when g.result = '1/2-1/2' then 'draw'
    when g.result = '1-0' then g.white
    when g.result = '0-1' then g.black
  end
$$;

-- Vote counts per game. Individual votes stay private.
create view public.prediction_tally as
  select game_id, pick, count(*)::int as votes
  from public.predictions
  group by game_id, pick;

-- 1 point for a correct call, 2 if fewer than a third of voters made the same call.
create view public.leaderboard as
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
  )
  select pl.username, coalesce(sum(sc.pts), 0)::int as points, count(sc.pts)::int as correct
  from public.players pl
  join scored sc on sc.lichess_id = pl.lichess_id
  where not pl.banned
  group by pl.username
  order by points desc, correct desc, pl.username;

grant select on public.prediction_tally, public.leaderboard to anon, authenticated;

-- Live updates for the scoreboard and the chat.
alter publication supabase_realtime add table public.games, public.messages;

-- The fourteen classical games. Dates, colours and start times are filled in from the admin panel.
insert into public.games (id, label)
select n, 'Game ' || n from generate_series(1, 14) as n;
