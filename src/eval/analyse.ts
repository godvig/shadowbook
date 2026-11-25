// Evaluations for every position of one match game, from the first source that has one:
//   1. public/evals/game-N.json, a static file made ahead of time (not built yet; see the report);
//   2. the broadcast's own [%eval] comments;
//   3. this browser's cache (eval/cache.ts);
//   4. Lichess's cloud evaluation (two lines, through the shared queue);
//   5. Stockfish in this browser, when allowed (eval/stockfish.ts), loaded on first use.
// The shown position goes first, then the rest of the game from the start.
import { Chess } from 'chess.js';
import { fenKey } from '../lib/chess';
import { getCached, putCached } from './cache';
import { fetchCloud } from './cloud';
import { readEvalFile, type EvalFile } from './file';
import { DEPTH, type Engine } from './stockfish';
import type { PosEval, Score } from './types';

export interface AnalysisInput {
  /** Position after each ply; index 0 is the start. */
  fens: string[];
  /** The broadcast's [%eval] for the same positions, where it has one. */
  pgnEvals: (Score | undefined)[];
}

/** Cloud requests left for this page view; shared by every analysis on the page. */
export interface CloudBudget {
  left: number;
}
export const CLOUD_REQUESTS_PER_PAGE = 30;

export interface AnalysisState {
  evals: (PosEval | undefined)[];
  /** Positions still waiting for an evaluation. */
  missing: number;
  /** Stockfish is working in this browser. */
  local: boolean;
  /** The cloud had nothing for some positions and Stockfish is not allowed yet. */
  needsLocal: boolean;
  /** Positions left without an evaluation because this page used up its cloud requests and Stockfish is not running. */
  capped: number;
}

/** Checkmate and stalemate need no engine. */
export function terminal(fen: string): PosEval | undefined {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { over: c.turn() === 'w' ? '0-1' : '1-0', source: 'local' };
  if (c.isStalemate()) return { cp: 0, over: '1/2-1/2', source: 'local' };
  return undefined;
}

/** public/evals/game-N.json (eval/file.ts), made by scripts/build-evals.mjs; an empty map when there is none. */
export async function loadGameFile(gameId: number, fetcher: typeof fetch = fetch): Promise<Map<string, PosEval>> {
  try {
    const res = await fetcher(`/evals/game-${gameId}.json`);
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return new Map();
    return readEvalFile((await res.json()) as Partial<EvalFile>);
  } catch {
    return new Map();
  }
}

const cloudKey = (fen: string) => `cloud2:${fenKey(fen)}`;
const localKey = (fen: string) => `local${DEPTH}:${fenKey(fen)}`;

export class GameAnalysis {
  private evals: (PosEval | undefined)[] = [];
  private input: AnalysisInput = { fens: [], pgnEvals: [] };
  private focus = 0;
  private file: Map<string, PosEval> = new Map();
  private running = false;
  private stopped = false;
  private engine: Engine | null = null;
  private localOn = false;
  /** The Engine switch: off means no cloud requests and no Stockfish; the file, the PGN and the cache still count. */
  private engineOn = true;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private needsLocal = false;
  private local = false;
  /** Plies tried this round and left for later (cloud busy, or Stockfish not allowed yet). */
  private skipped = new Set<number>();
  private ctl = new AbortController();
  /** Plies given up on for this page view (cloud limit reached, Stockfish not running); not retried. */
  private capped = new Set<number>();
  /** The user asked for Stockfish explicitly ("Analyse the rest in this browser"). */
  private forceLocal = false;

  constructor(
    private gameId: number,
    private onChange: (s: AnalysisState) => void,
    private deps: { loadEngine: () => Promise<Engine>; fetcher?: typeof fetch; fileFetcher?: typeof fetch; budget?: CloudBudget } = { loadEngine: async () => new (await import('./stockfish')).Engine() },
  ) {}

  /** Nothing is evaluated until the static file has been looked for, so it always wins when present. */
  private loaded = false;

  async start(input: AnalysisInput, focus: number) {
    this.input = input;
    this.focus = focus;
    this.file = await loadGameFile(this.gameId, this.deps.fileFetcher);
    this.loaded = true;
    this.update(this.input, this.focus);
  }

