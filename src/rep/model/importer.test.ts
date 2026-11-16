import { describe, expect, it } from 'vitest';
import multi from './__fixtures__/study-multi-chapter.pgn?raw';
import { fenKey } from '../../lib/chess';
import { chapterSource, pgnSource } from '../lichessStudy';
import { gradeCard, Rating } from './cards';
import { START_KEY } from './deck';
import { importMessage, importText, type ImportOptions } from './importer';
import { deckName, loadOpenings, type OpeningMap } from './openings';
import { serializeDeck } from './pgn';
import type { LibraryData } from './types';

const now = new Date('2026-11-16T12:00:00Z');
const later = new Date('2026-11-17T12:00:00Z');
const empty: LibraryData = { decks: [], edges: [], cards: [] };
const ref = { study: 'Sb0Fix01' };
const study = (openings: OpeningMap = {}, at = now): ImportOptions => ({ color: 'w', source: (g) => chapterSource(g.tags, ref), openings, now: at });
const chapter = (text: string, n: number) => text.split(/\n\n\n(?=\[Event)/)[n];

describe('importing a study', () => {
  it('makes one deck per chapter, named by chapter, else by opening, and skips custom positions', async () => {
    const openings = await loadOpenings();
    const r = importText(empty, multi, study(openings));
    expect(r.decks.map((d) => [d.deck.name, d.deck.color, d.created])).toEqual([
      ['Italian ideas', 'w', true],
      ['Caro-Kann sketch', 'b', true],
      // "Chapter 3" is not a name, so the deepest named position on the main line gives it: the map, not the Opening tag.
      ["Queen's Pawn Game: Accelerated London System", 'w', true],
    ]);
    expect(r.skipped).toBe(1);
    expect(r.lib.decks[0].source).toEqual({ kind: 'lichess', studyId: 'Sb0Fix01', chapterId: 'ChapWh01', url: 'https://lichess.org/study/Sb0Fix01/ChapWh01', studyName: 'Fixture Openings' });
    expect(r.lib.decks[0].intro).toMatch(/^An intro comment/);
    expect(r.write.decks).toHaveLength(3);
    expect(r.write.cardsAdded.length).toBe(r.lib.cards.length);
    expect(importMessage(r)[0]).toMatch(/^Added 3 decks: Italian ideas, Caro-Kann sketch/);
  });

  it('names a deck from the map first, the Opening tag only when the map has nothing', () => {
    const edges = [{ from: START_KEY, to: 'b', rank: 0, uci: 'e2e4' }];
    expect(deckName({ tags: { Opening: 'Tag name' }, edges }, { b: ['B00', 'Map name'] }, 'w')).toBe('Map name');
    expect(deckName({ tags: { Opening: 'Tag name' }, edges }, {}, 'w')).toBe('Tag name');
    expect(deckName({ tags: { Opening: '?' }, edges }, {}, 'w')).toBe('1.e4');
    expect(deckName({ name: 'Mine', tags: {}, edges }, { b: ['B00', 'Map name'] }, 'w')).toBe('Mine');
  });

  it('re-imports a chapter into the same deck without duplicates and keeps the schedule', () => {
    const first = importText(empty, chapter(multi, 0), study());
    const deck = first.lib.decks[0];
    const card = first.lib.cards[0];
    const graded = gradeCard(card, Rating.Good, { deckId: deck.id, mode: 'positions', retention: 0.9 }, now).card;
    const lib = { ...first.lib, cards: first.lib.cards.map((c) => (c.id === graded.id ? graded : c)) };

    const again = importText(lib, chapter(multi, 0), study({}, later));
    expect(again.lib.decks).toHaveLength(1);
    expect(again.lib.edges).toHaveLength(first.lib.edges.length);
    expect(again.decks[0]).toMatchObject({ created: false, added: 0, updated: 0, missing: [], mainDiffers: [] });
    expect(again.lib.cards.find((c) => c.id === graded.id)).toEqual(graded);
    expect(again.write.cardsAdded).toEqual([]);
    expect(importMessage(again)).toEqual(['Updated “Italian ideas”: nothing new.']);
  });

  it('on a changed study: adds new moves, keeps your main move, deletes nothing, and lists every difference', () => {
    const first = importText(empty, chapter(multi, 0), study());
    // In the new version the study plays 4.d3 instead of 4.c3, dropped the 3…Nf6 line, rewrote the note on 3.Bc4 and
    // gave it a sign, and changed the sign on 2.Nf3.
    const changed = chapter(multi, 0)
      .replace('3. Bc4 { Aim at f7. }', '3. Bc4! { Aim at f7, the weakest point. }')
      .replace('2. Nf3!', '2. Nf3?!')
      .replace(/\(3\.\.\. Nf6 [^]*?5\. O-O\) /, '')
      .replace('4. c3 { 1-0 inside a comment is not a result. } 4... Nf6 5. d4!? exd4 6. cxd4 Bb4+ 7. Bd2 Bxd2+ 8. Nbxd2 d5?! { [%csl Yd5] } 9. exd5 Nxd5 10. Qb3 $16', '4. d3 Nf6');
    const r = importText(first.lib, changed, study({}, later));
    const d = r.decks[0];
    expect(d).toMatchObject({ created: false, added: 2, updated: 1 });
    expect(r.lib.edges.length).toBe(first.lib.edges.length + 2);
    const afterBc5 = r.lib.edges.find((e) => e.san === 'Bc5')!.to;
    expect(r.lib.edges.filter((e) => e.from === afterBc5).map((e) => [e.san, e.rank])).toEqual([['c3', 0], ['d3', 1]]);
    expect(d.mainDiffers).toEqual([
      { from: afterBc5, line: '1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3', ours: { uci: 'c2c3', san: '4.c3' }, theirs: { uci: 'd2d3', san: '4.d3' } },
    ]);
    expect(d.missing).toContain('1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6');
    expect(d.missing).toContain('1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3');
    // Ours win; the study only fills what is empty here.
    const bc4 = r.lib.edges.find((e) => e.san === 'Bc4')!;
    expect([bc4.comment, bc4.glyph]).toEqual(['Aim at f7.', '!']);
    expect(r.lib.edges.find((e) => e.san === 'Nf3')?.glyph).toBe('!');
    expect(r.write.cardsRemoved).toEqual([]);
    const msg = importMessage(r);
    expect(msg[0]).toBe('Updated “Italian ideas”: 2 new moves, 1 move with new signs or notes.');
    expect(msg).toContain('Main move kept, 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3: the study plays 4.d3 instead.');
  });

  it('an exported deck pasted back in keeps updating from its study', () => {
    const first = importText(empty, chapter(multi, 0), study());
    const deck = first.lib.decks[0];
    const pgn = serializeDeck(deck, first.lib.edges);
    const pasted = importText(empty, pgn, { color: 'b', source: (g) => pgnSource(g.tags), openings: {}, now });
    expect(pasted.lib.decks[0]).toMatchObject({ name: 'Italian ideas', color: 'w', source: deck.source });
    const again = importText(pasted.lib, chapter(multi, 0), study({}, later));
    expect(again.lib.decks).toHaveLength(1);
    expect(again.decks[0]).toMatchObject({ created: false, added: 0 });
  });

  it('counts null moves and junk in the message', () => {
    const r = importText(empty, '1. e4 e5 2. Nf3 -- 3. Bc4 Qxz9 *', study());
    expect(r.nullMoves).toBe(1);
    expect(importMessage(importText(empty, '[Event "A"]\n\n*\n\n[Event "B"]\n\n1. e4 *', study()))).toContain('1 chapter without moves skipped.');
    expect(importMessage(r)).toContain('1 variation cut short at a null move (--).');
    expect(fenKey(r.lib.edges[2].toFen)).toBe(r.lib.edges[2].to);
  });
});
