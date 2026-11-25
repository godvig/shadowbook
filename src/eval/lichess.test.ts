import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCloud } from './cloud';
import { lichessFetch, pausedUntilForTests, resetLichessQueue } from './lichess';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

afterEach(() => {
  resetLichessQueue();
  vi.useRealTimers();
});

describe('the Lichess request queue', () => {
  it('sends one request at a time, in order', async () => {
    let open = 0;
    let most = 0;
    const order: string[] = [];
    const fetcher = (async (url: string) => {
      open++;
      most = Math.max(most, open);
      await new Promise((r) => setTimeout(r, 5));
      order.push(url);
      open--;
      return new Response('{}');
    }) as unknown as typeof fetch;
    await Promise.all(['a', 'b', 'c'].map((u) => lichessFetch(u, {}, { fetcher })));
    expect(most).toBe(1);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('waits a full minute after a 429 before the next request', async () => {
    vi.useFakeTimers();
    const sent: number[] = [];
    let first = true;
    const fetcher = (async () => {
      sent.push(Date.now());
      const status = first ? 429 : 200;
      first = false;
      return new Response('{}', { status });
    }) as unknown as typeof fetch;
    expect((await lichessFetch('x', {}, { fetcher })).status).toBe(429);
    expect(pausedUntilForTests()).toBe(sent[0] + 60_000);
    const next = lichessFetch('y', {}, { fetcher });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await next).status).toBe(200);
    expect(sent[1] - sent[0]).toBeGreaterThanOrEqual(60_000);
  });

  it('a failed request does not block the ones after it', async () => {
    const fetcher = (async (url: string) => {
      if (url === 'bad') throw new TypeError('network');
      return new Response('{}');
    }) as unknown as typeof fetch;
    await expect(lichessFetch('bad', {}, { fetcher })).rejects.toThrow('network');
    expect((await lichessFetch('good', {}, { fetcher })).ok).toBe(true);
  });
});

describe('cloud evaluation with two lines', () => {
  it('asks for multiPv and reads the second line', async () => {
    let asked = '';
    const fetcher = (async (url: string) => {
      asked = url;
      return new Response(JSON.stringify({ depth: 36, pvs: [{ moves: 'e2e4 e7e5', cp: 25 }, { moves: 'd2d4 d7d5', mate: -9 }] }));
    }) as unknown as typeof fetch;
    expect(await fetchCloud(START, { multiPv: 2, fetcher })).toEqual({ best: 'e2e4', cp: 25, depth: 36, second: { mate: -9 } });
    expect(asked).toContain('multiPv=2');
  });

  it('tells "nothing stored" (null) from "ask again later" (undefined)', async () => {
    const status = (n: number) => (async () => new Response('', { status: n })) as unknown as typeof fetch;
    expect(await fetchCloud(START, { fetcher: status(404) })).toBeNull();
    expect(await fetchCloud(START, { fetcher: status(500) })).toBeUndefined();
  });
});
