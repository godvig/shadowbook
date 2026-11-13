-- Shadowbook Live: reactions on chat messages, using chess annotation glyphs.
create table public.reactions (
  message_id bigint not null references public.messages (id) on delete cascade,
  lichess_id text not null references public.players (lichess_id) on delete cascade,
  glyph      text not null check (glyph in ('!!', '!', '?', '??', '½')),
  created_at timestamptz not null default now(),
  primary key (message_id, lichess_id, glyph)
);

alter table public.reactions enable row level security;
create policy "reactions are public" on public.reactions for select to anon, authenticated using (true);
grant select on public.reactions to anon, authenticated;
grant select, insert, update, delete on public.reactions to service_role;
alter publication supabase_realtime add table public.reactions;
