// Every request this app sends to lichess.org from the browser for evaluations goes through here:
// one at a time, and after an HTTP 429 nothing more for a full minute (Lichess API rules, CLAUDE.md).
const PAUSE_MS = 60_000;

let chain: Promise<unknown> = Promise.resolve();
let pausedUntil = 0;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    });
  });

/** fetch, queued behind every earlier Lichess request, and held back for a minute after a 429. */
export function lichessFetch(url: string, init: RequestInit = {}, deps: { fetcher?: typeof fetch; now?: () => number } = {}): Promise<Response> {
  const now = deps.now ?? Date.now;
  const run = async () => {
    init.signal?.throwIfAborted();
    await sleep(pausedUntil - now(), init.signal ?? undefined);
    const res = await (deps.fetcher ?? fetch)(url, init);
    if (res.status === 429) pausedUntil = now() + PAUSE_MS;
    return res;
  };
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
}

/** For tests. */
export function resetLichessQueue() {
  chain = Promise.resolve();
  pausedUntil = 0;
}
export const pausedUntilForTests = () => pausedUntil;
