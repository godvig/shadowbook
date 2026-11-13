# Shadowbook Live – backend setup

The match tab reads from Supabase and writes only through one Edge Function.

| Piece | What it does |
|---|---|
| `migrations/20261113000000_match_hub.sql` | Tables (`games`, `players`, `predictions`, `messages`), row level security, public read grants, the `prediction_tally` and `leaderboard` views, realtime, and the 14 game rows. |
| `functions/match-api` | Verifies the caller's Lichess token, then votes, posts, or (for admins) updates games and moderates. |

Clients never get write access: the publishable key can only read what the policies allow.

## Setup (dashboard, about ten minutes)

1. **SQL Editor** → New query → paste the migration → Run.
2. **Edge Functions** → Deploy a new function → name it `match-api` → paste `functions/match-api/index.ts` → Deploy.
3. In the function's settings, turn **off** "Verify JWT" (callers authenticate with a Lichess token, not a Supabase session).
4. **Edge Functions → Secrets**: add
   - `ADMIN_LICHESS_IDS` – your Lichess username in lower case (comma-separated for more admins)
   - `ALLOWED_ORIGINS` – `https://shadowbook.godvig.com,http://localhost:5173`

With the CLI instead: `supabase db push` and `supabase functions deploy match-api --no-verify-jwt`.

## Running a game

Log in with Lichess as an admin; an Admin panel appears at the bottom of the Match tab.
Set colours and start time before the game, switch the status to `live` when it starts (this also locks predictions),
paste the PGN as the game goes (the board and the move tags in the chat follow it), and set the result and `finished` at the end.
