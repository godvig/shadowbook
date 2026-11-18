import { describe, expect, it } from 'vitest';
import { sansToUcis } from '../../lib/chess';
import { addPath, newDeck } from './deck';
import { lineThrough } from './lines';

const deck = newDeck({ name: 'Test', color: 'w', source: { kind: 'board' } });
let edges = addPath([], deck, sansToUcis(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3']));
edges = addPath(edges, deck, sansToUcis(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3']));
edges = addPath(edges, deck, sansToUcis(['e4', 'e5', 'Nf3', 'd6', 'd4']));
const sans = (r: ReturnType<typeof lineThrough>) => r.moves.map((e) => e.san);

describe('one line at a time', () => {
  it('shows the main line from the start when nothing is selected', () => {
    expect(sans(lineThrough(edges, []))).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3']);
  });

  it('follows the selected move, then the main moves after it to the end', () => {
    expect(sans(lineThrough(edges, sansToUcis(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'])))).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3']);
    expect(sans(lineThrough(edges, sansToUcis(['e4', 'e5', 'Nf3', 'd6'])))).toEqual(['e4', 'e5', 'Nf3', 'd6', 'd4']);
  });

  it('stops where a line comes back to a position it has passed', () => {
    const loop = addPath([], deck, sansToUcis(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3']));
    const r = lineThrough(loop, []);
    expect(sans(r)).toEqual(['Nf3', 'Nf6', 'Ng1', 'Ng8']);
    expect(r.repeats).toBe(true);
  });
});
