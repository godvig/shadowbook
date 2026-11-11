import { Chess, type Move } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Position identity without move counters, so transpositions share a key. */
export function fenKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function uciOf(m: Pick<Move, 'from' | 'to' | 'promotion'>): string {
  return m.from + m.to + (m.promotion ?? '');
}

export function playUci(chess: Chess, uci: string): Move {
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

/** Converts SAN moves to UCI, stopping at the first move that does not parse. */
export function sansToUcis(sans: string[], maxPlies = Infinity): string[] {
  const chess = new Chess();
  const out: string[] = [];
  for (const san of sans) {
    if (out.length >= maxPlies) break;
    try {
      out.push(uciOf(chess.move(san)));
    } catch {
      break;
    }
  }
  return out;
}

/** Formats UCI moves from the start position as numbered SAN ("1.e4 c5 2.Nc3"). */
export function ucisToSanLine(ucis: string[]): string {
  const chess = new Chess();
  const parts: string[] = [];
  ucis.forEach((u, i) => {
    const san = playUci(chess, u).san;
    parts.push(i % 2 === 0 ? `${i / 2 + 1}.${san}` : san);
  });
  return parts.join(' ');
}
