// Builds src/rep/model/openings.json: opening names by position, from lichess-org/chess-openings (CC0-1.0).
// Each line of the five TSV files (eco, name, pgn) is replayed with chess.js; the position after the last move
// gets the name. When several lines reach the same position, the shortest line wins, then the first in file order.
//
//   npm run openings
//
// Run by hand and commit the output. Pinned to one commit so the output can be reproduced.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const COMMIT = '3ba6b20d31b2e6125cb0e6a2e792f400717d9d39';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src/rep/model/openings.json');
// Same as fenKey in src/lib/chess.ts: the position without the move counters.
const fenKey = (fen) => fen.split(' ').slice(0, 4).join(' ');

const best = new Map();
let lines = 0;
for (const file of ['a', 'b', 'c', 'd', 'e']) {
  const url = `https://raw.githubusercontent.com/lichess-org/chess-openings/${COMMIT}/${file}.tsv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const [header, ...rows] = (await res.text()).trim().split('\n');
  if (header !== 'eco\tname\tpgn') throw new Error(`${file}.tsv: unexpected columns "${header}"`);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const chess = new Chess();
    chess.loadPgn(pgn);
    const plies = chess.history().length;
    const key = fenKey(chess.fen());
    const prev = best.get(key);
    if (!prev || plies < prev.plies) best.set(key, { eco, name, plies });
    lines++;
  }
}
const map = Object.fromEntries([...best].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [v.eco, v.name]]));
writeFileSync(out, JSON.stringify(map) + '\n');
console.log(`${lines} lines, ${best.size} positions → ${out}`);