  /** New moves in a live game, or another shown position. */
  update(input: AnalysisInput, focus: number) {
    // Moves added to a live game keep what is known; a different game (or a corrected PGN) starts over.
    const same = input.fens.length >= this.input.fens.length && this.input.fens.every((f, i) => f === input.fens[i]);
    if (!same) this.evals = [];
    this.input = input;
    // A live game asks for "the newest move" with a large number.
    focus = Math.max(0, Math.min(focus, input.fens.length - 1));
    if (focus !== this.focus) this.skipped.clear();
    this.focus = focus;
    this.emit();
    if (this.loaded) void this.run();
  }

  /** "Analyse in this browser": from now on, positions the cloud does not have go to Stockfish. */
  allowLocal() {
    this.localOn = true;
    this.skipped.clear();
    void this.run();
  }

  /** "Analyse the rest in this browser": Stockfish also for the positions the cloud limit left empty. */
  startLocal() {
    this.forceLocal = true;
    this.capped.clear();
    this.allowLocal();
  }

  setEngine(on: boolean) {
    this.engineOn = on;
    if (!on) {
      this.engine?.clear();
      this.needsLocal = false;
    }
    this.skipped.clear();
    this.emit();
    void this.run();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    this.ctl.abort();
    this.engine?.terminate();
    this.engine = null;
  }

  private emit() {
    const missing = this.input.fens.filter((_, i) => !this.evals[i]).length;
    this.onChange({ evals: [...this.evals], missing, local: this.local, needsLocal: this.needsLocal && !this.localOn, capped: this.capped.size });
  }

  private nextPly(): number | undefined {
    const n = this.input.fens.length;
    const todo = (i: number) => i >= 0 && i < n && !this.evals[i] && !this.skipped.has(i) && !this.capped.has(i);
    if (todo(this.focus)) return this.focus;
    for (let i = 0; i < n; i++) if (todo(i)) return i;
    return undefined;
  }

  private async run() {
    if (this.running || this.stopped || !this.loaded) return;
    this.running = true;
    try {
      for (let ply = this.nextPly(); ply !== undefined && !this.stopped; ply = this.nextPly()) {
        const fen = this.input.fens[ply];
        const found = await this.evaluate(fen, this.input.pgnEvals[ply]);
        if (this.stopped || this.input.fens[ply] !== fen) continue;
        if (found === 'capped') this.capped.add(ply);
        else if (found) this.evals[ply] = found;
        else this.skipped.add(ply);
        this.emit();
      }
    } finally {
      this.running = false;
      this.local = false;
      if (!this.stopped) this.emit();
    }
    // Positions left for later (cloud busy or offline): try again in a minute, which also respects a 429 pause.
    if (this.skipped.size && !this.stopped && this.engineOn) {
      clearTimeout(this.retry);
      this.retry = setTimeout(() => {
        this.skipped.clear();
        void this.run();
      }, 60_000);
    }
  }

  private async evaluate(fen: string, pgnEval: Score | undefined): Promise<PosEval | 'capped' | undefined> {
    const done = terminal(fen);
    if (done) return done;
    const fromFile = this.file.get(fenKey(fen));
    if (fromFile) return fromFile;
    if (pgnEval) return { ...pgnEval, source: 'pgn' };
    const local = await getCached(localKey(fen));
    if (local) return local;
    let cloud = await getCached(cloudKey(fen));
    if (cloud) return cloud;
    if (!this.engineOn) return undefined;
    const budget = this.deps.budget;
    if (cloud === undefined && budget && budget.left <= 0) {
      // This page has asked Lichess enough: Stockfish only if it is already running (or was asked for).
      if (!(this.localOn && (this.engine || this.forceLocal))) return 'capped';
    } else if (cloud === undefined) {
      if (budget) budget.left--;
      let answer;
      try {
        answer = await fetchCloud(fen, { multiPv: 2, fetcher: this.deps.fetcher, signal: this.ctl.signal });
      } catch {
        answer = undefined; // Offline or aborted: leave it for later.
      }
      if (answer !== undefined) {
        cloud = answer && { ...answer, source: 'cloud' };
        await putCached(cloudKey(fen), cloud);
      }
    }
    if (cloud) return cloud;
    if (!this.localOn) {
      // Only "nothing stored" asks for Stockfish; a busy cloud is simply tried again later.
      if (cloud === null) this.needsLocal = true;
      return undefined;
    }
    try {
      this.engine ??= await this.deps.loadEngine();
    } catch {
      return undefined;
    }
    this.local = true;
    this.emit();
    const result = await this.engine.evaluate(fen);
    if (!result) return undefined;
    const value: PosEval = { ...result, source: 'local' };
    await putCached(localKey(fen), value);
    return value;
  }
}
