// The small marks next to a move: its sign, in Lichess's colours, and its card's state.
import { State } from 'ts-fsrs';
import type { Card, Glyph } from './model/types';

export const GLYPHS: Glyph[] = ['!!', '!', '!?', '?!', '?', '??'];
export const GLYPH_NAMES: Record<Glyph, string> = { '!!': 'Brilliant', '!': 'Good', '!?': 'Interesting', '?!': 'Dubious', '?': 'Mistake', '??': 'Blunder' };
const GLYPH_CLASS: Record<Glyph, string> = { '!!': 'brilliant', '!': 'good', '!?': 'interesting', '?!': 'dubious', '?': 'mistake', '??': 'blunder' };

export function GlyphMark({ glyph }: { glyph?: Glyph }) {
  return glyph ? (
    <span className={`glyph ${GLYPH_CLASS[glyph]}`} title={GLYPH_NAMES[glyph]}>
      {glyph}
    </span>
  ) : null;
}

export type CardState = 'new' | 'due' | 'ok';
export const CARD_STATES: Record<CardState, string> = { new: 'Not learned yet', due: 'Due for review', ok: 'Learned' };

export const cardState = (c: Card, now: Date): CardState => (c.fsrs.state === State.New ? 'new' : c.fsrs.due <= now ? 'due' : 'ok');

export function CardDot({ card, now }: { card?: Card; now: Date }) {
  if (!card) return null;
  const st = cardState(card, now);
  return <span className={`dot ${st}`} title={CARD_STATES[st]} />;
}
