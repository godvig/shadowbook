import { describe, expect, it } from 'vitest';
import multi from './__fixtures__/study-multi-chapter.pgn?raw';
import junk from './__fixtures__/junk.pgn?raw';
import { sansToUcis } from '../../lib/chess';
import { pgnSource } from '../lichessStudy';
import { addPath, newDeck } from './deck';
import { enumerateLines } from './lines';
import { parsePgn, readComment, serializeDeck, type ParsedEdge } from './pgn';
import type { Edge } from './types';

const bySan = (edges: ParsedEdge[], san: string) => edges.filter((e) => e.san === san);
/** Edges as comparable rows; shape order does not matter. */
const rows = (edges: Pick<Edge, 'from' | 'uci' | 'rank' | 'glyph' | 'comment' | 'shapes' | 'nags'>[]) =>
  edges
    .map((e) => JSON.stringify([e.from, e.uci, e.rank, e.glyph ?? null, e.comment ?? null, (e.shapes ?? []).map((s) => JSON.stringify(s)).sort(), e.nags ?? null]))
    .sort();

describe('parsing a Lichess study export', () => {
  const games = parsePgn(multi);

  it('splits chapters and reads names, orientation and custom positions', () => {
    expect(games.map((g) => [g.name, g.orientation, g.fromStart])).toEqual([
      ['Italian ideas', 'w', true],
      ['Caro-Kann sketch', 'b', true],
      [undefined, 'w', true], // "Chapter 3" is a Lichess default, not a name
      ['Pawn ending', 'b', false],
    ]);
    expect(games[3].edges).toEqual([]);
  });

  it('keeps the intro, comments, signs and shapes, and drops clocks, evals and annotator tags', () => {
    const [italian, caro] = games;
    expect(italian.intro).toBe('An intro comment before the first move.\n\nIt has two paragraphs, says wow!! in plain text; and has a semicolon inside the braces.');
    const all = games.flatMap((g) => [g.intro ?? '', ...g.edges.map((e) => e.comment ?? '')]).join(' ');
    expect(all).not.toMatch(/%|clk|eval|anno|Fixture Author/);
    expect(bySan(italian.edges, 'e4')[0].comment).toBe('Take the centre.');
    const nf3 = bySan(italian.edges, 'Nf3')[0];
    expect(nf3.glyph).toBe('!');
    expect(nf3.shapes).toEqual([{ orig: 'e5', brush: 'green' }, { orig: 'f3', dest: 'e5', brush: 'green' }]);
    const bc4 = bySan(italian.edges, 'Bc4')[0];
    expect(bc4.comment).toBe('Aim at f7.');
    expect(bc4.shapes).toEqual([{ orig: 'c4', dest: 'f7', brush: 'red' }, { orig: 'd1', dest: 'h5', brush: 'blue' }]);
    expect(bySan(italian.edges, 'c3')[0].comment).toBe('1-0 inside a comment is not a result.');
    expect(bySan(italian.edges, 'Ng5')[0].glyph).toBe('?!');
    expect(bySan(italian.edges, 'Na5')[0].nags).toEqual([132]);
    expect(bySan(italian.edges, 'Qb3')[0].nags).toEqual([16]);
    // The first d5 in text order is the one in the 4.Ng5 variation; the signed one is 8…d5.
    expect(bySan(italian.edges, 'd5').find((e) => e.glyph)).toMatchObject({ glyph: '?!', shapes: [{ orig: 'd5', brush: 'yellow' }] });
    expect(bySan(caro.edges, 'Bf5').find((e) => e.comment)?.comment).toBe('Same bishop as in the Advance.');
    expect(bySan(caro.edges, 'c5')[0].glyph).toBe('!!');
  });

  it('ranks the main move first and variations after it', () => {
    const caro = games[1];
    const third = caro.edges.filter((e) => e.from === caro.edges.find((x) => x.san === 'd5')!.to);
    expect(third.map((e) => [e.san, e.rank])).toEqual([['e5', 0], ['Nc3', 1], ['exd5', 2]]);
  });

  it('merges a transposition into one position', () => {
    const london = games[2];
    // 3.e3 e6 4.Nf3 and 3.Nf3 e6 4.e3 reach one position: two moves into it, one continuation (4…c5) out of it.
    const into = london.edges.filter((e) => ['Nf3', 'e3'].includes(e.san) && e.from.split(' ')[1] === 'w' && london.edges.some((x) => x.from === e.to && x.san === 'c5'));
    expect(into.map((e) => e.san).sort()).toEqual(['Nf3', 'e3']);
    expect(new Set(into.map((e) => e.to)).size).toBe(1);
    expect(london.edges.filter((e) => e.san === 'c5')).toHaveLength(1);
  });
});

