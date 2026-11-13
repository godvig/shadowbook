# Shadowbook Live – backend setup

The match tab reads from Supabase and writes only through one Edge Function.

| Piece | What it does |
|---|---|
| `migrations/20261113000000_match_hub.sql` | Tables (`games`, `players`, `predictions`, `messages`), row level security, public read grants, the `prediction_tally` and `leaderboard` views, realtime, and the 14 game rows. |
| `migrations/20261114000000_broadcast_sync.sql` | The `sync_settings` row, a generated shared secret in Vault, and a pg_cron job that calls the function every 30 seconds. |
| `functions/match-api` | Verifies the caller's Lichess token, then votes, posts, or (for admins) updates games and moderates. Also syncs the games from a Lichess broadcast (`broadcast.ts` holds the pure parsing logic, tested in `src/live/broadcast.test.ts`). |

Clients never get write access: the publishable key can only read what the policies allow.

## Setup (dashboard, about ten minutes)

1. **SQL Editor** → New query → paste the migrations in order (`…match_hub`, `…broadcast_sync`, `…service_role_grants`) → Run each.
2. **Edge Functions** → Deploy a new function → name it `match-api` → paste `functions/match-api/index.ts` → Deploy.
3. In the function's settings, turn **off** "Verify JWT" (callers authenticate with a Lichess token, not a Supabase session).
4. **Edge Functions → Secrets**: add
   - `ADMIN_LICHESS_IDS` – your Lichess username in lower case (comma-separated for more admins)
   - `ALLOWED_ORIGINS` – `https://shadowbook.godvig.com,http://localhost:5173`

With the CLI instead: `supabase db push` and `supabase functions deploy match-api --no-verify-jwt`.

## Live sync from a Lichess broadcast

1. **SQL Editor**: run `migrations/20261114000000_broadcast_sync.sql`. If it complains about `30 seconds`, change the schedule to `* * * * *`.
2. Still in the SQL Editor, read the generated secret:
   `select decrypted_secret from vault.decrypted_secrets where name = 'match_sync_secret';`
3. **Edge Functions → Secrets**: add it as `SYNC_SECRET`.
4. Redeploy `match-api`. The dashboard editor takes a single file: run `npm run function:bundle` and paste `supabase/dist/match-api.ts`.
5. In the Match tab's admin area, paste the broadcast link (`https://lichess.org/broadcast/<name>/<id>`), save, and turn sync on.

The job copies start times (so predictions lock on time), colours, moves with clocks, the opening name and the result.
Rounds are matched to games by the number in their name ("Game 3"); tiebreak rounds are ignored.

## Running a game

Log in with Lichess as an admin; an Admin panel appears at the bottom of the Match tab.
With sync on there is nothing to do. Without it (or to correct something): set colours and start time before the game, switch the status to `live` when it starts (this also locks predictions),
paste the PGN as the game goes (the board and the move tags in the chat follow it), and set the result and `finished` at the end.
