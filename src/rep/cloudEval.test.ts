import { describe, expect, it } from 'vitest';
import { cloudEval, evalText, KEEP_DAYS, normalUci } from './cloudEval';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CASTLE = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
const answer = (moves: string, extra = {}) => (async () => new Response(JSON.stringify({ depth: 40, pvs: [{ moves, cp: 30, ...extra }] }), { status: 200 })) as unknown as typeof fetch;
const status = (n: number) => (async () => new Response('', { status: n })) as unknown as typeof fetch;

function memory() {
  const m = new Map<string, unknown>();
  return { m, cache: { get: async (k: string) => m.get(k) as never, put: async (k: string, v: unknown) => void m.set(k, v) } };
}

describe('cloud evaluation', () => {
  it('reads the best move and turns castling into normal UCI', async () => {
    expect(await cloudEval(START, { fetcher: answer('e2e4 e7e5') })).toEqual({ best: 'e2e4', cp: 30, depth: 40 });
    expect((await cloudEval(CASTLE, { fetcher: answer('e1h1 d7d6') }))?.best).toBe('e1g1');
    expect(normalUci(CASTLE, 'f3h4')).toBe('f3h4');
  });

  it('answers null when Lichess has no evaluation, and remembers that', async () => {
    const { m, cache } = memory();
    expect(await cloudEval(START, { fetcher: status(404), cache, now: 1000 })).toBeNull();
    expect(m.size).toBe(1);
    // A second question is answered from the cache, without asking Lichess.
    const boom = (async () => {
      throw new Error('should not be called');
    }) as unknown as typeof fetch;
    expect(await cloudEval(START, { fetcher: boom, cache, now: 2000 })).toBeNull();
  });

  it('asks again after 30 days, and never caches a busy answer', async () => {
    const { m, cache } = memory();
    await cloudEval(START, { fetcher: answer('d2d4'), cache, now: 0 });
    expect((await cloudEval(START, { fetcher: answer('e2e4'), cache, now: (KEEP_DAYS + 1) * 86_400_000 }))?.best).toBe('e2e4');
    m.clear();
    expect(await cloudEval(START, { fetcher: status(429), cache })).toBeNull();
    expect(m.size).toBe(0);
  });

  it("shows the evaluation from the side to move's point of view", () => {
    expect(evalText({ best: 'e2e4', cp: 30, depth: 40 }, START)).toBe('+0.3');
    expect(evalText({ best: 'e7e5', cp: 30, depth: 40 }, START.replace(' w ', ' b '))).toBe('−0.3');
    expect(evalText({ best: 'd1h5', mate: 2, depth: 40 }, START)).toBe('#2');
  });
});
