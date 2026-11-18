import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chapterIds, listStudies, sendDecks, type Chapter } from './lichessShare';

interface Call {
  method: string;
  path: string;
  body: Record<string, string>;
  auth: string | null;
}

/** A fake Lichess: each handler answers one method and path, and every call is recorded. */
function fakeLichess(handlers: Record<string, (c: Call) => Response>) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const c: Call = {
      method: init.method ?? 'GET',
      path: u.pathname,
      body: init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : {},
      auth: new Headers(init.headers).get('Authorization'),
    };
    calls.push(c);
    const key = Object.keys(handlers).find((k) => new RegExp(`^${k}$`).test(`${c.method} ${c.path}`));
    return key ? handlers[key](c) : new Response('{"error":"Not found"}', { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
const studyPgn = (study: string, chapters: string[]) => chapters.map((c) => `[Event "x"]\n[ChapterURL "https://lichess.org/study/${study}/${c}"]\n\n*\n`).join('\n\n');
const decks: Chapter[] = [
  { name: 'vs French Defense', orientation: 'white', pgn: '[Event "a"]\n\n1. e4 e6 *' },
  { name: 'Sicilian', orientation: 'black', pgn: '[Event "b"]\n\n1. e4 c5 *' },
];

// Tests run without a browser, so localStorage is a small map.
const saved = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v), removeItem: (k: string) => saved.delete(k) });
beforeEach(() => saved.set('shadowbook.lichessStudyToken', 'tok'));

describe('sending decks to Lichess', () => {
  it('creates a study, imports one chapter per deck and deletes the empty first chapter', async () => {
    let n = 0;
    const { f, calls } = fakeLichess({
      'POST /api/study': () => json({ id: 'NewStudy' }),
      'GET /api/study/NewStudy.pgn': () => new Response(studyPgn('NewStudy', ['Empty001'])),
      'POST /api/study/NewStudy/import-pgn': () => json({ chapters: [{ id: `Chap000${++n}`, name: 'x' }], error: null }),
      'DELETE /api/study/NewStudy/Empty001': () => new Response(null, { status: 204 }),
    });
    const r = await sendDecks('tok', { kind: 'new', name: 'Shadowbook – 2026-11-18', visibility: 'private' }, decks, f);
    expect(r).toEqual({ studyId: 'NewStudy', url: 'https://lichess.org/study/NewStudy', sent: ['vs French Defense', 'Sicilian'], failed: [] });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /api/study',
      'GET /api/study/NewStudy.pgn',
      'POST /api/study/NewStudy/import-pgn',
      'DELETE /api/study/NewStudy/Empty001',
      'POST /api/study/NewStudy/import-pgn',
    ]);
    expect(calls[0].body).toMatchObject({ name: 'Shadowbook – 2026-11-18', visibility: 'private', shareable: 'everyone' });
    expect(calls[2].body).toEqual({ pgn: decks[0].pgn, name: 'vs French Defense', orientation: 'white' });
    expect(calls[4].body.orientation).toBe('black');
    expect(calls.every((c) => c.auth === 'Bearer tok')).toBe(true);
  });

  it('refuses before sending when an existing study would go over 64 chapters', async () => {
    const { f, calls } = fakeLichess({ 'GET /api/study/OldStudy.pgn': () => new Response(studyPgn('OldStudy', Array.from({ length: 63 }, (_, i) => `C${String(i).padStart(7, '0')}`))) });
    await expect(sendDecks('tok', { kind: 'existing', id: 'OldStudy', name: 'My openings' }, decks, f)).rejects.toThrow('My openings has 63 chapters and holds at most 64, so 1 more fit.');
    expect(calls).toHaveLength(1);
  });

  it('adds to an existing study and lists a deck Lichess refuses, then goes on', async () => {
    const { f } = fakeLichess({
      'GET /api/study/OldStudy.pgn': () => new Response(studyPgn('OldStudy', ['Chap0001'])),
      'POST /api/study/OldStudy/import-pgn': (c) => (c.body.name === 'Sicilian' ? json({ chapters: [{ id: 'Chap0002' }] }) : json({ error: 'Invalid PGN' }, 400)),
    });
    const r = await sendDecks('tok', { kind: 'existing', id: 'OldStudy', name: 'My openings' }, decks, f);
    expect(r.sent).toEqual(['Sicilian']);
    expect(r.failed).toEqual([{ name: 'vs French Defense', error: 'Lichess: Invalid PGN' }]);
    expect(r.stopped).toBeUndefined();
  });

  it('stops when Lichess asks to slow down, and forgets a revoked token', async () => {
    const slow = fakeLichess({ 'GET /api/study/S1234567.pgn': () => new Response(''), 'POST /api/study/S1234567/import-pgn': () => new Response('', { status: 429 }) });
    const r = await sendDecks('tok', { kind: 'existing', id: 'S1234567', name: 'S' }, decks, slow.f);
    expect(r.sent).toEqual([]);
    expect(r.stopped).toMatch(/slow down/);
    expect(slow.calls).toHaveLength(2);

    const gone = fakeLichess({ 'POST /api/study': () => new Response('', { status: 401 }) });
    await expect(sendDecks('tok', { kind: 'new', name: 'X1', visibility: 'private' }, decks, gone.f)).rejects.toThrow(/Connect again/);
    expect(localStorage.getItem('shadowbook.lichessStudyToken')).toBeNull();
  });
});

describe('reading your studies', () => {
  it('lists studies from ndjson, the most recently changed first', async () => {
    const { f } = fakeLichess({
      'GET /api/study/by/godvig': () => new Response('{"id":"A1234567","name":"Old","createdAt":1,"updatedAt":10}\n{"id":"B1234567","name":"New","createdAt":2,"updatedAt":20}\n'),
    });
    expect((await listStudies('tok', 'godvig', f)).map((s) => s.name)).toEqual(['New', 'Old']);
  });

  it('reads chapter ids from the ChapterURL tags', async () => {
    const { f } = fakeLichess({ 'GET /api/study/A1234567.pgn': () => new Response(studyPgn('A1234567', ['Chap0001', 'Chap0002'])) });
    expect(await chapterIds('tok', 'A1234567', f)).toEqual(['Chap0001', 'Chap0002']);
  });
});

describe('coming back from Lichess', () => {
  it('tells the Library login apart from the match hub login', async () => {
    const { isLibraryOAuthReturn, isOAuthReturn } = await import('../live/lichessAuth');
    const at = (search: string) => vi.stubGlobal('location', { search });
    at('?code=c&state=library.Ab3_x');
    expect([isLibraryOAuthReturn(), isOAuthReturn()]).toEqual([true, false]);
    at('?code=c&state=Ab3_x-9');
    expect([isLibraryOAuthReturn(), isOAuthReturn()]).toEqual([false, true]);
    at('');
    expect([isLibraryOAuthReturn(), isOAuthReturn()]).toEqual([false, false]);
    vi.unstubAllGlobals();
  });
});
