// Builds public/presets/<id>.json: the classical over-the-board games of the preset players,
// read from the events listed in presets.config.json via the Lichess Broadcast API.
//
//   npm run presets            downloads (cached in node_modules/.cache) and writes the files
//   npm run presets -- --fresh ignores the cache
//
// Run by hand and commit the output. Never in CI: it talks to lichess.org.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedupe, gamesFromEvent, presetFile } from './presets-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'scripts/presets.config.json'), 'utf8'));
const cacheDir = join(root, 'node_modules/.cache/shadowbook-presets');
const outDir = join(root, 'public/presets');
const fresh = process.argv.includes('--fresh');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET /api/broadcast/{broadcastTournamentId}.pgn – all games of all rounds, no token needed.
// Lichess asks API clients to wait a full minute after a 429.
async function eventPgn(event) {
  const file = join(cacheDir, `${event.id}.pgn`);
  if (!fresh && existsSync(file)) return readFileSync(file, 'utf8');
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://lichess.org/api/broadcast/${event.id}.pgn?clocks=false&comments=false`, {
      headers: { 'User-Agent': 'shadowbook build-presets (https://github.com/godvig/shadowbook)' },
    });
    if (res.status === 429) {
      console.log('  rate limited, waiting a minute…');
      await sleep(61_000);
      continue;
    }
    if (!res.ok) throw new Error(`${event.name}: Lichess answered ${res.status}`);
    const text = await res.text();
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, text);
    await sleep(1500);
    return text;
  }
  throw new Error(`${event.name}: still rate limited`);
}

const pgns = new Map();
for (const event of config.events) {
  process.stdout.write(`${event.name} (${event.id})… `);
  pgns.set(event.id, await eventPgn(event));
  console.log('ok');
}

mkdirSync(outDir, { recursive: true });
for (const [id, player] of Object.entries(config.players)) {
  const games = dedupe(config.events.flatMap((e) => gamesFromEvent(pgns.get(e.id), player, e)));
  const file = presetFile(player, games, config.events);
  const json = JSON.stringify(file);
  writeFileSync(join(outDir, `${id}.json`), json + '\n');
  const { meta } = file;
  console.log(`\n${meta.name}: ${meta.games} classical games (${meta.asWhite} as White, ${meta.asBlack} as Black), ${(json.length / 1024).toFixed(0)} KB`);
  for (const s of meta.sources) console.log(`  ${String(s.games).padStart(3)}  ${s.name}`);
  if (json.length > 150 * 1024) console.warn(`  warning: ${id}.json is over 150 KB`);
}
