import { describe, expect, it } from 'vitest';
import { pgnHeaders, pgnSans, splitPgn, timeClassFromControl } from './pgn';
import { sansToUcis, ucisToSanLine } from './chess';

const sample = `[Event "Live Chess"]
[White "BishopBjorn"]
[Black "KnightOwl"]
[Result "1-0"]
[TimeControl "600"]

1. e4 {[%clk 0:09:58]} 1... c5 {[%clk 0:09:57]} 2. Nc3 (2. Nf3 d6) 2... Nc6 $1 3. f4!? g6 1-0`;

describe('pgn', () => {
  it('reads headers', () => {
    expect(pgnHeaders(sample)).toMatchObject({ White: 'BishopBjorn', Result: '1-0' });
  });
  it('extracts main-line moves only', () => {
    expect(pgnSans(sample)).toEqual(['e4', 'c5', 'Nc3', 'Nc6', 'f4', 'g6']);
  });
  it('splits multi-game files', () => {
    expect(splitPgn(sample + '\n\n' + sample)).toHaveLength(2);
  });
  it('classifies time controls', () => {
    expect(timeClassFromControl('60+1')).toBe('bullet');
    expect(timeClassFromControl('180+2')).toBe('blitz');
    expect(timeClassFromControl('600')).toBe('rapid');
    expect(timeClassFromControl('1/86400')).toBe('daily');
  });
  it('round-trips SAN and UCI', () => {
    const ucis = sansToUcis(pgnSans(sample));
    expect(ucis.slice(0, 2)).toEqual(['e2e4', 'c7c5']);
    expect(ucisToSanLine(ucis)).toBe('1.e4 c5 2.Nc3 Nc6 3.f4 g6');
  });
});
