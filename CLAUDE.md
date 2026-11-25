# Working rules for this repository

Shadowbook builds a sparring partner that opens like a real chess player, from
their Lichess or chess.com games. Vite, React and TypeScript, deployed to
GitHub Pages; the live match hub uses Supabase. Read README.md and docs/
before changing anything. Everything in the repository is English.

## How it is built
- `npm run dev`, `npm run build` (runs scripts/copy-assets.mjs and
  scripts/match-pages.mjs first), `npm run typecheck`, `npm run lint`,
  `npm test`.
- main deploys to shadowbook.godvig.com through .github/workflows/pages.yml.
  Anything merged is live.
- Supabase (supabase/): migrations and functions are deployed by the owner.
  Never run them, never connect to the live project. Only the publishable key
  may ever appear in client code or .env; never a secret or service_role key.

## External APIs
- Lichess: follow its API rules. One request at a time, and on HTTP 429 wait
  a full minute before the next request. Stream NDJSON where the API offers
  it instead of paging.
- chess.com public API: one request at a time, honest User-Agent, cache what
  you fetch.
- Tests use saved fixtures, never live requests. Fixtures use invented
  usernames, or public titled players only where a feature is about a public
  event (such as the match hub).
- Analytics is GoatCounter only, without cookies. Do not add other tracking
  or third-party requests without the owner's decision.

## Checks
Lint, typecheck, tests and build green before every push.

## Git and pull requests
- One feature per branch from main. Small working commits are fine; the owner
  squashes.
- No Co-Authored-By, Claude-Session or other AI attribution in commits or
  pull requests.
- Never push to main. Push the branch and open a pull request.
- Do not write or edit docs/decisions.md. The owner writes it.
- Licence is AGPL-3.0. Do not copy code with an incompatible licence.

## Report (pull request description)
- What changed and why.
- What you verified, and how.
- Anything that touches Supabase, the deploy or external APIs.
- Open questions, and decisions worth recording in docs/decisions.md (as
  bullet points for the owner to write up).
- A proposed squash commit message in English that explains why.
