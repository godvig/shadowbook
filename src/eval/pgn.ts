// The moves of a broadcast PGN with what the broadcast attaches to each: clock, [%eval] and NAG glyphs.
// The Lichess round export carries [%clk] and, when the source has them, [%eval] comments by default
// (clocks=true, comments=true in its API spec); NAGs ($1…$6) are read if present.
import { Chess } from 'chess.js';
import { START_FEN } from '../lib/chess';
import type { Mark } from './marks';
import type { Score } from './types';

export interface GameMove {
  san: string;
  uci: string;
  /** Position after the move. */
  fen: string;
  /** Clock of the side that moved, "1:59:51" (leading "0:" dropped). */
  clock?: string;
  /** [%eval] after the move, from White's side. */
  eval?: Score;
  /** A glyph from the PGN itself ($1–$6, or ! ? written after the move). */
  nag?: Mark;
}

const NAGS: Record<string, Mark> = { $1: '!', $2: '?', $3: '!!', $4: '??', $5: '!?', $6: '?!' };
const SUFFIX = /(\?\?|!!|\?!|!\?|!|\?)$/;

/** "[%eval 0.23]" → { cp: 23 }, "[%eval #-3]" → { mate: -3 }. */
export function parseEvalComment(comment: string): Score | undefined {
  const m = comment.match(/\[%eval\s+(#?)(-?\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  const n = Number(m[2]);
  return m[1] ? { mate: Math.trunc(n) } : { cp: Math.round(n * 100) };
}

/** The main line only; variations in parentheses are skipped. Stops at the first move chess.js does not accept. */
export function parseGame(pgn: string): GameMove[] {
  const body = pgn.replace(/^\[.*\]\s*$/gm, '');
  const chess = new Chess(START_FEN);
  const out: GameMove[] = [];
  let depth = 0;
  for (const t of body.match(/\{[^}]*\}|\(|\)|;[^\n]*|[^\s{}()]+/g) ?? []) {
    if (t === '(') depth++;
    else if (t === ')') depth = Math.max(0, depth - 1);
    if (depth > 0 || t === ')' || t.startsWith(';')) continue;
    const last = out.at(-1);
    if (t.startsWith('{')) {
      if (!last) continue;
      const clk = t.match(/\[%clk\s+([\d:.]+)/);
      if (clk) last.clock = clk[1].replace(/\.\d+$/, '').replace(/^0:/, '');
      last.eval ??= parseEvalComment(t);
      continue;
    }
    if (NAGS[t]) {
      if (last) last.nag = NAGS[t];
      continue;
    }
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t) || /^\$\d+$/.test(t)) continue;
    const word = t.replace(/^\d+\.+/, '');
    if (!word) continue;
    const glyph = word.match(SUFFIX)?.[1] as Mark | undefined;
    let m;
    try {
      m = chess.move(word.replace(SUFFIX, ''));
    } catch {
      break;
    }
    out.push({ san: m.san, uci: m.from + m.to + (m.promotion ?? ''), fen: chess.fen(), ...(glyph ? { nag: glyph } : {}) });
  }
  return out;
}
