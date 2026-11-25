// Copies the Maia3 network (22 MB) and Stockfish (stockfish.js lite single-threaded, about 1.9 MB, GPL-3.0)
// from node_modules into public/, so they are served by the app itself instead of a CDN.
// (ONNX Runtime's wasm is bundled by Vite.) Stockfish's licence text goes next to it.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  ['node_modules/maia3-js/models/maia3_5m.onnx', 'public/models/maia3_5m.onnx'],
  ['node_modules/stockfish/bin/stockfish-19-lite-single.js', 'public/engine/stockfish-19-lite-single.js'],
  ['node_modules/stockfish/bin/stockfish-19-lite-single.wasm', 'public/engine/stockfish-19-lite-single.wasm'],
  ['node_modules/stockfish/Copying.txt', 'public/engine/COPYING.txt'],
];
for (const [from, to] of copies) {
  const src = join(root, from);
  const dst = join(root, to);
  if (!existsSync(src)) throw new Error(`Missing ${from} – run npm install first.`);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst);
}
console.log('Copied the Maia3 model into public/models/ and Stockfish into public/engine/');
