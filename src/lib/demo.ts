import { sansToUcis } from './chess';
import type { Game } from './types';

/**
 * BishopBjörn is a made-up club player, so the app can be tried without any account.
 * A 1540 rapid player with a soft spot for the Fried Liver and the King's Indian.
 */
export const DEMO_USERNAME = 'BishopBjörn';

const asWhite: [string, number][] = [
  ['e4 c5 Nc3 Nc6 f4 g6 Nf3 Bg7 Bb5 Nd4 O-O', 6],
  ['e4 c5 Nc3 d6 f4 g6 Nf3 Bg7 Bc4 Nc6 O-O', 4],
  ['e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4', 7],
  ['e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7', 5],
  ['e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+', 2],
  ['e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6', 4],
  ['e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2', 3],
  ['d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3', 3],
];

const asBlack: [string, number][] = [
  ['e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6 Bd3 Nf6', 6],
  ['e4 c5 Nc3 e6 f4 d5 Nf3 Nf6 e5 Nfd7', 5],
  ['e4 c5 Nc3 e6 Nf3 d5 exd5 exd5 d4', 2],
  ['e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3', 4],
  ['d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5', 6],
  ['d4 Nf6 Bg5 Ne4 Bf4 c5 f3 Qa5+', 3],
  ['d4 Nf6 Nf3 g6 g3 Bg7 Bg2 O-O', 2],
  ['c4 e5 Nc3 Nf6 g3 d5', 2],
  ['Nf3 d5 g3 Nf6 Bg2 c6', 2],
];

const results: Game['result'][] = ['1-0', '0-1', '1/2-1/2', '1-0', '0-1', '1-0', '0-1'];

export function demoGames(): Game[] {
  const games: Game[] = [];
  let i = 0;
  const add = (lines: [string, number][], white: boolean) => {
    for (const [line, n] of lines) {
      const ucis = sansToUcis(line.split(' '));
      for (let k = 0; k < n; k++) {
        const opp = `Sparring${(i % 17) + 1}`;
        games.push({
          id: `demo:${i}`,
          white: white ? DEMO_USERNAME : opp,
          black: white ? opp : DEMO_USERNAME,
          whiteElo: white ? 1540 : 1500 + (i % 90),
          blackElo: white ? 1500 + (i % 90) : 1540,
          result: results[i % results.length],
          timeClass: 'rapid',
          end: 1_790_000_000_000 + i * 3_600_000,
          ucis,
        });
        i++;
      }
    }
  };
  add(asWhite, true);
  add(asBlack, false);
  return games;
}
