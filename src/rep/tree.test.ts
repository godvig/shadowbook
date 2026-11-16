import { describe, expect, it } from 'vitest';
import { sansToUcis } from '../lib/chess';
import { syncCards } from './model/cards';
import { addPath, newDeck } from './model/deck';
import { buildTree, countNodes } from './tree';

describe('tree', () => {
  it('builds branches from the deck with your main move first and marks transpositions', () => {
    const deck = newDeck({ name: 'Deck', color: 'w', source: { kind: 'board' } });
    let edges = addPath([], deck, sansToUcis(['e4', 'e5', 'Nf3']));
    edges = addPath(edges, deck, sansToUcis(['e4', 'c5', 'Nf3']));
    edges = addPath(edges, deck, sansToUcis(['e4', 'c5', 'Nc3']));
    edges = addPath(edges, deck, sansToUcis(['d4', 'Nf6', 'c4', 'e6']));
    edges = addPath(edges, deck, sansToUcis(['d4', 'e6', 'c4', 'Nf6']));
    const cards = new Map(syncCards([deck], edges, []).cards.map((c) => [c.id, c]));
    const t = buildTree(deck, edges, cards);
    expect(t.map((n) => [n.san, n.main])).toEqual([['e4', true], ['d4', false]]);
    expect(t[0].card).toBeDefined();
    expect(t[0].children.map((c) => [c.san, c.mine])).toEqual([['e5', false], ['c5', false]]);
    expect(t[0].children[1].children.map((c) => [c.san, c.main])).toEqual([['Nf3', true], ['Nc3', false]]);
    const transposed = t[1].children[1].children[0].children[0];
    expect([transposed.san, transposed.transposes, transposed.children]).toEqual(['Nf6', false, []]);
    expect(countNodes(t)).toBe(edges.length);
  });
});
