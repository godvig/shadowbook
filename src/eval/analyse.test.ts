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
