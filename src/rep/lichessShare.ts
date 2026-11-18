// "Send to Lichess": a one-way copy of decks into a Lichess study, one chapter per deck. It has its own login,
// asked for only when sending, with the study scopes; the match hub's login (live/lichessAuth.ts) asks for none,
// and the two tokens are kept apart. Every call takes the fetch to use, so the tests need no network.
import { LICHESS, LICHESS_CLIENT_ID } from '../live/config';
import { base64url, challengeFor, LIBRARY_STATE } from '../live/lichessAuth';

const TOKEN_KEY = 'shadowbook.lichessStudyToken';
const PENDING_KEY = 'shadowbook.libraryOAuthPending';
/** Read is needed to list your unlisted and private studies, count their chapters and find the empty first chapter. */
export const SCOPES = 'study:read study:write';
export const MAX_CHAPTERS = 64;
/** Lichess allows this many new studies per account per day. */
export const STUDIES_PER_DAY = 30;

export type Visibility = 'private' | 'unlisted' | 'public';
export interface StudyMeta {
  id: string;
  name: string;
  updatedAt: number;
}
export interface Chapter {
  name: string;
  orientation: 'white' | 'black';
  pgn: string;
}
export type Target = { kind: 'new'; name: string; visibility: Visibility } | { kind: 'existing'; id: string; name: string };
export interface SendResult {
  studyId: string;
  url: string;
  sent: string[];
  failed: { name: string; error: string }[];
  /** Why sending stopped before the end, e.g. Lichess asked to slow down. */
  stopped?: string;
}

/** A refusal from Lichess, with the HTTP status. 401 means the token is gone, 429 to slow down. */
export class LichessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function store(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export const shareToken = () => store()?.getItem(TOKEN_KEY) ?? null;
const redirectUri = () => location.origin + import.meta.env.BASE_URL;

/** Goes to Lichess to ask for the study scopes. The ticked decks are kept for the return. */
export async function connect(decks: string[]): Promise<void> {
  const random = (n: number) => base64url(crypto.getRandomValues(new Uint8Array(n)));
  const verifier = random(48);
  const state = LIBRARY_STATE + random(16);
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state, decks }));
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: LICHESS_CLIENT_ID,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    scope: SCOPES,
    state,
  });
  location.assign(`${LICHESS}/oauth?${q}`);
}

