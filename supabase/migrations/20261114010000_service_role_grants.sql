-- "Automatically expose new tables" is off in this project, so tables get no default privileges.
-- The match-api Edge Function writes as service_role: give it explicit write access.
grant select, insert, update, delete on public.games, public.players, public.predictions, public.messages, public.sync_settings to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on public.prediction_tally, public.leaderboard to service_role;
