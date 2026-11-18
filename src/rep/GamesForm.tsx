// Fetching your own games, shared by "Build decks from your games" and Insights: site, username, how far back,
// then which time classes and how many of the newest games. Games are fetched in this browser and kept, truncated
// to the opening, in the Library's cache store, so coming back does not fetch them all again.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchChessCom, fetchLichess } from '../lib/sources';
import type { Game, TimeClass } from '../lib/types';
import * as db from './db';
import { gamesInWindow, pickGames, PICK, type GamesSite } from './model/fromGames';

export const SITES: Record<GamesSite, string> = { chesscom: 'chess.com', lichess: 'Lichess' };
const CLASS_NAMES: Record<TimeClass, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical', daily: 'Daily', unknown: 'Other' };
/** Lichess sends games one by one, so the window is capped at this many. */
const LICHESS_MAX = 1000;

export interface Fetched {
  site: GamesSite;
  username: string;
  months: number;
  /** Newest first, inside the window. */
  games: Game[];
  counts: [TimeClass, number][];
  /** Unix ms of the fetch. */
  at: number;
}

const cacheKey = (site: GamesSite, username: string) => `games:${site}:${username.trim().toLowerCase()}`;

export function GamesForm(props: {
  /** Prefilled, e.g. from the last decks built from games. */
  initial?: { site: GamesSite; username: string };
  /** Label of the main button, given the number of games picked, e.g. "Preview 500 games". */
  action(count: number): string;
  onGo(picked: Game[], fetched: Fetched): void;
  /** Called when a new fetch starts, so the page can clear what it showed. */
  onReset?(): void;
  /** More controls next to the main button, e.g. the colour. */
  extra?: ReactNode;
}) {
  const [site, setSite] = useState<GamesSite>(props.initial?.site ?? 'chesscom');
  const [username, setUsername] = useState(props.initial?.username ?? '');
  const [months, setMonths] = useState(PICK.months);
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [classes, setClasses] = useState<TimeClass[]>([]);
  const [max, setMax] = useState(PICK.games);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [note, setNote] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  // Games fetched before for the prefilled player: use them, and offer to update.
  useEffect(() => {
    if (!props.initial) return;
    db.cacheGet<Fetched>(cacheKey(props.initial.site, props.initial.username))
      .then((hit) => {
        if (!hit) return;
        setFetched(hit);
        setClasses([hit.counts[0][0]]);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const picked = useMemo(() => (fetched ? pickGames(fetched.games, classes, max) : []), [fetched, classes, max]);

  const fetchGames = async () => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setBusy(true);
    setNote('');
    setFetched(null);
    props.onReset?.();
    try {
      const name = username.trim();
      const since = new Date();
      since.setMonth(since.getMonth() - months);
      const opts = { onProgress: setProgress, signal: ctl.signal };
      // chess.com archives are monthly; one more than the window covers its first month. The window cuts the rest.
      const games = site === 'chesscom' ? await fetchChessCom(name, { ...opts, months: months + 1 }) : await fetchLichess(name, { ...opts, since: since.getTime(), max: LICHESS_MAX });
      const w = gamesInWindow(games, name, months);
      if (!w.games.length) throw new Error(`No games by ${name} in the last ${months} months.`);
      const f: Fetched = { site, username: name, months, ...w, at: Date.now() };
      setFetched(f);
      setClasses([w.counts[0][0]]);
      db.cachePut(cacheKey(site, name), f).catch(() => undefined);
    } catch (e) {
      if (!ctl.signal.aborted) setNote(e instanceof Error ? e.message : 'Could not fetch the games.');
    }
    setProgress('');
    setBusy(false);
  };

  return (
    <>
      <form
        className="rep-games-form"
        onSubmit={(e) => {
          e.preventDefault();
          void fetchGames();
        }}
      >
        <label>
          <span className="muted small">Site</span>
          <select value={site} onChange={(e) => setSite(e.target.value as GamesSite)}>
            {Object.entries(SITES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </label>
        <label>
          <span className="muted small">Months back</span>
          <input type="number" min={1} max={120} value={months} onChange={(e) => setMonths(Math.max(1, Math.min(120, Number(e.target.value) || PICK.months)))} />
        </label>
        <button className="btn" disabled={!username.trim() || busy}>
          {busy ? 'Fetching…' : fetched ? 'Fetch again' : 'Fetch games'}
        </button>
      </form>
      {progress && <p className="muted small">{progress}</p>}
      {note && <p className="muted small">{note}</p>}

      {fetched && (
        <div className="rep-games-pick">
          <p className="small">
            {fetched.games.length} games by {fetched.username} on {SITES[fetched.site]} in the last {fetched.months} months
            <span className="muted"> · fetched {new Date(fetched.at).toLocaleDateString()}</span>.
          </p>
          <fieldset>
            <legend className="muted small">Time classes</legend>
            {fetched.counts.map(([tc, k]) => (
              <label key={tc} className="rep-check">
                <input type="checkbox" checked={classes.includes(tc)} onChange={(e) => setClasses(e.target.checked ? [...classes, tc] : classes.filter((x) => x !== tc))} />
                {CLASS_NAMES[tc]} ({k})
              </label>
            ))}
          </fieldset>
          <div className="row">
            <label>
              <span className="muted small">Newest games to use</span>
              <input type="number" min={10} max={5000} step={50} value={max} onChange={(e) => setMax(Math.max(10, Number(e.target.value) || PICK.games))} />
            </label>
            {props.extra}
            <button className="btn" disabled={!picked.length} onClick={() => props.onGo(picked, fetched)}>
              {props.action(picked.length)}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
