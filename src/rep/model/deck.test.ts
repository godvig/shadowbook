import { describe, expect, it } from 'vitest';
import { sansToUcis, START_FEN } from '../../lib/chess';
import { addPath, newDeck, signatureFen, START_KEY, updateEdge } from './deck';

const deck = newDeck({ name: 'Test', color: 'w', source: { kind: 'board' } });

describe('deck helpers', () => {
  it('finds the position where the shared moves end', () => {
    let edges = addPath([], deck, sansToUcis(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']));
    expect(signatureFen(edges)).toBe(edges.at(-1)!.toFen);
    edges = addPath(edges, deck, sansToUcis(['e4', 'e5', 'Nf3', 'Nf6']));
    // Both lines share 1.e4 e5 2.Nf3.
    expect(signatureFen(edges)).toBe(edges.find((e) => e.san === 'Nf3')!.toFen);
    expect(signatureFen([])).toBe(START_FEN);
  });

  it('edits one move and leaves the rest', () => {
    const edges = addPath([], deck, sansToUcis(['e4', 'e5']));
    const next = updateEdge(edges, START_KEY, 'e2e4', { glyph: '!', comment: 'Best by test' });
    expect(next[0]).toMatchObject({ glyph: '!', comment: 'Best by test' });
    expect(next[1]).toBe(edges[1]);
  });
});