/** Finishes the login after Lichess sends you back, and returns the decks that were ticked. */
export async function completeConnect(f: typeof fetch = fetch): Promise<{ decks: string[] }> {
  const params = new URLSearchParams(location.search);
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as { verifier: string; state: string; decks: string[] } | null;
  sessionStorage.removeItem(PENDING_KEY);
  history.replaceState(null, '', `${import.meta.env.BASE_URL}#library/share`);
  const code = params.get('code');
  if (!code || !pending || pending.state !== params.get('state')) throw new Error('The Lichess login was cancelled or expired. Try again.');
  const res = await f(`${LICHESS}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: pending.verifier, redirect_uri: redirectUri(), client_id: LICHESS_CLIENT_ID }),
  });
  if (!res.ok) throw new Error('Lichess did not accept the login. Try again.');
  const { access_token } = (await res.json()) as { access_token: string };
  store()?.setItem(TOKEN_KEY, access_token);
  return { decks: pending.decks };
}

/** Forgets the token here and revokes it at Lichess. */
export async function disconnect(f: typeof fetch = fetch): Promise<void> {
  const token = shareToken();
  store()?.removeItem(TOKEN_KEY);
  if (token) await f(`${LICHESS}/api/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
}

async function call(f: typeof fetch, token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await f(`${LICHESS}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (res.ok) return res;
  if (res.status === 401) {
    store()?.removeItem(TOKEN_KEY);
    throw new LichessError('Your Lichess connection has expired or was revoked. Connect again.', 401);
  }
  if (res.status === 429) throw new LichessError('Lichess asked to slow down. Wait a minute, then send the rest.', 429);
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const error = typeof body?.error === 'string' ? body.error : JSON.stringify(body?.error ?? `HTTP ${res.status}`);
  throw new LichessError(`Lichess: ${error}`, res.status);
}

const form = (fields: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields),
});

export async function whoami(token: string, f: typeof fetch = fetch): Promise<string> {
  const me = (await (await call(f, token, '/api/account')).json()) as { username: string };
  return me.username;
}

/** Your studies, the most recently changed first. Lichess sends one JSON object per line. */
export async function listStudies(token: string, username: string, f: typeof fetch = fetch): Promise<StudyMeta[]> {
  const text = await (await call(f, token, `/api/study/by/${encodeURIComponent(username)}`, { headers: { Accept: 'application/x-ndjson' } })).text();
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as StudyMeta)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The chapter ids of a study, read from the ChapterURL tags of its PGN, in order. */
export async function chapterIds(token: string, studyId: string, f: typeof fetch = fetch): Promise<string[]> {
  const pgn = await (await call(f, token, `/api/study/${studyId}.pgn?comments=false&variations=false&clocks=false`)).text();
  return [...pgn.matchAll(/\[ChapterURL "[^"]*\/study\/[A-Za-z0-9]{8}\/([A-Za-z0-9]{8})"\]/g)].map((m) => m[1]);
}

async function createStudy(token: string, name: string, visibility: Visibility, f: typeof fetch): Promise<string> {
  // The other settings are Lichess's own defaults for a new study; Share & export stays open so the study can be
  // imported back into the Library.
  const res = await call(f, token, '/api/study', form({ name, visibility, computer: 'everyone', explorer: 'everyone', cloneable: 'everyone', shareable: 'everyone', chat: 'member' }));
  return ((await res.json()) as { id: string }).id;
}

async function importChapter(token: string, studyId: string, c: Chapter, f: typeof fetch): Promise<string[]> {
  const res = await call(f, token, `/api/study/${studyId}/import-pgn`, form({ pgn: c.pgn, name: c.name.slice(0, 100), orientation: c.orientation }));
  const body = (await res.json()) as { chapters?: { id: string }[]; error?: string | null };
  if (!body.chapters?.length) throw new LichessError(`Lichess: ${body.error ?? 'no chapter was created'}`, 400);
  return body.chapters.map((x) => x.id);
}

/**
 * Sends the decks one at a time, as one chapter each. A new study comes with an empty first chapter; it is deleted
 * once the first deck is in, since a study can't be left without chapters. Stops at the first refusal that would
 * fail every deck after it (an expired login, too many requests); any other failure is listed and sending goes on.
 */
export async function sendDecks(token: string, target: Target, chapters: Chapter[], f: typeof fetch = fetch, onProgress?: (done: number) => void): Promise<SendResult> {
  let studyId: string;
  let empty: string[] = [];
  if (target.kind === 'new') {
    if (chapters.length > MAX_CHAPTERS) throw new Error(`A Lichess study holds at most ${MAX_CHAPTERS} chapters. Tick fewer decks.`);
    studyId = await createStudy(token, target.name, target.visibility, f);
    empty = await chapterIds(token, studyId, f).catch(() => []);
  } else {
    studyId = target.id;
    const have = (await chapterIds(token, studyId, f)).length;
    if (have + chapters.length > MAX_CHAPTERS) {
      throw new Error(`${target.name} has ${have} chapters and holds at most ${MAX_CHAPTERS}, so ${MAX_CHAPTERS - have} more fit. Tick fewer decks, or send them to a new study.`);
    }
  }
  const result: SendResult = { studyId, url: `${LICHESS}/study/${studyId}`, sent: [], failed: [] };
  for (const c of chapters) {
    try {
      await importChapter(token, studyId, c, f);
      result.sent.push(c.name);
      for (const id of empty.splice(0)) await call(f, token, `/api/study/${studyId}/${id}`, { method: 'DELETE' }).catch(() => undefined);
    } catch (e) {
      if (e instanceof LichessError && (e.status === 401 || e.status === 429)) {
        result.stopped = e.message;
        break;
      }
      result.failed.push({ name: c.name, error: e instanceof Error ? e.message : 'Failed.' });
    }
    onProgress?.(result.sent.length + result.failed.length);
  }
  return result;
}
