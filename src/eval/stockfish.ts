// Stockfish in this browser: stockfish.js (GPL-3.0, github.com/nmrugg/stockfish.js), the lite single-threaded
// build, in a Web Worker. Single-threaded so it runs without cross-origin isolation headers, which GitHub Pages
// cannot send. scripts/copy-assets.mjs copies it into public/engine/; it is fetched only when first used.
import type { Score } from './types';

export const ENGINE_URL = '/engine/stockfish-19-lite-single.js';
export const DEPTH = 18;

export interface LocalEval extends Score {
  best: string;
  second?: Score;
  depth: number;
}

/** One `info` line: depth, which line (multipv), score from the side to move, and the first move of the line. */
export function parseInfo(line: string): { depth: number; multipv: number; score: Score; move?: string } | null {
  if (!line.startsWith('info ') || !line.includes(' score ') || line.includes(' lowerbound') || line.includes(' upperbound')) return null;
  const depth = Number(line.match(/ depth (\d+)/)?.[1]);
  const multipv = Number(line.match(/ multipv (\d+)/)?.[1] ?? 1);
  const s = line.match(/ score (cp|mate) (-?\d+)/);
  if (!depth || !s) return null;
  const n = Number(s[2]);
  return { depth, multipv, score: s[1] === 'cp' ? { cp: n } : { mate: n }, move: line.match(/ pv (\S+)/)?.[1] };
}

/** Stockfish scores from the side to move; the app keeps every score from White's side. */
export function whitePov(s: Score, fen: string): Score {
  if (fen.split(' ')[1] === 'w') return s;
  return s.mate !== undefined ? { mate: -s.mate } : { cp: -(s.cp ?? 0) };
}

type Job = { fen: string; resolve: (e: LocalEval | null) => void; lines: Map<number, { depth: number; score: Score; move?: string }> };

/** A single engine, one search at a time. */
export class Engine {
  private worker: Worker;
  private ready: Promise<void>;
  private queue: Job[] = [];
  private job: Job | null = null;

  constructor(url = ENGINE_URL, private depth = DEPTH) {
    this.worker = new Worker(url);
    this.ready = new Promise((resolve) => {
      const onReady = (e: MessageEvent) => {
        if (e.data === 'readyok') {
          this.worker.removeEventListener('message', onReady);
          resolve();
        }
      };
      this.worker.addEventListener('message', onReady);
    });
    this.worker.addEventListener('message', (e) => this.onLine(String(e.data)));
    // Two lines, for the "!" only-move mark; one thread and a small hash so phones keep up.
    for (const cmd of ['uci', 'setoption name MultiPV value 2', 'setoption name Hash value 32', 'isready']) this.worker.postMessage(cmd);
  }

  evaluate(fen: string): Promise<LocalEval | null> {
    return new Promise((resolve) => {
      this.queue.push({ fen, resolve, lines: new Map() });
      void this.next();
    });
  }

  /** Drop the searches that have not started; the running one finishes and is still cached. */
  clear() {
    for (const j of this.queue) j.resolve(null);
    this.queue = [];
  }

  terminate() {
    this.clear();
    this.job?.resolve(null);
    this.job = null;
    this.worker.terminate();
  }

  private async next() {
    if (this.job || !this.queue.length) return;
    this.job = this.queue.shift()!;
    await this.ready;
    this.worker.postMessage(`position fen ${this.job.fen}`);
    this.worker.postMessage(`go depth ${this.depth}`);
  }

  private onLine(line: string) {
    const job = this.job;
    if (!job) return;
    const info = parseInfo(line);
    if (info) job.lines.set(info.multipv, { depth: info.depth, score: info.score, move: info.move });
    if (!line.startsWith('bestmove')) return;
    const best = line.split(' ')[1];
    const first = job.lines.get(1);
    const second = job.lines.get(2);
    // "bestmove (none)": checkmate or stalemate, which the caller handles before asking.
    job.resolve(
      first && best && best !== '(none)'
        ? { best, ...whitePov(first.score, job.fen), depth: first.depth, ...(second ? { second: whitePov(second.score, job.fen) } : {}) }
        : null,
    );
    this.job = null;
    void this.next();
  }
}
