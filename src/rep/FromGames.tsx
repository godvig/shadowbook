// "Build decks from your games": fetch the games in this browser, pick time classes, preview the decks with the
// games and score behind every move of yours, then save. The counting is in model/fromGames.ts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchChessCom, fetchLichess } from '../lib/sources';
import type { Game, TimeClass } from '../lib/types';
import type * as db from './db';
import { ucisToSanLine } from '../lib/chess';
import { mainLine, makeMain } from './model/deck';
import { buildDecks, commitBuild, gamesInWindow, pickGames, PICK, planBuild, type GamesSite, type PlannedDeck } from './model/fromGames';
import { loadOpenings } from './model/openings';
import type { Card, Color, LibraryData } from './model/types';
import { RepTree } from './RepTree';
import { buildTree } from './tree';

const SITES: Record<GamesSite, string> = { chesscom: 'chess.com', lichess: 'Lichess' };
const CLASS_NAMES: Record<TimeClass, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical', daily: 'Daily', unknown: 'Other' };
/** Lichess sends games one by one, so the window is capped at this many. */
const LICHESS_MAX = 1000;
const pct = (points: number, games: number) => `${Math.round((100 * points) / games)}%`;
const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black');

interface Fetched {
  site: GamesSite;
  username: string;
  months: number;
  games: Game[];
  counts: [TimeClass, number][];
}

