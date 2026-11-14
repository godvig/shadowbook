import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import { sansToUcis } from '../lib/chess';
import { addMove, entryId, importPgn, makeMain, pgnEdges, queue, removeMove, review, revive, type RepEntry } from './repertoire';

const now = new Date('2026-11-14T12:00:00Z');

describe('building a repertoire', () => {
  it('records only your own moves and merges transpositions', () => {
    const m = new Map<string, RepEntry>();
    expect(addMove(m, 'w', [], 'd2d4', now)?.moves).toEqual(['d2d4']);
    expect(addMove(m, 'w', sansToUcis(['d4']), 'g8f6', now)).toBeNull(); // Black's move in a White repertoire
    addMove(m, 'w', sansToUcis(['d4', 'Nf6']), 'c2c4', now);
    // 1.d4 Nf6 2.c4 e6 3.Nf3 and 1.d4 e6 2.c4 Nf6 3.Nf3 reach the same position.
    addMove(m, 'w', sansToUcis(['d4', 'Nf6', 'c4', 'e6']), 'g1f3', now);
    const again = addMove(m, 'w', sansToUcis(['d4', 'e6', 'c4', 'Nf6']), 'g1f3', now);
    expect(again).toBeNull();
    expect(m.size).toBe(3);
    const alt = addMove(m, 'w', sansToUcis(['d4', 'Nf6', 'c4', 'e6']), 'b1c3', now)!;
    expect(alt.moves).toEqual(['g1f3', 'b1c3']);
    expect(makeMain(alt, 'b1c3').moves).toEqual(['b1c3', 'g1f3']);
    expect(removeMove({ ...alt, moves: ['b1c3'] }, 'b1c3')).toBeNull();
  });
});

describe('PGN import', () => {
  it('reads every variation, comments and NAGs included', () => {
    const pgn = `[Event "Rep"]\n[Result "*"]\n\n1. d4 d5 {QGD} 2. c4 e6 (2... c6 3. Nf3 Nf6 (3... dxc4 4. e3!) 4. e3) 3. Nc3 $1 Nf6 *`;
    const edges = pgnEdges(pgn);
    const lines = edges.map((e) => e.before.length + ':' + e.uci);
    expect(lines).toContain('0:d2d4');
    expect(lines).toContain('3:c7c6');
    expect(lines).toContain('5:d5c4');
    expect(lines).toContain('6:e2e3');
    expect(lines).toContain('4:b1c3');
    const m = new Map<string, RepEntry>();
    const res = importPgn(m, pgn, 'w', now);
    // White moves: d4, c4, Nc3 (main), Nf3 and e3 (c6 line), e3 (dxc4 line).
    expect(res.cards).toBe(6);
    expect(m.has(entryId('w', 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2'))).toBe(true);
  });

  it('survives junk', () => {
    expect(pgnEdges('1. e4 Kxe9 e5 2. Nf3')).toHaveLength(3);
  });
});

describe('review', () => {
  it('schedules by outcome and queues due before new', () => {
    const m = new Map<string, RepEntry>();
    const a = addMove(m, 'w', [], 'e2e4', now)!;
    const b = addMove(m, 'w', sansToUcis(['e4', 'e5']), 'g1f3', now)!;
    expect(queue(m.values(), now, 10).map((e) => e.id)).toEqual([a.id, b.id]);
    expect(queue(m.values(), now, 1)).toHaveLength(1);
    const reviewed = review(a, 'clean', now);
    expect(reviewed.card.state).not.toBe(State.New);
    const wrong = review(a, 'wrong', now);
    expect(new Date(wrong.card.due).getTime()).toBeLessThanOrEqual(new Date(reviewed.card.due).getTime());
    m.set(a.id, review(a, 'wrong', now));
    const later = new Date(now.getTime() + 24 * 3600_000);
    expect(queue(m.values(), later, 0).map((e) => e.id)).toEqual([a.id]);
    const roundTrip = revive(JSON.parse(JSON.stringify(reviewed)));
    expect(roundTrip.card.due instanceof Date).toBe(true);
  });
});
