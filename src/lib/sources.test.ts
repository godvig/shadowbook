import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLichess } from './sources';

const line = JSON.stringify({ id: 'g1', variant: 'standard', speed: 'blitz', status: 'mate', winner: 'white', moves: 'e4 e5', players: { white: { user: { name: 'a' } }, black: { user: { name: 'b' } } } });

describe('fetchLichess', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for the newest games as before, and adds since only when given', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return new Response(line, { status: 200 });
    });
    await fetchLichess('someone');
    await fetchLichess('someone', { max: 1000, since: 1_700_000_000_000.4 });
    expect(urls[0]).toBe('https://lichess.org/api/games/user/someone?max=800&moves=true&clocks=false&evals=false&opening=false');
    expect(urls[1]).toBe('https://lichess.org/api/games/user/someone?max=1000&since=1700000000000&moves=true&clocks=false&evals=false&opening=false');
  });
});