export function FromGames({
  lib,
  cards,
  onSaved,
}: {
  lib: LibraryData;
  cards: Map<string, Card>;
  /** Called with what was saved, as one sentence for the person. */
  onSaved(next: LibraryData, change: db.Change, message: string): void;
}) {
  const [site, setSite] = useState<GamesSite>('chesscom');
  const [username, setUsername] = useState('');
  const [color, setColor] = useState<Color | 'both'>('both');
  const [months, setMonths] = useState(PICK.months);
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [classes, setClasses] = useState<TimeClass[]>([]);
  const [max, setMax] = useState(PICK.games);
  const [plan, setPlan] = useState<PlannedDeck[] | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [note, setNote] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const picked = useMemo(() => (fetched ? pickGames(fetched.games, classes, max) : []), [fetched, classes, max]);

  const fetchGames = async () => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setBusy(true);
    setNote('');
    setPlan(null);
    setFetched(null);
    try {
      const name = username.trim();
      const since = new Date();
      since.setMonth(since.getMonth() - months);
      const opts = { onProgress: setProgress, signal: ctl.signal };
      // chess.com archives are monthly; one more than the window covers its first month. The window cuts the rest.
      const games = site === 'chesscom' ? await fetchChessCom(name, { ...opts, months: months + 1 }) : await fetchLichess(name, { ...opts, since: since.getTime(), max: LICHESS_MAX });
      const w = gamesInWindow(games, name, months);
      if (!w.games.length) throw new Error(`No games by ${name} in the last ${months} months.`);
      setFetched({ site, username: name, months, ...w });
      setClasses([w.counts[0][0]]);
    } catch (e) {
      if (!ctl.signal.aborted) setNote(e instanceof Error ? e.message : 'Could not fetch the games.');
    }
    setProgress('');
    setBusy(false);
  };

  const preview = async () => {
    if (!fetched) return;
    const openings = await loadOpenings();
    const colors: Color[] = color === 'both' ? ['w', 'b'] : [color];
    const built = colors.flatMap((c) => buildDecks(picked, { username: fetched.username, color: c, openings }));
    setSkip(new Set());
    setPlan(planBuild(lib, built, fetched));
    setNote(built.length ? '' : 'Too few games for a deck: a position needs at least 3 games to be followed.');
  };

  const edit = (i: number, from: string, uci: string) => setPlan((p) => p && p.map((x, j) => (j === i ? { ...x, edges: makeMain(x.edges, from, uci) } : x)));

  const save = () => {
    if (!plan) return;
    const chosen = plan.filter((p) => !skip.has(p.deck.id));
    const r = commitBuild(lib, chosen);
    const made = chosen.filter((p) => p.isNew).length;
    const parts = [made && `${made} new`, chosen.length - made && `${chosen.length - made} updated`].filter(Boolean).join(', ');
    onSaved(r.lib, r.write, `Saved ${chosen.length} deck${chosen.length === 1 ? '' : 's'} from your games (${parts}): ${chosen.map((p) => p.deck.name).join(', ')}.`);
    setPlan(null);
  };

  const chosen = plan?.filter((p) => !skip.has(p.deck.id)).length ?? 0;

  return (
    <div className="card rep-games">
      <h2>Build decks from your games</h2>
      <p className="muted small">
        Turns what you actually play into decks you can then correct. The games are fetched in this browser; only their opening moves are counted, and
        nothing is uploaded.
      </p>
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
          {busy ? 'Fetching…' : 'Fetch games'}
        </button>
      </form>
      {progress && <p className="muted small">{progress}</p>}

      {fetched && (
        <div className="rep-games-pick">
          <p className="small">
            {fetched.games.length} games by {fetched.username} on {SITES[fetched.site]} in the last {fetched.months} months.
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
            <label>
              <span className="muted small">Colour</span>
              <select value={color} onChange={(e) => setColor(e.target.value as Color | 'both')}>
                <option value="both">White and Black</option>
                <option value="w">White</option>
                <option value="b">Black</option>
              </select>
            </label>
            <button className="btn" disabled={!picked.length} onClick={() => void preview()}>
              Preview {picked.length} game{picked.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {plan && plan.length > 0 && (
        <div className="rep-games-plan">
          <p className="muted small">Bold moves are yours, with how many games you played them in and your score. Untick a deck to leave it out.</p>
          {plan.map((p, i) => {
            const positions = p.edges.filter((e) => e.mine && e.rank === 0).length;
            const mainNow = (from: string) => p.edges.find((e) => e.from === from && e.mine && e.rank === 0)?.uci;
            return (
              <div key={p.deck.id} className="rep-games-deck">
                <label className="rep-check">
                  <input
                    type="checkbox"
                    checked={!skip.has(p.deck.id)}
                    onChange={(e) => {
                      const next = new Set(skip);
                      if (e.target.checked) next.delete(p.deck.id);
                      else next.add(p.deck.id);
                      setSkip(next);
                    }}
                  />
                  <b>{p.deck.name}</b>
                  {/* The first two moves of the main line, so a deck is recognisable by its moves too. */}
                  <span className="rep-games-line">{ucisToSanLine(mainLine(p.edges).slice(0, 4).map((e) => e.uci))}</span>
                  <span className="muted small">
                    {p.built.opening ? `${colorName(p.deck.color)} · ` : ''}
                    {p.built.games} games · you scored {pct(p.built.points, p.built.games)} ·{' '}
                    {p.isNew ? `new deck, ${positions} position${positions === 1 ? '' : 's'}` : p.added ? `updates your deck: ${p.added} new move${p.added === 1 ? '' : 's'}` : 'updates your deck: nothing new'}
                  </span>
                </label>
                {p.mainDiffers.map((m) => {
                  const before = m.line.split(' ').slice(0, -1).join(' ');
                  return mainNow(m.from) === m.theirs.uci ? (
                    <p key={m.from} className="small">
                      {m.theirs.san} is now your main move{before ? ` after ${before}` : ''}.
                    </p>
                  ) : (
                    <p key={m.from} className="small rep-games-differs">
                      {before ? `After ${before}, y` : 'Y'}ou now play {m.theirs.san} more often than your main move {m.ours.san}.{' '}
                      <button className="btn small" onClick={() => edit(i, m.from, m.theirs.uci)}>
                        Make {m.theirs.san} my main move
                      </button>
                    </p>
                  );
                })}
                <details>
                  <summary className="small">Show the moves</summary>
                  <RepTree
                    nodes={buildTree(p.deck, p.edges, cards)}
                    extra={(n) => {
                      if (!n.mine) return null;
                      const s = p.built.stats.get(`${n.from}|${n.uci}`);
                      return (
                        <>
                          {s && (
                            <span className="tn small" title={`Played in ${s.games} games, you scored ${pct(s.points, s.games)}`}>
                              {s.games}·{pct(s.points, s.games)}
                            </span>
                          )}
                          {!n.main && (
                            <button className="link small" onClick={() => edit(i, n.from, n.uci)}>
                              make main
                            </button>
                          )}
                        </>
                      );
                    }}
                  />
                </details>
              </div>
            );
          })}
          <div className="row">
            <button className="btn primary" disabled={!chosen} onClick={save}>
              Save {chosen} deck{chosen === 1 ? '' : 's'}
            </button>
            <button className="btn small ghost" onClick={() => setPlan(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {note && <p className="muted small">{note}</p>}
    </div>
  );
}
