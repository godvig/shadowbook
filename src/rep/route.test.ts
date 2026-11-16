import { describe, expect, it } from 'vitest';
import { isLibraryHash, parseRoute, routeHash, type LibraryRoute } from './route';

describe('Library routes', () => {
  it('reads and writes every page', () => {
    const routes: LibraryRoute[] = [{ page: 'shelf' }, { page: 'deck', id: 'a-1' }, { page: 'train', id: 'a-1' }, { page: 'starter', id: 'italian' }, { page: 'prep' }];
    for (const r of routes) expect(parseRoute(routeHash(r))).toEqual(r);
    expect(routeHash({ page: 'deck', id: 'a-1' })).toBe('#library/deck/a-1');
  });

  it('falls back to the shelf for anything it does not know', () => {
    expect(parseRoute('#library')).toEqual({ page: 'shelf' });
    expect(parseRoute('#library/')).toEqual({ page: 'shelf' });
    expect(parseRoute('#library/deck')).toEqual({ page: 'shelf' });
    expect(parseRoute('#library/insights')).toEqual({ page: 'shelf' });
  });

  it('knows which hashes belong to the Library', () => {
    expect(isLibraryHash('#library')).toBe(true);
    expect(isLibraryHash('#library/deck/x')).toBe(true);
    expect(isLibraryHash('#libraryx')).toBe(false);
    expect(isLibraryHash('#privacy')).toBe(false);
  });
});
