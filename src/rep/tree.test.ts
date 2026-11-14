import { describe, expect, it } from 'vitest';
import { sansToUcis } from '../lib/chess';
import { addMove, type RepEntry } from './repertoire';
import { buildTree, countNodes } from './tree';
import { fetchStudy, parseStudyUrl, splitChapters } from './lichessStudy';

describe('tree', () => {
  it('builds branches from recorded paths with your main move first', () => {
    const m = new Map<string, RepEntry>();
    addMove(m, 'w', [], 'e2e4');
    addMove(m, 'w', sansToUcis(['e4', 'e5']), 'g1f3');
    addMove(m, 'w', sansToUcis(['e4', 'c5']), 'g1f3');
    addMove(m, 'w', sansToUcis(['e4', 'c5']), 'b1c3');
    const t = buildTree(m.values(), 'w');
    expect(t).toHaveLength(1);
    expect(t[0].san).toBe('e4');
    expect(t[0].main).toBe(true);
    expect(t[0].children.map((c) => c.san)).toEqual(['c5', 'e5']); // more preparation first
    const c5 = t[0].children[0];
    expect(c5.children.map((c) => [c.san, c.main])).toEqual([['Nf3', true], ['Nc3', false]]);
    expect(countNodes(t)).toBe(6);
    expect(buildTree(m.values(), 'b')).toEqual([]);
  });
});

describe('Lichess study', () => {
  it('parses links', () => {
    expect(parseStudyUrl('https://lichess.org/study/AbCd1234')).toEqual({ study: 'AbCd1234', chapter: undefined });
    expect(parseStudyUrl('lichess.org/study/AbCd1234/XyZ98765#3')).toEqual({ study: 'AbCd1234', chapter: 'XyZ98765' });
    expect(parseStudyUrl('https://example.com')).toBeNull();
  });

  it('splits chapters and reads orientation', async () => {
    const pgn = `[Event "Rep: Italian"]\n[ChapterName "Italian"]\n[Orientation "white"]\n\n1. e4 e5 2. Nf3 *\n\n\n[Event "Rep: Sicilian"]\n[Orientation "black"]\n\n1. e4 c5 *\n\n[Event "Endgame"]\n[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]\n[SetUp "1"]\n\n*`;
    const ch = splitChapters(pgn);
    expect(ch.map((c) => [c.name, c.orientation, c.fromStart])).toEqual([
      ['Italian', 'w', true],
      ['Rep: Sicilian', 'b', true],
      ['Endgame', null, false],
    ]);
    const fake = (async (url: string) => new Response(url.endsWith('AbCd1234.pgn') ? pgn : '', { status: 200 })) as unknown as typeof fetch;
    expect(await fetchStudy('https://lichess.org/study/AbCd1234', fake)).toHaveLength(3);
    const missing = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(fetchStudy('https://lichess.org/study/AbCd1234', missing)).rejects.toThrow(/public/);
  });
});