describe('parsing hand-written PGN', () => {
  const [pasted, broken] = parsePgn(junk);

  it('reads ; comments, glued move numbers, 0-0 and $n signs', () => {
    expect(pasted.edges).toHaveLength(18);
    expect(pasted.edges.find((e) => e.san === 'O-O' && e.uci === 'e1g1')).toBeDefined();
    expect(bySan(pasted.edges, 'Nf3')[0].glyph).toBe('!');
    expect(bySan(pasted.edges, 'Nc6')[0].glyph).toBe('?!');
    expect(bySan(pasted.edges, 'Re1')[0].nags).toEqual([200]);
    expect(bySan(pasted.edges, 'h3')[0]).toMatchObject({ glyph: '!!' });
    expect(bySan(pasted.edges, 'Ba4')[0].comment).toBe('rest-of-line comment');
  });

  it('survives junk: an illegal move, a null move, stray brackets and an unclosed comment', () => {
    expect(broken.tags.Event).toBe('Broken');
    expect(broken.tags.Site).toBeUndefined();
    expect(broken.edges.map((e) => e.san)).toEqual(['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4']);
    expect(broken.skipped).toEqual({ nullMoves: 1, illegal: 2 });
  });

  it('maps NAGs 1 to 6 to signs', () => {
    const [g] = parsePgn('1. e4 $1 e5 $2 2. Nf3 $3 Nc6 $4 3. Bb5 $5 a6 $6 *');
    expect(g.edges.map((e) => e.glyph)).toEqual(['!', '?', '!!', '??', '!?', '?!']);
  });

  it('reads comments into text and shapes', () => {
    expect(readComment(' [%cal Gh1h4] [%clk 0:10:21] ')).toEqual({ text: '', shapes: [{ orig: 'h1', dest: 'h4', brush: 'green' }] });
    expect(readComment('[%emt 0:00:03] [%foo bar] Fine.')).toEqual({ text: 'Fine.', shapes: [] });
  });
});

describe('writing PGN', () => {
  const asDeck = (pgn: string) => {
    const [g] = parsePgn(pgn);
    const deck = { ...newDeck({ name: g.name ?? 'Deck', color: g.orientation ?? 'w', source: pgnSource(g.tags) }), intro: g.intro };
    return { deck, edges: g.edges.map((e): Edge => ({ ...e, deckId: deck.id, mine: e.from.split(' ')[1] === deck.color })) };
  };

  it('round-trips every chapter, transpositions included, with name, orientation and study', () => {
    const chapters = multi.split(/\n\n\n(?=\[Event)/).slice(0, 3);
    for (const text of chapters) {
      const { deck, edges } = asDeck(text);
      expect(deck.source.kind).toBe('lichess');
      const out = serializeDeck(deck, edges);
      const [back] = parsePgn(out);
      expect(rows(back.edges)).toEqual(rows(edges));
      expect(back.name).toBe(deck.name);
      expect(back.orientation).toBe(deck.color);
      expect(back.intro).toBe(deck.intro);
      expect(back.tags.StudyName).toBe('Fixture Openings');
      expect(pgnSource(back.tags)).toEqual(deck.source);
    }
  });

  it('writes no study tags for a deck that is not from a study', () => {
    const deck = newDeck({ name: 'Mine', color: 'w', source: { kind: 'board' } });
    const out = serializeDeck(deck, addPath([], deck, ['e2e4']));
    expect(out).not.toMatch(/ChapterURL|StudyName/);
    expect(pgnSource(parsePgn(out)[0].tags)).toEqual({ kind: 'pgn' });
  });

  it('keeps the deck name through ChapterName, not only Event', () => {
    const { deck, edges } = asDeck(multi.split(/\n\n\n(?=\[Event)/)[0]);
    const out = serializeDeck({ ...deck, name: 'My "Italian"' }, edges);
    expect(out).toContain('[ChapterName "My \\"Italian\\""]');
    expect(parsePgn(out)[0].name).toBe('My "Italian"');
  });

  it('round-trips a deck with a cycle', () => {
    const deck = newDeck({ name: 'Knights', color: 'w', source: { kind: 'board' } });
    const edges = addPath(addPath([], deck, sansToUcis(['Nf3', 'Nf6', 'Ng1', 'Ng8'])), deck, ['e2e4']);
    expect(enumerateLines(edges).map((l) => l.map((e) => e.san))).toEqual([['Nf3', 'Nf6', 'Ng1', 'Ng8'], ['e4']]);
    const [back] = parsePgn(serializeDeck(deck, edges));
    expect(rows(back.edges)).toEqual(rows(edges));
  });
});
