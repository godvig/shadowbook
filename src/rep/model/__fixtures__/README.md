# PGN fixtures

Synthetic test data for the Library PGN parser. All names, comments and lines are made up. Do not add real studies.

- `study-multi-chapter.pgn` follows the shape of a Lichess study export (`GET /api/study/{id}.pgn`, checked 2026-11-16):
  tag order, chapters separated by two blank lines, an intro comment before the first move, several `{ }` blocks
  after one move, `[%clk]`, `[%eval]`, `[%anno]`, `[%csl]` and `[%cal]` (also back to back in one block), signs as
  move suffixes, position NAGs such as `$14` and `$132`, nested variations, a transposition (chapter 3), a default
  chapter name ("Chapter 3"), and a custom-position chapter (`FEN`, `SetUp`, `ChapterMode "gamebook"`).
  A single-chapter export (`/api/study/{id}/{chapterId}.pgn`) is the same text as one chapter of this file.
- `junk.pgn` is hand-written PGN as people paste it: `;` comments, `1.e4` without spaces, `0-0`, NAGs `$1`–`$6` and
  unknown ones, a broken tag, an illegal move, a null move `--`, unbalanced parentheses and an unclosed comment.
