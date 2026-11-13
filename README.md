# Shadowbook

[![CI](https://github.com/godvig/shadowbook/actions/workflows/ci.yml/badge.svg)](https://github.com/godvig/shadowbook/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

**Chess opponent prep: play the person, not the engine.** Type in a chess.com or Lichess username and Shadowbook builds a sparring
partner that opens exactly like that player – the same moves, as often as they really play them – and then plays on
like a human of their rating.

Engines don't prepare you for Saturday's club game. Your opponent's 1.e4 c5 2.Nc3 e6 does. Shadowbook lets you
rehearse the games you are actually going to get, find out where your preparation runs out, and turn that into lessons.

![Sparring against the demo player](docs/sparring.png)

## Live demo

**[shadowbook.godvig.com](https://shadowbook.godvig.com/)** – no account needed. Scout any public
player, or spar the built-in demo player *BishopBjörn* (a made-up 1540 with a weakness for the Fried Liver).

## Quick start

```bash
git clone https://github.com/godvig/shadowbook.git
cd shadowbook
npm install
npm run dev        # http://localhost:5173/
```

Requires Node 20+. `npm run build` produces a static site in `dist/` that can be hosted anywhere.

## Features

- **Scouting report** – what they play as White and Black, their most repeated lines and how they score in them.
  Filter by time control.
- **Their openings, their frequencies** – the bot picks each move with the same probability the player chose it in
  their games, and tells you so ("played c5 in 17 of 17 games here").
- **Human-like after the book** – when the player's games run out, [Maia3](https://github.com/CSSLab/maia3), a neural
  network trained to predict the moves of humans at a given rating, takes over at their strength.
- **Debrief** – where their book ended, whether you surprised them with a move they had never faced, the moves that
  cost you the most (with what a strong human would have played), PGN export and one-click Lichess analysis.
- **Rematch from the critical moment** – replay from the move where their preparation ended.
- **Private by design** – everything runs in your browser. Games are cached locally in IndexedDB; nothing is sent to
  any server except the public chess.com/Lichess APIs.
- **Works without an account** – chess.com and Lichess games are public, a PGN upload works for anything else.

![Scouting report](docs/scouting.png)

### Shadowbook Live (match tab)

A hub for the 2026 World Championship match: live score, a prediction for every game with a leaderboard, and a chat
where every message is pinned to the move it was written at, so clicking it shows the board at that moment.
Anyone can follow along; voting and posting use "Log in with Lichess" (OAuth PKCE, no password ever touches the site).
Backend: Supabase (Postgres with row level security, realtime, one Edge Function as the only write path).
Setup notes in [`supabase/README.md`](supabase/README.md).

## Architecture

```
src/
  lib/
    sources.ts   chess.com Published-Data API, Lichess export API, PGN files  →  Game[]
    book.ts      Game[] → per-position move statistics for one player (transposition-aware)
    bot.ts       book move (weighted by frequency) → otherwise Maia3 sampled at the player's rating
    review.ts    debrief: Maia3's value head scores each of your moves at your rating
    storage.ts   IndexedDB cache of scouted players
  views/         Home → Report → Game → Debrief
  components/    Board (Lichess' Chessground)
```

- **Moves and rules:** [chess.js](https://github.com/jhlywa/chess.js)
- **Board:** [Chessground](https://github.com/lichess-org/chessground), the board used on lichess.org
- **Human-like play:** [maia3-js](https://www.npmjs.com/package/maia3-js) running the 5M-parameter Maia3 network with
  [ONNX Runtime Web](https://onnxruntime.ai/) (wasm). The 22 MB network is served from this site and cached by the browser.
- **Stack:** React 19, TypeScript, Vite, deployed to GitHub Pages by GitHub Actions.

## Tests

```bash
npm test           # Vitest: PGN parsing, book building, bot move selection
npm run typecheck
npm run lint
```

CI runs all three on every push.

## Roadmap

- [x] Spar any chess.com / Lichess player, scouting report, debrief
- [ ] Your own repertoire with spaced-repetition review (FSRS) – positions, not lines
- [ ] "Where your book meets theirs": compare your repertoire with an opponent's games before the game
- [ ] Turn debrief findings into review cards automatically
- [ ] Clocks and premoves
- [ ] Stockfish analysis next to Maia in the debrief
- [ ] Installable PWA, offline support

## License

[AGPL-3.0](LICENSE). Shadowbook builds on GPL-licensed Chessground and MIT-licensed Maia3, chess.js and ONNX Runtime.
Not affiliated with chess.com or Lichess.
