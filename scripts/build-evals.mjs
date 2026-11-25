#!/usr/bin/env node
// Prepared evaluations for the review pages: public/evals/game-N.json for every finished match game,
// so visitors' browsers need neither Lichess's cloud nor Stockfish for them (src/eval/analyse.ts reads these first).
//
//   npm run evals                      games from the match hub's database (read only, publishable key)
//   npm run evals -- --pgn games.pgn   games from a PGN file; the game number comes from [Round "N"]
//                                      (or --game N for a file with one game)
//   options: --force (redo games that already have a file), --games 2,3 (only these games), --depth 20,
//            --jobs 3, --engine /path/to/stockfish
// Exits 0 when there is nothing to do, non-zero on any error (so a failed scheduled run shows red). Only finished
// games with moves get a file; nothing is written for any other game. .github/workflows/evals.yml runs it hourly.
//
// Engine: a system `stockfish` binary when there is one (or --engine), else Stockfish from the stockfish npm
// package (stockfish.js, the full single-threaded build, GPL-3.0) run by Node. Each position: depth 20, MultiPV 2.
// Run by hand after a game, then commit the files; not part of the build.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { positionKey, toEvalFile } from '../src/eval/file.ts';
import { parseInfo, whitePov } from '../src/eval/uci.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function args(argv) {
  const o = { force: false, games: null, depth: 20, jobs: Math.max(1, Math.min(4, cpus().length - 1)), pgn: null, game: null, engine: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') o.force = true;
    else if (a === '--games') o.games = new Set(String(argv[++i]).split(',').filter(Boolean).map(Number));
    else if (a === '--depth') o.depth = Number(argv[++i]);
    else if (a === '--jobs') o.jobs = Number(argv[++i]);
    else if (a === '--pgn') o.pgn = argv[++i];
    else if (a === '--game') o.game = Number(argv[++i]);
    else if (a === '--engine') o.engine = argv[++i];
    else throw new Error(`Unknown option ${a}`);
  }
  return o;
}

/** The match hub's public connection details, as the browser uses them (src/live/config.ts). */
function supabaseConfig() {
  const text = readFileSync(join(root, 'src/live/config.ts'), 'utf8');
  const url = process.env.VITE_SUPABASE_URL ?? text.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? text.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
  // Only ever the publishable key, which can read what any visitor can read.
  if (!url || !key?.startsWith('sb_publishable_')) throw new Error('No Supabase URL or publishable key found.');
  return { url, key };
}

