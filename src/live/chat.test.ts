import { describe, expect, it } from 'vitest';
import { mentions, reactionsByMessage, segments } from './chat';

describe('chat helpers', () => {
  it('counts reactions per message and marks mine', () => {
    const m = reactionsByMessage(
      [
        { message_id: 1, lichess_id: 'a', glyph: '?' },
        { message_id: 1, lichess_id: 'b', glyph: '!!' },
        { message_id: 1, lichess_id: 'me', glyph: '!!' },
        { message_id: 2, lichess_id: 'a', glyph: '½' },
      ],
      'me',
    );
    expect(m.get(1)).toEqual([
      { glyph: '!!', count: 2, mine: true },
      { glyph: '?', count: 1, mine: false },
    ]);
    expect(m.get(2)).toEqual([{ glyph: '½', count: 1, mine: false }]);
  });

  it('finds @mentions but not e-mail addresses', () => {
    expect(segments('nice one @Bishop_Bjorn!')).toEqual([{ text: 'nice one ' }, { text: '@Bishop_Bjorn', mention: 'bishop_bjorn' }, { text: '!' }]);
    expect(segments('@knight-owl agreed')[0]).toEqual({ text: '@knight-owl', mention: 'knight-owl' });
    expect(segments('mail me at a@b.com')).toEqual([{ text: 'mail me at a@b.com' }]);
    expect(mentions('gg @bishop_bjorn', 'Bishop_Bjorn')).toBe(true);
    expect(mentions('gg', 'Bishop_Bjorn')).toBe(false);
  });
});
