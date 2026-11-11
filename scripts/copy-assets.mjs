// Copies the Maia3 network (22 MB) from node_modules into public/, so it is served by the
// app itself instead of a CDN. (ONNX Runtime's wasm is bundled by Vite.)
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  ['node_modules/maia3-js/models/maia3_5m.onnx', 'public/models/maia3_5m.onnx'],
];
for (const [from, to] of copies) {
  const src = join(root, from);
  const dst = join(root, to);
  if (!existsSync(src)) throw new Error(`Missing ${from} – run npm install first.`);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst);
}
console.log('Copied the Maia3 model into public/models/');