async function gamesFromSupabase() {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/games?select=id,status,pgn&status=eq.finished&order=id`, { headers: { apikey: key } });
  if (!res.ok) throw new Error(`Supabase answered ${res.status}`);
  return (await res.json()).map((g) => ({ id: g.id, pgn: g.pgn }));
}

function gamesFromPgn(file, only) {
  const text = readFileSync(file, 'utf8');
  const games = text.split(/\n\s*\n(?=\[)/).filter((g) => g.trim());
  return games
    .map((pgn, i) => {
      const round = pgn.match(/^\[(?:Round|Game) "(\d+)/m)?.[1];
      const result = pgn.match(/^\[Result "([^"]+)"\]/m)?.[1];
      return { id: only ?? (round ? Number(round) : i + 1), pgn, finished: result && result !== '*' };
    })
    .filter((g) => g.finished);
}

/** Every position of the main line, start included, without repeats; checkmate and stalemate need no engine. */
function positionsOf(pgn) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const replay = new Chess();
  const fens = [replay.fen()];
  for (const m of chess.history()) {
    replay.move(m);
    fens.push(replay.fen());
  }
  const seen = new Set();
  return fens.filter((fen) => {
    const k = positionKey(fen);
    const c = new Chess(fen);
    if (seen.has(k) || c.isCheckmate() || c.isStalemate()) return false;
    seen.add(k);
    return true;
  });
}

/**
 * One engine speaking UCI as a child process: the system binary, or stockfish.js run by Node (its README's way
 * to spawn it), so several engines really run in parallel.
 */
async function startEngine(path, depth) {
  const listeners = new Set();
  const onLine = (line) => listeners.forEach((l) => l(line));
  const npmEngine = require('stockfish').findEngine('single');
  const [cmd, cmdArgs] = path ? [path, []] : [process.execPath, [npmEngine]];
  let name = path ? `Stockfish (${path})` : `Stockfish ${require('stockfish/package.json').buildVersion} (stockfish.js, single-threaded)`;
  const p = spawn(cmd, cmdArgs, { stdio: ['pipe', 'pipe', 'inherit'] });
  // An engine that cannot start or dies must fail the run, not leave it waiting until the job times out.
  let dead = null;
  const failers = new Set();
  const die = (e) => {
    dead ??= e;
    failers.forEach((f) => f(dead));
  };
  p.on('error', (e) => die(new Error(`Could not start the engine (${cmd}): ${e.message}`)));
  p.on('exit', (code, signal) => die(new Error(`The engine stopped (${signal ?? `exit code ${code}`}).`)));
  p.stdin.on('error', () => {});
  let buf = '';
  p.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      onLine(buf.slice(0, i).trim());
      buf = buf.slice(i + 1);
    }
  });
  const send = (c) => p.stdin.write(`${c}\n`);
  const stop = () => {
    p.removeAllListeners('exit');
    send('quit');
    setTimeout(() => p.kill(), 500).unref();
  };
  const waitFor = (test) =>
    new Promise((resolve, reject) => {
      if (dead) return reject(dead);
      const l = (line) => {
        if (test(line)) {
          listeners.delete(l);
          failers.delete(reject);
          resolve(line);
        }
      };
      listeners.add(l);
      failers.add(reject);
    });
  // A system binary names itself ("id name Stockfish 16.1"); that goes into the files.
  if (path) listeners.add((l) => l.startsWith('id name ') && (name = l.slice(8)));
  for (const c of ['uci', 'setoption name MultiPV value 2', 'setoption name Threads value 1', 'setoption name Hash value 64']) send(c);
  send('isready');
  await waitFor((l) => l === 'readyok');
  return {
    name,
    stop,
    async evaluate(fen) {
      const lines = new Map();
      const collect = (line) => {
        const info = parseInfo(line);
        if (info) lines.set(info.multipv, info);
      };
      listeners.add(collect);
      send(`position fen ${fen}`);
      send(`go depth ${depth}`);
      const done = await waitFor((l) => l.startsWith('bestmove'));
      listeners.delete(collect);
      const first = lines.get(1);
      const second = lines.get(2);
      const best = done.split(' ')[1];
      if (!first || !best || best === '(none)') return null;
      return { best, ...whitePov(first.score, fen), depth: first.depth, ...(second ? { second: whitePov(second.score, fen) } : {}) };
    },
  };
}

function systemStockfish() {
  try {
    const found = execFileSync('sh', ['-c', 'command -v stockfish'], { encoding: 'utf8' }).trim();
    // `npm run` puts node_modules/.bin on the PATH; that is the npm package's own CLI, not a system binary.
    return found && !found.includes('node_modules') ? found : null;
  } catch {
    return null;
  }
}

async function main() {
  const o = args(process.argv.slice(2));
  const games = o.pgn ? gamesFromPgn(o.pgn, o.game) : await gamesFromSupabase();
  const outDir = join(root, 'public/evals');
  mkdirSync(outDir, { recursive: true });
  const todo = games
    .filter((g) => !o.games || o.games.has(g.id))
    // A finished game always has moves; an empty PGN would only write a file for the start position.
    .filter((g) => positionsOf(g.pgn).length > 1)
    .filter((g) => o.force || !existsSync(join(outDir, `game-${g.id}.json`)));
  if (!todo.length) return console.log(`Nothing to do: ${games.length} finished game(s), all have a file. Use --force to redo.`);
  const enginePath = o.engine ?? systemStockfish();
  const engines = await Promise.all(Array.from({ length: o.jobs }, () => startEngine(enginePath, o.depth)));
  console.log(`${engines[0].name}, depth ${o.depth}, MultiPV 2, ${o.jobs} engine(s) in parallel.`);
  try {
    for (const g of todo) {
      const t0 = Date.now();
      const fens = positionsOf(g.pgn);
      const results = [];
      let next = 0;
      // Each engine takes the next position until none are left.
      await Promise.all(
        engines.map(async (e) => {
          while (next < fens.length) {
            const fen = fens[next++];
            const ev = await e.evaluate(fen);
            if (ev) results.push({ fen, eval: ev });
          }
        }),
      );
      const order = new Map(fens.map((f, i) => [positionKey(f), i]));
      results.sort((a, b) => order.get(positionKey(a.fen)) - order.get(positionKey(b.fen)));
      const file = toEvalFile({ game: g.id, engine: engines[0].name, depth: o.depth, generated: new Date().toISOString() }, results);
      writeFileSync(join(outDir, `game-${g.id}.json`), `${JSON.stringify(file, null, 1)}\n`);
      console.log(`Game ${g.id}: ${results.length} positions in ${((Date.now() - t0) / 1000).toFixed(0)} s → public/evals/game-${g.id}.json`);
    }
  } finally {
    engines.forEach((e) => e.stop());
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
