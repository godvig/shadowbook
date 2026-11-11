import { useEffect, useRef, useState } from 'react';
import { Board } from '../components/Board';
import { demoOpponent, makeOpponent, scout, type Opponent } from '../lib/opponent';
import { gamesFromPgn, mostFrequentPlayer, SourceError } from '../lib/sources';
import { recentPlayers } from '../lib/storage';
import type { Site } from '../lib/types';

const HERO_FEN = 'rnbqkbnr/pp3ppp/4p3/2pp4/4PP2/2N5/PPPP2PP/R1BQKBNR w KQkq - 0 4';

export function Home({ onScouted }: { onScouted: (o: Opponent) => void }) {
  const [site, setSite] = useState<'chess.com' | 'lichess'>('chess.com');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<{ site: Site; username: string }[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    recentPlayers().then(setRecent);
    return () => abort.current?.abort();
  }, []);

  async function run(s: 'chess.com' | 'lichess', name: string, refresh = false) {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    abort.current = new AbortController();
    try {
      onScouted(await scout(s, name.trim(), { onProgress: setProgress, signal: abort.current.signal, refresh }));
    } catch (e) {
      if (abort.current.signal.aborted) return;
      const msg = e instanceof SourceError ? e.message : 'Something went wrong while reading the games.';
      setError(
        e instanceof SourceError && e.kind === 'network' && s === 'chess.com'
          ? `${msg} chess.com sometimes blocks requests from other websites – try again, use Lichess, or upload a PGN export.`
          : msg,
      );
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function onFile(f: File) {
    const games = gamesFromPgn(await f.text());
    const player = username.trim() || mostFrequentPlayer(games);
    if (!games.length || !player) {
      setError('No games found in that file.');
      return;
    }
    onScouted(makeOpponent('pgn', player, games));
  }

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Opening sparring</p>
          <h1>Play the person, not the engine.</h1>
          <p className="lead">
            Enter a username. Shadowbook reads their public games and builds a bot that opens exactly like they do – then plays on like a human of
            their rating. Perfect for preparing your next club game, or for finding out what <em>you</em> really play.
          </p>
          <form
            className="card"
            style={{ marginTop: 22 }}
            onSubmit={(e) => {
              e.preventDefault();
              run(site, username);
            }}
          >
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field">
                <label htmlFor="site">Site</label>
                <select id="site" className="input" value={site} onChange={(e) => setSite(e.target.value as 'chess.com' | 'lichess')}>
                  <option value="chess.com">chess.com</option>
                  <option value="lichess">Lichess</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1, minWidth: 200 }}>
                <label htmlFor="user">Username</label>
                <input id="user" className="input" placeholder="e.g. your next opponent" value={username} autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
              </div>
              <button className="btn primary" type="submit" disabled={busy || !username.trim()}>
                {busy ? 'Scouting…' : 'Scout player'}
              </button>
            </div>
            {busy && <p className="small muted" style={{ margin: '12px 0 0' }}>{progress}</p>}
            {error && <p className="notice error" style={{ margin: '12px 0 0' }}>{error}</p>}
            <div className="row small muted" style={{ marginTop: 14 }}>
              <span>No username handy?</span>
              <button type="button" className="btn small" onClick={() => onScouted(demoOpponent())}>
                Spar the demo player, BishopBjörn
              </button>
              <button type="button" className="btn small ghost" onClick={() => file.current?.click()}>
                Upload a PGN file
              </button>
              <input ref={file} type="file" accept=".pgn,text/plain" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </div>
          </form>
          {recent.length > 0 && (
            <div className="row small" style={{ marginTop: 14 }}>
              <span className="muted">Recently scouted:</span>
              {recent.map((r) => (
                <button key={r.site + r.username} className="btn small ghost" disabled={busy} onClick={() => run(r.site as 'chess.com' | 'lichess', r.username)}>
                  {r.username} <span className="muted">· {r.site}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div aria-hidden="true" style={{ maxWidth: 440, width: '100%', justifySelf: 'center' }}>
          <Board fen={HERO_FEN} orientation="w" movable={null} lastMove="d7d5" />
        </div>
      </section>

      <section className="grid2">
        <div className="card">
          <h3>1 · Scout</h3>
          <p className="muted">See what they play as White and Black, their favourite lines and how they score in them.</p>
        </div>
        <div className="card">
          <h3>2 · Spar</h3>
          <p className="muted">The bot plays their moves, as often as they play them. When their games run out, it plays like a human of their rating.</p>
        </div>
        <div className="card">
          <h3>3 · Learn</h3>
          <p className="muted">See where their preparation ended, where yours did, and the moves that cost you the most.</p>
        </div>
      </section>
    </>
  );
}
