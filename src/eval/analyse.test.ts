import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameAnalysis, terminal, type AnalysisState } from './analyse';
import { closeEvalCacheForTests } from './cache';
import { resetLichessQueue } from './lichess';
import { parseGame } from './pgn';
import type { Engine } from './stockfish';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const game = parseGame('1. e4 e5 2. Nf3 Nc6');
const input = (evals: ({ cp: number } | undefined)[] = []) => ({ fens: [START, ...game.map((m) => m.fen)], pgnEvals: [undefined, ...game.map((_, i) => evals[i])] });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  closeEvalCacheForTests();
});
afterEach(resetLichessQueue);

const noFile = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;

function fakeEngine() {
  const asked: string[] = [];
  const engine = { evaluate: async (fen: string) => (asked.push(fen), { best: 'a2a3', cp: 7, depth: 18 }), clear() {}, terminate() {} } as unknown as Engine;
  return { asked, loadEngine: async () => engine };
}

/** Runs until every position has an evaluation, or nothing moves for a while. */
async function settle(a: GameAnalysis, last: () => AnalysisState | undefined) {
  for (let i = 0; i < 200 && last()?.missing !== 0; i++) await new Promise((r) => setTimeout(r, 2));
  a.stop();
  return last()!;
}

describe('game analysis sources', () => {
  it('uses the broadcast [%eval] first, and asks the cloud for the rest, shown position first', async () => {
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      asked.push(new URL(url).searchParams.get('fen')!);
      return new Response(JSON.stringify({ depth: 40, pvs: [{ moves: 'g1f3', cp: 20 }, { moves: 'b1c3', cp: 10 }] }));
    }) as unknown as typeof fetch;
    let last: AnalysisState | undefined;
    const a = new GameAnalysis(1, (s) => (last = s), { loadEngine: fakeEngine().loadEngine, fetcher, fileFetcher: noFile });
    await a.start(input([{ cp: 30 }, undefined, { cp: 25 }]), 4);
    const s = await settle(a, () => last);
    expect(s.evals.map((e) => e?.source)).toEqual(['cloud', 'pgn', 'cloud', 'pgn', 'cloud']);
    expect(s.evals[1]).toMatchObject({ cp: 30 });
    expect(s.evals[0]).toMatchObject({ best: 'g1f3', second: { cp: 10 } });
    expect(asked[0]).toBe(input().fens[4]);
    expect(asked).toHaveLength(3);
  });

  it('prefers the static file over everything else', async () => {
    const file = (async () =>
      new Response(JSON.stringify({ positions: { [START.split(' ').slice(0, 4).join(' ')]: { cp: 15, best: 'e2e4', depth: 30 } } }), { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const cloud = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    let last: AnalysisState | undefined;
    const a = new GameAnalysis(2, (s) => (last = s), { loadEngine: fakeEngine().loadEngine, fetcher: cloud, fileFetcher: file });
    await a.start(input([{ cp: 1 }, { cp: 2 }, { cp: 3 }, { cp: 4 }]), 0);
    const s = await settle(a, () => last);
    expect(s.evals[0]).toMatchObject({ source: 'file', cp: 15, best: 'e2e4' });
    expect(s.evals.slice(1).every((e) => e?.source === 'pgn')).toBe(true);
  });

  it('asks for Stockfish only where the cloud has nothing, and uses it once allowed', async () => {
    const cloud = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const engine = fakeEngine();
    let last: AnalysisState | undefined;
    const a = new GameAnalysis(3, (s) => (last = s), { loadEngine: engine.loadEngine, fetcher: cloud, fileFetcher: noFile });
    await a.start(input(), 0);
    for (let i = 0; i < 100 && !last?.needsLocal; i++) await new Promise((r) => setTimeout(r, 2));
    expect(last?.needsLocal).toBe(true);
    expect(engine.asked).toHaveLength(0);
    a.allowLocal();
    const s = await settle(a, () => last);
    expect(s.evals.every((e) => e?.source === 'local')).toBe(true);
    expect(engine.asked).toHaveLength(5);
  });

  it('with the Engine switch off, sends nothing to Lichess and starts no Stockfish', async () => {
    let calls = 0;
    const cloud = (async () => (calls++, new Response('', { status: 404 }))) as unknown as typeof fetch;
    const engine = fakeEngine();
    let last: AnalysisState | undefined;
    const a = new GameAnalysis(4, (s) => (last = s), { loadEngine: engine.loadEngine, fetcher: cloud, fileFetcher: noFile });
    a.setEngine(false);
    a.allowLocal();
    await a.start(input([{ cp: 30 }]), 0);
    await new Promise((r) => setTimeout(r, 30));
    a.stop();
    expect(calls).toBe(0);
    expect(engine.asked).toHaveLength(0);
    expect(last?.evals[1]).toMatchObject({ source: 'pgn' });
  });

  it('knows checkmate and stalemate without an engine', () => {
    expect(terminal('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toMatchObject({ over: '0-1' });
    expect(terminal('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toMatchObject({ over: '1/2-1/2', cp: 0 });
    expect(terminal(START)).toBeUndefined();
  });
});

describe('prepared evaluation files (scripts/build-evals.mjs → analyse.ts)', async () => {
  const { toEvalFile, positionKey } = await import('./file');
  const { fenKey } = await import('../lib/chess');

  it('round-trips: what the script writes is what the review page uses, without asking anyone', async () => {
    const fens = input().fens;
    const results = fens.map((fen, i) => ({ fen, eval: i === 3 ? { mate: -4, best: 'f8c5', depth: 20 } : { cp: 10 * i, best: 'a2a3', second: { cp: 10 * i - 50 }, depth: 20 } }));
    const json = JSON.stringify(toEvalFile({ game: 7, engine: 'Stockfish test', depth: 20, generated: '2026-11-25T00:00:00Z' }, results));
    const served = (async (url: string) => {
      expect(url).toBe('/evals/game-7.json');
      return new Response(json, { headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    let cloud = 0;
    const fetcher = (async () => (cloud++, new Response('', { status: 404 }))) as unknown as typeof fetch;
    let last: AnalysisState | undefined;
    const a = new GameAnalysis(7, (s) => (last = s), { loadEngine: fakeEngine().loadEngine, fetcher, fileFetcher: served });
    await a.start(input([{ cp: 999 }]), 0);
    const s = await settle(a, () => last);
    expect(cloud).toBe(0);
    expect(s.evals.map((e) => e?.source)).toEqual(['file', 'file', 'file', 'file', 'file']);
    expect(s.evals[2]).toEqual({ cp: 20, best: 'a2a3', second: { cp: -30 }, depth: 20, source: 'file' });
    expect(s.evals[3]).toEqual({ mate: -4, best: 'f8c5', depth: 20, source: 'file' });
    // The file beats the broadcast's own [%eval] on the same position.
    expect(s.evals[1]?.cp).toBe(10);
    expect(positionKey(fens[2])).toBe(fenKey(fens[2]));
  });

  it('the committed files have the format the review page reads', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const dir = new URL('../../public/evals/', import.meta.url);
    for (const name of readdirSync(dir).filter((n) => /^game-\d+\.json$/.test(n))) {
      const j = JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
      expect(j.game, name).toBe(Number(name.match(/\d+/)![0]));
      expect(Object.keys(j.positions).length, name).toBeGreaterThan(10);
      for (const [key, v] of Object.entries(j.positions) as [string, { cp?: number; mate?: number; best: string; depth: number }][]) {
        expect(key.split(' '), `${name}: ${key}`).toHaveLength(4);
        expect(v.best, `${name}: ${key}`).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
        expect(typeof v.cp === 'number' || typeof v.mate === 'number', `${name}: ${key}`).toBe(true);
        expect(v.depth).toBeGreaterThanOrEqual(18);
      }
    }
  });
});

describe('cloud requests per page view', () => {
  const many = parseGame('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7');
  const fens = [START, ...many.map((m) => m.fen)];
  const big = { fens, pgnEvals: fens.map(() => undefined) };
  const answer = (async () => new Response(JSON.stringify({ depth: 30, pvs: [{ moves: 'a2a3', cp: 5 }] }))) as unknown as typeof fetch;

  it('stops asking Lichess after the page’s budget and leaves the rest empty while Stockfish is not running', async () => {
    let calls = 0;
    const fetcher = (async (...a: Parameters<typeof fetch>) => (calls++, answer(...a))) as typeof fetch;
    const engine = fakeEngine();
    const budget = { left: 4 };
    let last: AnalysisState | undefined;
    const a = new GameAnalysis(9, (s) => (last = s), { loadEngine: engine.loadEngine, fetcher, fileFetcher: noFile, budget });
    a.allowLocal(); // the review page allows Stockfish, but it has not been needed yet
    await a.start(big, 0);
    for (let i = 0; i < 200 && (last?.capped ?? 0) + 4 < fens.length; i++) await new Promise((r) => setTimeout(r, 2));
    expect(calls).toBe(4);
    expect(budget.left).toBe(0);
    expect(last?.capped).toBe(fens.length - 4);
    expect(engine.asked).toHaveLength(0);
    // "Analyse the rest in this browser" fills them with Stockfish, still without asking Lichess.
    a.startLocal();
    const s = await settle(a, () => last);
    expect(calls).toBe(4);
    expect(engine.asked).toHaveLength(fens.length - 4);
    expect(s.capped).toBe(0);
  });

  it('uses Stockfish for the rest when it is already running', async () => {
    let calls = 0;
    const fetcher = (async () => (calls++, new Response('', { status: 404 }))) as unknown as typeof fetch;
    const engine = fakeEngine();
    let last: AnalysisState | undefined;
    const a = new GameAnalysis(10, (s) => (last = s), { loadEngine: engine.loadEngine, fetcher, fileFetcher: noFile, budget: { left: 2 } });
    a.allowLocal();
    await a.start(big, 0);
    const s = await settle(a, () => last);
    expect(calls).toBe(2);
    expect(s.evals.every((e) => e?.source === 'local')).toBe(true);
    expect(s.capped).toBe(0);
  });
});
