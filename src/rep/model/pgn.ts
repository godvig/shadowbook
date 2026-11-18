// PGN in and out for decks. Reads what Lichess studies export (several comment blocks per move, signs as move
// suffixes, [%cal]/[%csl] shapes, clocks) as well as hand-written PGN, and never throws on junk.
import { Chess } from 'chess.js';
import { fenKey, START_FEN } from '../../lib/chess';
import { childrenOf, START_KEY, turnOf } from './deck';
import type { Brush, Color, Deck, Edge, Glyph, Shape } from './types';

/** A move as read from PGN, before it belongs to a deck. `rank` is its order among moves from `from` in this game. */
export type ParsedEdge = Omit<Edge, 'deckId' | 'mine'>;

export interface ParsedGame {
  tags: Record<string, string>;
  /** ChapterName, unless it is a Lichess default ("Chapter 3"). */
  name?: string;
  orientation: Color | null;
  intro?: string;
  /** False when the game starts from a custom position: such games have no edges. */
  fromStart: boolean;
  edges: ParsedEdge[];
  skipped: {
    /** Variations cut short at a null move (--). */
    nullMoves: number;
    /** Tokens that were not a legal move where they stood. */
    illegal: number;
  };
}

const NAG_GLYPH: Record<number, Glyph> = { 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!' };
const GLYPH_NAG: Record<Glyph, number> = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };
const BRUSH: Record<string, Brush> = { G: 'green', R: 'red', B: 'blue', Y: 'yellow' };
const BRUSH_LETTER: Record<Brush, string> = { green: 'G', red: 'R', blue: 'B', yellow: 'Y' };
const RESULT = /^(1-0|0-1|1\/2-1\/2|\*)$/;
const TAG = /^\s*\[([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/;
const DEFAULT_CHAPTER = /^Chapter \d+$/;

/** Splits text into games: tag lines start a new game once the previous one has move text. Comments are respected. */
function splitGames(text: string): { tags: Record<string, string>; body: string }[] {
  const games: { tags: Record<string, string>; body: string }[] = [];
  let cur: { tags: Record<string, string>; body: string } | null = null;
  let inComment = false;
  let hasMoves = false;
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!inComment && /^\s*\[[A-Za-z0-9_]+\s/.test(line)) {
      if (!cur || hasMoves) {
        cur = { tags: {}, body: '' };
        games.push(cur);
        hasMoves = false;
      }
      const m = line.match(TAG);
      if (m) cur.tags[m[1]] = m[2].replace(/\\(.)/g, '$1');
      continue;
    }
    if (!inComment && line.startsWith('%')) continue; // PGN escape line
    if (!cur) {
      cur = { tags: {}, body: '' };
      games.push(cur);
    }
    cur.body += line + '\n';
    if (line.trim()) hasMoves = true;
    for (const ch of line) {
      if (inComment) {
        if (ch === '}') inComment = false;
      } else if (ch === '{') inComment = true;
      else if (ch === ';') break;
    }
  }
  return games.filter((g) => g.body.trim() || Object.keys(g.tags).length);
}

type Token = { t: 'comment'; text: string } | { t: '(' } | { t: ')' } | { t: 'word'; text: string };

function tokenize(body: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (/\s/.test(ch)) i++;
    else if (ch === '{') {
      const end = body.indexOf('}', i + 1);
      out.push({ t: 'comment', text: body.slice(i + 1, end < 0 ? body.length : end) });
      i = end < 0 ? body.length : end + 1;
    } else if (ch === ';') {
      const end = body.indexOf('\n', i);
      out.push({ t: 'comment', text: body.slice(i + 1, end < 0 ? body.length : end) });
      i = end < 0 ? body.length : end;
    } else if (ch === '(' || ch === ')') {
      out.push({ t: ch });
      i++;
    } else {
      let j = i;
      while (j < body.length && !/[\s{}();]/.test(body[j])) j++;
      // A stray closing brace is a junk character of its own.
      out.push({ t: 'word', text: body.slice(i, Math.max(j, i + 1)) });
      i = Math.max(j, i + 1);
    }
  }
  return out;
}

/** Splits a comment into its text and shapes. Every [%…] command other than csl and cal is dropped. */
export function readComment(raw: string): { text: string; shapes: Shape[] } {
  const shapes: Shape[] = [];
  const text = raw.replace(/\[%(\w+)([^\]]*)\]/g, (_, cmd: string, args: string) => {
    if (cmd === 'csl') for (const m of args.matchAll(/([GRBY])([a-h][1-8])\b/g)) shapes.push({ orig: m[2], brush: BRUSH[m[1]] });
    if (cmd === 'cal') for (const m of args.matchAll(/([GRBY])([a-h][1-8])([a-h][1-8])/g)) shapes.push({ orig: m[2], dest: m[3], brush: BRUSH[m[1]] });
    return ' ';
  });
  return { text: text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim(), shapes };
}

