# Shadowbook Library v2 — phased plan for Claude Code

Repo: `godvig/shadowbook` (AGPL-3.0, live at https://shadowbook.godvig.com). Owner: Adam Englund.
This file is the brief. Put it in the repo as `docs/library-plan.md` and work from it one phase at a time.

Written 2026-11-15. Updated 2026-11-16 with the Phase 0 findings, decks built from the user's own games, and "habits that cost you". Where this plan and the code disagree, say so and ask before choosing.

---

## 1. Working rules (every phase)

1. **One phase per session.** Before writing code: restate the phase scope in five bullets, list the files you expect to touch, and list anything in this plan that conflicts with the code as it is today. Wait for Adam's OK.
2. **Branch.** Work on `feat/library-phase-N`, starting from the latest `main`. Push to `main` only when Adam says so in the session.
3. **Commits.** Adam is the author of every commit. Do not add `Co-Authored-By`, `Claude-Session` or any AI attribution to commits or pull requests. When the phase is done, make **one** squashed commit as `godvig <godvig@users.noreply.github.com>` with a message that explains *why*, after Adam has seen the report.
4. **Do not touch what is live** outside the Library: the Spar and Match tabs, the logo, the match pages and the Supabase function stay as they are unless a phase says otherwise.
5. **Checks.** `npm run lint && npm run typecheck && npm test && npm run build` must pass before you report a phase as done.
6. **Dependencies.** No new runtime dependencies without asking. Dev dependencies for tests are fine if you say which and why.
7. **Privacy.** The Library is local-first. No Library data leaves the browser. Cookieless page counting is allowed, with a fixed path and a fixed title: every Library route counts as `/library` with the title "Library – Shadowbook". Deck ids, deck names and usernames never appear in a counted path or title. The only other calls are to the public Lichess and chess.com APIs, started by the user. Exception (Phase 3, approved 2026-11-16): with "Stockfish's recommendation" on (the default), training sends the position on the board (its FEN, nothing else) to Lichess's cloud evaluation; each answer is cached for 30 days, the Privacy page says so, and the switch is beside the board. No personal data, real names or Adam's own studies in fixtures: test data is synthetic.
8. **Language.** Everything in the repo is English.
9. **`docs/decisions.md` is Adam's.** Never create or edit it. In your phase report, list the decisions you made and what you rejected, so he can write it himself.
10. **Phase report.** End each phase with: what changed (by file), the data model in ten lines, the hardest bug and how it was found, what is untested, open questions, a manual test script for desktop and phone, and five questions that check whether Adam understands what was built.

Kick-off prompt Adam pastes for each phase:

> Read `docs/library-plan.md`. We are doing Phase N only. Follow section 1 exactly: restate scope, list files, list conflicts, then wait for my OK. Work on branch `feat/library-phase-N`. Push to main only when I say so. Do not add Co-Authored-By, Claude-Session or any AI attribution to commits or pull requests.

---

## 2. Where the Library was before Phase 1

Kept for history. Phase 1 replaced `repertoire.ts` and `store.ts` with `src/rep/model/` and `src/rep/db.ts`.

| File | What it does |
|---|---|
| `src/rep/repertoire.ts` | `RepEntry`: one card per position where it is your move, id `color|fenKey`, `moves[]` (first = main), `line[]` (one path from the start), ts-fsrs `card`. `addMove`, `pgnEdges` (PGN with variations), `importPgn`, `review`, `queue`. |
| `src/rep/store.ts` | IndexedDB `shadowbook-rep` v1: stores `entries` and `meta`. JSON backup and restore. |
| `src/rep/tree.ts`, `RepTree.tsx` | Tree view rebuilt from each entry's `line`. |
| `src/rep/lichessStudy.ts` | Import by study link. Splits chapters, reads `Orientation`. |
| `src/rep/meet.ts`, `MeetPanel.tsx` | "Your book vs theirs": replays the Library against a scouted opponent's book. Shown in `views/Report.tsx` and in the Library. |
| `src/views/Library.tsx` | Overview, Build (record on the board) and Review, per colour. |
| `src/App.tsx` | `library` view at `/#library`. Not lazy-loaded. |

Known problems this plan fixes:

- Only your own moves are stored. Opponent moves exist only inside `line`, so they cannot carry a sign or a note, and an opponent move you have no answer to cannot be stored.
- Comments, move signs and drawn arrows in imported PGN are thrown away. Chapter names are lost; everything lands in one pile per colour.
- **Orientation.** The API spec says `orientation` defaults to false, but the server sends the `Orientation` tag on every chapter anyway (checked 2026-11-16, also with `orientation=false`). `studyPgnUrl` still sends `?orientation=true`, because the spec requires it.
- Review shows positions cold. There is no way to play a line from move one.
- "Any of your moves counts" is silent: the user is not told which other moves were accepted.
- No review log, so no statistics are possible.

---

## 3. Decisions already made by Adam (do not reopen)

- Local-first in IndexedDB. Sync between devices is a later, separate feature.
- The data model becomes a **move graph for both sides**, grouped into **decks** (one opening or chapter). Cards exist only for positions where the user moves.
- FSRS through `ts-fsrs` stays.
- The Library start page is **"Your library"**, a shelf of deck cards (design B). Opening a deck shows a workbench with board, move tree, signs and notes (design C).
- Training starts by **choosing a deck**, which leads to a board. Default mode is **Full lines**: play from the start of the line. **Positions** mode jumps straight to due positions. The last used mode is remembered; a toggle sits beside the board.
- All opponent moves are played automatically. For a Black deck that includes White's first move.
- **Start at move** 1–10, so experienced players can skip the first moves. The value can be saved as the default for each deck.
- Beside the board there is a control for **switching deck**.
- A move outside the book during training offers: try again, add as alternative, make it my main move. Adding a move leaves the card ungraded.
- When a position has several accepted moves and the user plays one, the others are shown afterwards.
- New moves can be added while training.
- **Eight starter openings** ship with the app, for beginners who do not know opening names.
- Move signs as on Lichess: `!!`, `!`, `!?`, `?!`, `?`, `??`, plus a free-text note per move. Arrows and circles from Lichess studies are kept and shown.
- Chapter names and opening names are shown, not just "1.e4".
- Sharing back to Lichess is **one-way**: Shadowbook is the original and pushes a copy. No two-way sync.
- Settings for new cards per day, and statistics.
- Two insight features must be built: **your own games against your book**, and **gaps against what people at your level play**.
- Adam plays almost only on chess.com. A deck can be **built from the user's own games** (chess.com or Lichess), so nobody needs a Lichess study to get started.
- The most important insight is **the bad moves the user keeps playing**: the same weak move, in the same position, game after game.

Decided after Phase 0 (2026-11-16):

- `[%anno …]` is dropped on import. The Library has no use for it, and sharing to Lichess is a one-way copy.
- Default chapter names (`Chapter 3`) count as no name, so the deck gets the opening's name.
- The openings map is the first source for a deck name. Lichess's `Opening` tag is used only when the map gives nothing, so decks built on the board or from pasted PGN are named the same way as imported ones.
- `0-0` is read as normal castling. A variation that contains the null move `--` ends there and is counted in the import message.
- The plan file goes into the repo only after the README has its sentence about AI assistance (in Phase 2). Until then `docs/library-plan.md` stays untracked: never `git add -A` without leaving it out.

Decided during Phase 1 (2026-11-16):

- Re-importing a study never deletes moves and never changes an existing main move. New moves from Lichess are added; where the deck already has a main move, the Lichess move becomes an alternative. Every difference is listed in the import message.
- Our own sign, note and shapes always win on re-import. A study only fills a field that is empty in the deck.
- The deck name comes from a non-default `ChapterName`, never from `Event`. The serializer writes `ChapterName` and `Event`, and `ChapterURL` and `StudyName` for decks with a Lichess source, so export then import keeps the name and the link to the study.
- Pasted PGN with a `ChapterURL` is treated as a Lichess source.
- Deleting a deck deletes cards no other deck uses. The confirm text says progress will be lost and suggests a backup.
- Review rows are written from Phase 1 on.

---

## 4. Target data model

All domain logic is pure TypeScript under `src/rep/model/`, tested without a DOM or IndexedDB. `src/rep/db.ts` is a thin typed wrapper.

```ts
type Color = 'w' | 'b';
type Glyph = '!!' | '!' | '!?' | '?!' | '?' | '??';
type Brush = 'green' | 'red' | 'blue' | 'yellow';
interface Shape { orig: string; dest?: string; brush: Brush }   // circle when dest is absent

interface Deck {
  id: string;                 // uuid
  name: string;               // chapter name, else opening name, editable
  color: Color;               // the side the user plays
  source:
    | { kind: 'board' }
    | { kind: 'pgn' }
    | { kind: 'lichess'; studyId: string; chapterId?: string; url: string; studyName?: string }
    | { kind: 'starter'; starterId: string }
    | { kind: 'games'; site: 'chesscom' | 'lichess'; username: string; opening: string; builtAt: string };
  startMove: number;          // 1..10, default 1: first full move the user plays in training
  intro?: string;             // comment before the first move
  createdAt: string; updatedAt: string; lastTrainedAt?: string;
}

/** One move in one deck. Key: [deckId, from, uci]. */
interface Edge {
  deckId: string;
  from: string;               // fenKey of the position before the move
  uci: string;
  san: string;
  to: string;                 // fenKey after the move
  toFen: string;              // full FEN after the move, for display
  mine: boolean;              // moved by deck.color
  rank: number;               // order among moves from `from` in this deck; 0 = main
  glyph?: Glyph;
  comment?: string;
  shapes?: Shape[];           // shown in the position after the move
  nags?: number[];            // other NAGs, kept only so export round-trips
}

/** A fact to remember: "in this position I play this move". Shared by decks that agree. */
interface Card {
  id: string;                 // `${color}|${fenKey}|${uci}` where uci is the main move
  color: Color;
  fen: string;                // full FEN of the position
  fsrs: import('ts-fsrs').Card;
  addedAt: string;
}

interface Review {            // append-only log, needed for statistics
  id?: number;                // auto-increment
  cardId: string; deckId: string;
  at: string;                 // ISO time
  rating: 1 | 2 | 3 | 4;      // ts-fsrs Rating
  mode: 'lines' | 'positions';
  wasDue: boolean;
  elapsedDays: number; stateBefore: number;
}

interface Settings {
  newPerDay: number;          // default 20
  retention: number;          // FSRS request_retention, default 0.9
  mode: 'lines' | 'positions';// last used
  autoplayMs: number;         // default 350
}
```

Rules that follow from the model:

- **Keys.** Always derive `fenKey` from `chess.js` (`fenKey(chess.fen())` in `src/lib/chess.ts`), never from an external FEN string.
- **Card identity.** The card for a position in a deck is `(deck.color, from, uci of the rank-0 own edge)`. Two decks with the same main move at the same position share one card and one schedule. Two decks that disagree (Italian 3.Bc4, Ruy Lopez 3.Bb5) have two cards, and a review always shows which deck it belongs to.
- **Alternatives.** Own edges with `rank > 0` are accepted answers for that card in that deck. They do not get cards of their own.
- **Changing the main move** changes the card id: create the new card as New, and delete the old card if no deck refers to it any more. Run this orphan cleanup after every edge change.
- **Lines.** A line is a path from the start position to a leaf of the deck. Enumerate lines so that every edge is on at least one line. When a path reaches a position whose continuation has already been enumerated (a transposition), end the line there. Guard against cycles with a visited-on-path set.
- **Move depth of a card** is the full-move number on the first enumerated path that reaches it. `startMove` compares against that.
- **Deck counts.** Total = cards of the deck at or after `startMove`. Learned = those whose FSRS state is not New. Due = those due now, plus new cards still inside today's budget. The Library total counts each card once.
- **Root.** Every deck starts from the normal start position. Chapters with a custom `[FEN]` are skipped and counted in the import message, as today.

IndexedDB `shadowbook-rep`, version 2:

| Store | Key | Indexes |
|---|---|---|
| `decks` | `id` | |
| `edges` | `[deckId, from, uci]` | `deckId`, `[deckId, from]` |
| `cards` | `id` | |
| `reviews` | auto-increment | `cardId`, `at` |
| `meta` | string | settings, daily new count, schema info |
| `cache` | string | phase 7 |
| `entries` | `id` | v1 data, left in place and read-only for one release |

Backup format v2 holds decks, edges, cards, reviews and settings. Restore must also accept v1 backups.

---

## 5. Phases

Phases 1 to 3 are the core. Do not start a phase before the previous one is merged. Exception: Phases 0 and 1 share one branch (`feat/library-phase-1`) and one squashed commit.
Suggested order after Phase 3: **6, then 4, 5, 7**, because Phase 6 holds what Adam cares most about. Adam decides.

### Phase 0 — Check the facts (no feature code)

- Fetch one public Lichess study with `?orientation=true` and note exactly what the export contains: tags (`Event`, `ChapterName`, `Orientation`, `FEN`, `SetUp`), comment syntax, `[%csl …]` and `[%cal …]`, NAGs, clock and eval comments. Official reference: https://lichess.org/api#tag/Studies
- From that, write synthetic fixtures under `src/rep/model/__fixtures__/` with the same structure and made-up content.
- Confirm the licence of https://github.com/lichess-org/chess-openings before vendoring anything from it (expected: CC0).
- Report findings. No commit needed beyond the fixtures.

### Phase 1 — Data model, storage, PGN in and out

Goal: the new model exists, old data is migrated, import keeps everything, and the current screens still work on top of it.

1. `model/types.ts`, `model/deck.ts` (add, remove, re-rank edges; orphan cleanup), `model/lines.ts`, `model/cards.ts` (card ids, counts, queue).
2. `model/pgn.ts`
   - **Parse** one or many games into `{ name, orientation, intro, edges[] , skipped }`. Handle headers, nested variations, `{comments}`, `;` comments, NAGs `$n`, suffix signs (`!?`), move numbers, results, and junk tokens without throwing. Signs arrive from Lichess as SAN suffixes (`Nf3!?`), not as `$1`–`$6`, so read both. Read `0-0` as castling. A variation that contains the null move `--` ends there and is counted in `skipped`.
   - Map NAG 1, 2, 3, 4, 5, 6 to `!`, `?`, `!!`, `??`, `!?`, `?!`. Keep other NAGs in `nags`.
   - From comments, extract `[%csl Gd4,Rf7]` (circles) and `[%cal Ge2e4]` (arrows) into `shapes`; letters G, R, B, Y map to the brushes. Drop `[%clk …]`, `[%eval …]` and `[%anno …]`. A move can have several `{ }` blocks, and commands can stand back to back with no space; join the remaining text into one `comment`.
   - A comment before the first move is the deck `intro`.
   - **Serialize** a deck to PGN: tags `Event` and `ChapterName` (deck name), `Site` (`https://shadowbook.godvig.com`), `Orientation`, `Result "*"`, plus `StudyName` and `ChapterURL` for decks with a Lichess source; main move first, alternatives and opponent replies as variations; signs as NAGs; shapes written back into the comment.
   - Test: `parse(serialize(deck))` gives the same edges, for decks with transpositions too.
3. `model/openings.ts` and `scripts/build-openings.mjs`: build a `fenKey → { eco, name }` map from lichess-org/chess-openings, commit the generated JSON, load it with a dynamic import. The TSV files have no FEN, so the script replays each line with chess.js to get the `fenKey`. A deck without a chapter name, or with a default one (`Chapter 3`), is named after the deepest named position on its main line; Lichess's `Opening` tag is the fallback when the map gives nothing. Credit the source in the README.
4. `model/migrateV1.ts`: a pure function from v1 `RepEntry[]` to `{ decks, edges, cards }`. One deck per colour ("My White repertoire", "My Black repertoire"). Rebuild edges from every entry's `line` plus its `moves` (order gives `rank`). Carry each FSRS card over to the new card id.
5. `db.ts`: version 2 schema, upgrade path that runs the migration once, keeps the `entries` store, and stores a v1 JSON backup in `meta` before writing anything.
6. Import: PGN and Lichess study both create **one deck per chapter**. Send `?orientation=true`. The chapter id comes from the `ChapterURL` tag. Before building, check what the export returns for an unlisted study and for a private one without a token, and give the user a clear message in each case. Importing a chapter that was imported before (same `studyId` and `chapterId`) updates that deck: add new edges, fill signs, notes and shapes only where the deck has none, never delete a move, never change an existing main move, keep FSRS state, never duplicate. List every difference in the import message.
7. Port `meet.ts` to a lookup `ownMoves(color, fenKey): string[]` across all decks of that colour, main moves first. `MeetPanel` keeps working in the Report view.
8. Adapt `views/Library.tsx` just enough to run on the new model: pick a deck instead of a colour. No redesign yet.
9. Lazy-load the Library with `React.lazy` so the Spar and Match bundles do not grow.

Tests: parser (variations, comments, shapes, NAGs, junk), serializer round trip, line enumeration with a transposition and a cycle, card identity (shared, conflicting, main move changed, orphan removed), migration from a v1 fixture, re-import without duplicates.

Done when: an existing v1 library opens with the same cards and due dates; a study import shows chapter names and keeps notes; export then import gives the same deck.

### Phase 2 — Build from games, shelf, deck view, starter openings

Status 2026-11-16: Phases 0, 1 and 2 are merged (`2955744`). Phase 3 is built on `feat/library-phase-3`.

Order inside this phase: **build a deck from my games first**, so Adam can load his own repertoire (he plays blitz on chess.com). Then the shelf, the deck view and the starter openings.

**Your library (start page, design B)**

```
Your library                                        [Train all 23] [+ Add]
9 openings · 214 moves · 23 to review today
(All | White | Black)   Most due first                  Insights  Settings

[ deck ] [ deck ] [ deck ]        row 1
[ deck ] [ deck ] [ deck ]        row 2
              [ Show 3 more v ]
--------------------------------------------------------------------------
Start from a classic                                   1–3 of 8   [<] [>]
Eight common openings with the main ideas explained.
[ starter ] [ starter ] [ starter ]
```

- At most **three cards per row**. The first six decks show (two rows). "Show 3 more" reveals three more each time (9, 12, 15 …); when everything is shown it becomes "Show less".
- Order: most due first, then most recently trained. Filter All, White, Black.
- Deck card: small board with the deck's signature position (the end of the moves all lines share), turned for Black; colour; name; "38 moves · from Lichess study"; a bar with percent learned; due count; **Train** (primary when something is due) and **Open**.
- Small boards are a static `MiniBoard` component. Do not mount a Chessground instance per card.
- A divider, then **Start from a classic**: three starters visible, left and right arrow buttons page through all eight, with "1–3 of 8". Starter card: board, colour, name, one-line pitch, "14 moves with the ideas explained", **Add to my library** and **Preview**. A starter that is already in the library shows "In your library" and **Open**.
- **+ Add** opens a small dialog: Lichess study link, PGN, **build from my games**, play on the board, restore backup.
- Empty library: the shelf shows a short welcome that points at the starters and at + Add.
- Widths: three columns from 960 px, two from 640 px, one below. Below 640 px the starter row scrolls sideways with scroll snap; the arrows still work.

**Starter openings** live in `src/rep/starters/*.pgn`, one file each, with tags `Event`, `Orientation`, `Pitch`.

| White | Black |
|---|---|
| Italian Game | Sicilian Defence |
| Ruy Lopez | French Defence |
| London System | Caro-Kann Defence |
| Queen's Gambit | King's Indian Defence |

Content rules: main lines only, at most ten moves deep, three to five opponent replies chosen for how often club players meet them, every line ends on the user's move, every own move has a one-sentence note (at most 140 characters) that explains the idea. No sharp gambit lines.
A test checks that each file parses, every move is legal, each own position has exactly one main move, depth is within the limit, and every own move has a note.
**The chess content needs a human check.** Tests catch illegal moves, not bad ones. List every line in the phase report so Adam can play through each starter before merging.

**Build a deck from my games** (`model/fromGames.ts`, pure and tested)

For players who have no written repertoire. It turns what the user actually plays into decks they can then correct.

- Input: site (chess.com or Lichess), username, colour (White and Black by default), time classes (a multi-select; the class with the most games in the window is preselected), the newest 500 games, at most 36 months back. Both limits can be changed. Lichess fetches at most 1,000 games in the window. Reuse the fetch pipeline in `src/lib/sources.ts`. chess.com needs no login.
- Count, for every position reached, each move played, the number of games and the user's score.
- **Own moves:** the most played move is the main move. Other moves played in at least 20% of the games from that position, and at least 3 times, become alternatives.
- **Opponent replies:** up to four, each played in at least 5% of the games from that position and at least 3 times.
- **Depth:** at most 10 full moves, and stop where fewer than 3 games reach.
- **Decks:** group by opening family (the name before the colon, from the openings map). A family gets its own deck with at least 10 games and at least 5% of that colour's games; the rest goes into "Other lines as White" or "… as Black". Each deck's tree is built from its own games. The `games` source stores the family in `opening`, so a rebuild finds the deck even after a rename.
- **Preview before saving:** the tree with the number of games and the user's score next to every own move, so a move that scores badly is visible before it becomes a card. The user can untick decks and change a main move in the preview.
- Building again later updates the same decks (matched on `source` and `opening`): add new moves, keep signs, notes and FSRS state, never duplicate. A main move is never changed automatically. When the user now plays another move more often, the preview says "You now play X more often than your main move Y" with a **Make X my main move** button.
- Nothing is uploaded. Games are fetched in the browser and only the counted opening moves are kept.
- Tests: thresholds, main move choice, transposition, colour handling, re-build without duplicates, an empty or tiny game list.

**Deck view (Open, design C)**

```
<- Your library     Italian Game: Giuoco Piano   White · 38 moves · 62% learned
[ board, interactive ]              Moves (tree)
[Back] [Forward] [Train] [Export]   1.e4 e5 2.Nf3 Nc6 3.Bc4!
                                      3…Bc5 4.c3 Nf6 5.d4
                                      3…Nf6 4.d3 Be7 5.O-O
                                    ---------------------------------
                                    3.Bc4   your main move
                                    [!!] [!] [!?] [?!] [?] [??]
                                    Note: ______________________
                                    [Make main] [Remove move]
```

- Playing a move on the board adds it to the deck (replaces today's Build mode). Opponent moves can be added without a reply.
- Selecting a move shows its sign buttons (toggle), note, main or alternative control, and remove (with its continuation, after a confirm).
- Arrows and circles drawn on the board (Chessground drawing) are saved on the selected move.
- Signs show in the tree next to the move. Own moves bold, alternatives italic, dot for card state (new, due, learned), as in `RepTree` today.
- Header: rename deck, default start move, Export PGN, Delete deck.
- Preview of a starter is this view, read-only.
- Phone: board on top, tree and details below.

Routing inside the Library, all reload-safe and working with Back: `/#library`, `/#library/deck/<id>`, `/#library/train/<id>`, `/#library/insights`, `/#library/settings`.

README: add a Library section (no screenshot: Adam decided to skip it, 2026-11-16). Adam approves the wording, including one sentence that the project is built with AI assistance and that architecture and decisions are his.

### Phase 3 — Training v2

```
<- Your library
[ board, your side at the bottom ]     OPENING  [ Caro-Kann: Advance v ]
                                       (Full lines | Positions)
                                       Start at move  [-] 3 [+]
                                       [x] Remember for this opening
Line 2 of 5 · 4 moves left  [====  ]   THIS LINE
                                       1.e4 c6 2.d4 d5 3.e5   played for you
                                       +-- feedback ------------------+
                                       | 3…Bf5 !  Correct, your main  |
                                       | Develop the bishop before …  |
                                       | Also in your book: 3…c5      |
                                       +------------------------------+
                                       [Continue] [Add a move here]
```

Write the session as a **pure reducer** in `model/session.ts`: `step(state, event) → state`, with events for start, autoplay tick, user move, hint, show move, try again, add as alternative, make main, continue, add a move here, switch deck, change start move, change mode. The React view only renders state and sends events. Test the reducer, not the DOM.

Full lines mode:

1. Lines of the deck that contain at least one card due now, or new and inside today's budget, at or after `startMove`. Most due first.
2. Moves before the first asked move are played automatically (`autoplayMs` each, instantly with reduced motion). Every opponent move is played automatically.
3. At the user's move:
   - **Due card, right first time:** Good. **After a hint** (the piece to move is highlighted): Hard. **Show move, or Try again after a wrong move:** Again. After two failed tries the move is shown with an arrow.
   - **New card:** teach it. Label "New", show the arrow and the note first, the user plays it, rate Good.
   - **New card beyond today's budget:** played automatically, labelled "Later".
   - **Card not due:** played by the user, not graded when right. When wrong, grade Again.
   - A card is graded at most once per session.
4. After a correct move show the sign, the note, the arrows, and "Also in your book here: …" when alternatives exist.
5. Several own moves at one position: any of them is correct. Follow the move the user played if a line continues that way. Otherwise say which move this line uses and continue with it.
6. A legal move that is not in the book opens the off-book panel:
   - **Try again**: takes the move back; counts as a miss.
   - **Add as alternative**: adds the edge with the next rank; card ungraded.
   - **Make it my main move**: re-ranks, applies the card identity rule; ungraded.
7. End of a line: "End of this line" with **Next line** and **Add what comes next**. The second lets the user play the opponent's move and their own reply on the same board; both are saved to this deck and training resumes.
8. **Add a move here** is always available and does the same from the current position.
9. `startMove` larger than a line allows is clamped so the last own move of the line is still asked.

Positions mode: the queue of due cards of the deck at or after `startMove`. Show the position, with the path to it as context. Same grading and the same off-book panel.

Other points:

- Deck switcher beside the board lists all decks with due counts. Switching ends the current session cleanly.
- "Train all" on the shelf runs the decks one after another, most due first.
- Changing start move with "Remember for this opening" ticked saves it on the deck.
- Every graded answer appends a `Review` row.
- Keyboard: Enter or Space for Continue, H for hint. Buttons at least 44 px. On a phone the Continue button stays reachable without scrolling.
- Check promotion: `Board`'s `onMove` must give a full UCI move including the promotion piece.

**After-move panel** (asked for by Adam during Phase 2, 2026-11-16):

- After every move of the user's, right or wrong, the panel shows **"Stockfish's recommendation: X"** with a **Show** button that draws that move on the board as a blue arrow.
- The recommendation comes from **Lichess's cloud evaluation** (`GET https://lichess.org/api/cloud-eval?fen=…`), not from an engine in the browser. Checked 2026-11-16: it answers from the browser with CORS for common opening positions. When it has no answer, say "No evaluation available for this position". Castling arrives as king-to-rook (`e8h8`); convert it to normal UCI. One request per position, cached in the `cache` store, nothing sent but the FEN.
- A setting turns the engine lookup off (it adds a short wait). Default: on.
- The panel can also list **the other library moves in this position**, each with the opening name it leads to (from the openings map), so the user can study the options on the board.
- **Pause after each move:** with this setting on, training does not move on after a correct move; the user studies the panel and presses Continue. With it off, training moves on as before. A second setting shows or hides the other library moves.
- The engine lookup and both settings live in Settings (Phase 5 builds the page; Phase 3 adds the switches beside the board).

Tests (reducer): each grading rule above, once-per-session, off-book choices, alternative handling, start move clamp, Black deck autoplay of move one, new-card budget, end-of-line extension, pause after move on and off, engine answer and no answer.

### Phase 4 — Share to Lichess

- **Export PGN** (download and copy) for a deck or the whole library already exists from phase 2. Add **Send to Lichess**.
- Ask for the OAuth scope `study:write` only when the user presses Send to Lichess. Keep that token apart from the match hub login, which asks for no scopes (`src/live/lichessAuth.ts`).
- Flow: choose decks, then a new study (name defaults to "Shadowbook – <date>") or one of the user's studies. Each deck becomes one chapter through `POST /api/study/{studyId}/import-pgn` with the deck name and orientation.
- A study holds at most 64 chapters: check before sending and say so.
- Sending again creates new chapters. Say that in the dialog. No sync.
- Check the exact request fields and CORS behaviour against https://lichess.org/api#tag/Studies before building. If creating a study from the browser is not possible, stop and ask.

### Phase 5 — Settings and statistics

- Settings: new cards per day (5–50), target retention (0.80–0.95), default training mode, autoplay speed, reset progress for a deck, backup and restore.
- Insights, part one, from the `reviews` log: reviews today and streak; due forecast for the next 14 days; retention over the last 30 days; the cards missed most often, each with a Train button; a table per deck. Charts are plain SVG. No chart library.

### Phase 6 — Your games against your book

- The user enters a Lichess or chess.com username (prefilled from the Lichess login). Reuse the existing fetch pipeline in `src/lib/sources.ts`.
- For every game, walk the moves against the decks of the colour the user had. Record the first point where either
  - **you had a move and played another** ("You forgot your move"), or
  - **the opponent played a move your book has no answer to** ("No move ready").
- Group by position: how often, the user's score from there, the most recent date.
- **Habits that cost you** is the third list and the most important one: a move the user has played at least 3 times in the same position, and that is weak. It does not need the position to be in the book.
  - *Weak by results:* the user's score after the move is clearly below their score with other moves from the same position, or clearly below 50% over at least 8 games. Always available.
  - *Weak by evaluation:* the evaluation drops by a clear margin (start with 0.7 pawns) compared with the best move. Before building, check whether Lichess's cloud evaluation endpoint can be called from the browser for opening positions, what its limits are, and how often it has no answer. If it cannot be used, ship results only and say so in the phase report. Running an engine in the browser stays out of scope.
  - Each row: the position on a small board, the move the user keeps playing, how many times, the score from there, the better move when one is known, and the most recent date. Sorted by how many points it has cost.
  - Actions: **Fix it** (sets the better move as the main move in the right deck, keeps the old one off the accepted list, and creates the card as New) and **Train this position**.
  - Wording is plain and kind: "You have played 6.h3 here 14 times and scored 29%."
- Insights shows all three lists. For the first two, each row: the line, the count, the score, and **Train this position** or **Add a move** (opens the deck view at that position).
- Stored games are truncated to the opening (`KEEP_PLIES`), which is enough.

### Phase 7 — Gaps at your level

- For each book position where the opponent is to move, ask the Lichess opening explorer which replies are common in the user's rating range, and flag replies the book has no answer to. Rank by how likely the position is to be reached times how often the reply is played.
- **The explorer requires an OAuth token on every request** (Lichess announcement: https://lichess.org/@/thibault/blog/the-opening-explorer-now-requires-authentication/FSWh9Zg3). So this feature needs the Lichess login. Confirm the current host, parameters and whether the browser may call it with a token before building.
- Be a polite client: one request at a time, results cached in the `cache` store for 30 days, a cap per run, back off on 429.
- If the browser cannot call the explorer directly, stop and ask. Routing it through the Supabase function is a decision for Adam.

---

## 6. Design rules

- Clean and quiet. One primary button per view. No decoration that does not carry information.
- Use the existing CSS variables in `src/styles.css` and the Spar tab's fonts. Library styles stay in `src/rep/rep.css`.
- Real `<button>`, `<a>`, `<select>`, `<label>`. Icon-only buttons get an `aria-label`. Text contrast at least 4.5:1. State is never shown by colour alone.
- Respect `prefers-reduced-motion`.
- If `docs/design/*.png` exist, they are the visual reference (exports of the design canvas: B shelf, C deck view, D and E training).

## 7. Out of scope

Accounts and sync for the Library, running a chess engine in the browser (looking up existing evaluations through Lichess's cloud evaluation is allowed, in Phase 3 and Phase 6), decks from custom start positions, two-way sync with Lichess, position assessment symbols beyond keeping them on export.

## 8. Risks

| Risk | Guard |
|---|---|
| Migration loses a library | Pure migration function with tests, v1 store kept, v1 backup saved before the upgrade |
| Wrong grading quietly ruins schedules | Session reducer with a test per rule |
| Starter openings teach poor moves | Human review of every line before merge |
| A deck built from games teaches the user's bad habits | Score shown per move in the preview; Phase 6 lists the habits that cost points |
| Too few games make "weak move" a guess | Minimum counts on every rule, and the count is always shown |
| chess.com and Lichess ratings are different scales (Phase 7) | Let the user pick the rating range instead of converting |
| Lichess API differs from this plan | Phase 0 and the "check before building" steps |
| Bundle grows for Spar and Match users | Library and openings data are lazy-loaded |