const join = (a: string | undefined, b: string) => (a ? `${a}\n\n${b}` : b);

/** Reads one or many games. */
export function parsePgn(text: string): ParsedGame[] {
  return splitGames(text).map(({ tags, body }) => parseGame(tags, body));
}

function parseGame(tags: Record<string, string>, body: string): ParsedGame {
  const o = (tags.Orientation ?? '').toLowerCase();
  const chapter = tags.ChapterName?.trim();
  const game: ParsedGame = {
    tags,
    name: chapter && !DEFAULT_CHAPTER.test(chapter) ? chapter : undefined,
    orientation: o === 'white' ? 'w' : o === 'black' ? 'b' : null,
    fromStart: true,
    edges: [],
    skipped: { nullMoves: 0, illegal: 0 },
  };
  if (tags.FEN) {
    try {
      game.fromStart = fenKey(new Chess(tags.FEN).fen()) === START_KEY;
    } catch {
      game.fromStart = false;
    }
    if (!game.fromStart) return game;
  }

  const byKey = new Map<string, ParsedEdge>();
  const siblings = new Map<string, number>();
  // fen: position before the next move; before: position before the last move; last: the last move; dead: cut short.
  type Frame = { fen: string; before: string | null; last: ParsedEdge | null; dead: boolean };
  let cur: Frame = { fen: START_FEN, before: null, last: null, dead: false };
  const stack: Frame[] = [];
  let started = false;

  for (const tok of tokenize(body)) {
    if (tok.t === '(') {
      stack.push(cur);
      cur = { fen: cur.before ?? cur.fen, before: null, last: null, dead: cur.dead || cur.before === null };
      continue;
    }
    if (tok.t === ')') {
      if (stack.length) cur = stack.pop()!;
      else game.skipped.illegal++;
      continue;
    }
    if (tok.t === 'comment') {
      const { text, shapes } = readComment(tok.text);
      if (!started && !stack.length) {
        if (text) game.intro = join(game.intro, text);
      } else if (cur.last && !cur.dead) {
        // The same move can be written twice (a transposition); its comment then appears twice as well.
        if (text && !cur.last.comment?.split('\n\n').includes(text)) cur.last.comment = join(cur.last.comment, text);
        for (const s of shapes) {
          if (!cur.last.shapes?.some((x) => x.orig === s.orig && x.dest === s.dest && x.brush === s.brush)) cur.last.shapes = [...(cur.last.shapes ?? []), s];
        }
      }
      continue;
    }
    let word = tok.text;
    if (RESULT.test(word)) continue;
    const nag = word.match(/^\$(\d+)$/);
    if (nag) {
      const n = Number(nag[1]);
      if (cur.last && !cur.dead) {
        if (NAG_GLYPH[n]) cur.last.glyph ??= NAG_GLYPH[n];
        else if (!cur.last.nags?.includes(n)) cur.last.nags = [...(cur.last.nags ?? []), n];
      }
      continue;
    }
    word = word.replace(/^\d+\.+/, '');
    if (!word || /^\d+$/.test(word)) continue; // a bare move number
    if (cur.dead) continue;
    if (word === '--' || word === 'Z0' || word === '0000') {
      game.skipped.nullMoves++;
      cur.dead = true;
      continue;
    }
    const sign = word.match(/(!!|\?\?|!\?|\?!|!|\?)$/);
    const san = word.slice(0, sign ? -sign[1].length : undefined).replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
    const chess = new Chess(cur.fen);
    let move;
    try {
      move = chess.move(san);
    } catch {
      game.skipped.illegal++;
      continue;
    }
    started = true;
    const from = fenKey(cur.fen);
    const uci = move.from + move.to + (move.promotion ?? '');
    let edge = byKey.get(`${from}|${uci}`);
    if (!edge) {
      const rank = siblings.get(from) ?? 0;
      siblings.set(from, rank + 1);
      edge = { from, uci, san: move.san, to: fenKey(chess.fen()), toFen: chess.fen(), rank };
      byKey.set(`${from}|${uci}`, edge);
      game.edges.push(edge);
    }
    if (sign) edge.glyph ??= sign[1] as Glyph;
    cur = { fen: chess.fen(), before: cur.fen, last: edge, dead: false };
  }
  return game;
}

// ---------- Serialize ----------

const escapeTag = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function commentOf(e: Pick<Edge, 'comment' | 'shapes'>): string {
  const circles = (e.shapes ?? []).filter((s) => !s.dest).map((s) => BRUSH_LETTER[s.brush] + s.orig);
  const arrows = (e.shapes ?? []).filter((s) => s.dest).map((s) => BRUSH_LETTER[s.brush] + s.orig + s.dest);
  const cmds = (circles.length ? `[%csl ${circles.join(',')}]` : '') + (arrows.length ? `[%cal ${arrows.join(',')}]` : '');
  // A closing brace would end the comment early.
  const text = (e.comment ?? '').replace(/}/g, ')');
  return cmds || text ? `{ ${[cmds, text].filter(Boolean).join(' ')} }` : '';
}

/**
 * Writes a deck as one PGN game: main move first, alternatives and other replies as variations. Each position is
 * written out once; a line that transposes into a position already written ends there.
 */
export function serializeDeck(deck: Pick<Deck, 'name' | 'color' | 'intro' | 'source'>, edges: Iterable<Edge>, opts: { studyTags?: boolean } = {}): string {
  const kids = childrenOf(edges);
  const expanded = new Set<string>();
  const out: string[] = [];
  const move = (e: Edge, ply: number, numbered: boolean) => {
    const n = Math.floor(ply / 2) + 1;
    const num = turnOf(e.from) === 'w' ? `${n}. ` : numbered ? `${n}... ` : '';
    const nags = [...(e.glyph ? [GLYPH_NAG[e.glyph]] : []), ...(e.nags ?? [])].map((x) => ` $${x}`).join('');
    const c = commentOf(e);
    return `${num}${e.san}${nags}${c ? ' ' + c : ''}`;
  };
  // Writes the continuation from `key`; `numbered` forces a move number on a Black move.
  const line = (key: string, ply: number, numbered: boolean, into: string[]) => {
    const next = kids.get(key);
    if (!next?.length || expanded.has(key)) return;
    expanded.add(key);
    const [main, ...alts] = next;
    into.push(move(main, ply, numbered));
    for (const alt of alts) {
      const v = [move(alt, ply, true)];
      line(alt.to, ply + 1, !!commentOf(alt), v);
      into.push(`(${v.join(' ')})`);
    }
    line(main.to, ply + 1, alts.length > 0 || !!commentOf(main), into);
  };
  line(START_KEY, 0, true, out);
  // A deck from a Lichess chapter keeps its study tags, so importing the file again updates the same deck. A copy
  // sent to a new study leaves them out (studyTags: false), so it is not tied to the study it came from.
  const study = deck.source.kind === 'lichess' && deck.source.chapterId && opts.studyTags !== false ? deck.source : null;
  const tags = [
    ['Event', deck.name],
    ['Site', 'https://shadowbook.godvig.com'],
    ...(study?.studyName ? [['StudyName', study.studyName]] : []),
    ['ChapterName', deck.name],
    ...(study ? [['ChapterURL', study.url]] : []),
    ['Orientation', deck.color === 'w' ? 'white' : 'black'],
    ['Result', '*'],
  ].map(([k, v]) => `[${k} "${escapeTag(v)}"]`);
  const intro = deck.intro ? `{ ${deck.intro.replace(/}/g, ')')} } ` : '';
  return `${tags.join('\n')}\n\n${intro}${[...out, '*'].join(' ')}\n`;
}
