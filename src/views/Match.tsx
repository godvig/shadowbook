import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '../components/Board';
import { sansToUcis } from '../lib/chess';
import { MAIA_ELO_MAX } from '../lib/maia';
import { demoOpponent, scout, type Opponent } from '../lib/opponent';
import { bookExit, loadPreset, PRESET_IDS, type PresetId } from '../lib/presets';
import { SourceError } from '../lib/sources';
import * as api from '../live/api';
import { completeLogin, getToken, isOAuthReturn, login, logout } from '../live/lichessAuth';
import { countdown, fmtScore, isOpen, matchScore, moveLabel, nextGame, percentages, positionAt, sanMoves, winnerOf } from '../live/match';
import { NAMES, type LiveGame, type Me, type Message, type Pick } from '../live/types';
import type { Color } from '../lib/types';
import type { GameSettings } from './Game';
import '../live/live.css';

const FONTS = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
const PICKS: { pick: Pick; label: string }[] = [
  { pick: 'gukesh', label: 'Gukesh wins' },
  { pick: 'draw', label: 'Draw' },
  { pick: 'sindarov', label: 'Sindarov wins' },
];
const PAWN =
  'M-50,0 L-50,-12 Q-50,-18 -44,-18 L44,-18 Q50,-18 50,-12 L50,0 Z M-34,-18 C-30,-50 -22,-74 -14,-96 L14,-96 C22,-74 30,-50 34,-18 Z M-30,-100 Q-30,-108 -22,-108 L22,-108 Q30,-108 30,-100 Q30,-94 22,-94 L-22,-94 Q-30,-94 -30,-100 Z M-12,-108 L12,-108 L10,-116 L-10,-116 Z M-24,-132 a24,24 0 1,0 48,0 a24,24 0 1,0 -48,0 Z';

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function Match({ onScouted, onSpar }: { onScouted: (o: Opponent) => void; onSpar: (o: Opponent, settings: GameSettings, startUcis: string[]) => void }) {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tally, setTally] = useState<Record<number, Partial<Record<Pick, number>>>>({});
  const [leaders, setLeaders] = useState<{ username: string; points: number; correct: number }[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [offline, setOffline] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState('');
  const [sparRow, setSparRow] = useState<number | null>(null);
  const now = useNow();

  useEffect(() => {
    if (document.querySelector(`link[href="${FONTS}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONTS;
    document.head.appendChild(l);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!getToken()) return setMe(null);
    try {
      setMe(await api.whoami());
    } catch (e) {
      setNotice((e as Error).message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (isOAuthReturn()) {
        try {
          await completeLogin();
        } catch (e) {
          setNotice((e as Error).message);
        }
      }
      refreshMe();
    })();
  }, [refreshMe]);

  const refreshStats = useCallback(() => {
    api.loadTally().then(setTally).catch(() => {});
    api.loadLeaderboard().then(setLeaders).catch(() => {});
  }, []);

  useEffect(() => {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 12_000));
    Promise.race([Promise.all([api.loadGames(), api.loadMessages()]), timeout])
      .then(([g, m]) => {
        setGames(g);
        setMessages(m);
        if (!g.length) setOffline(true);
      })
      .catch(() => setOffline(true))
      .finally(() => setLoaded(true));
    refreshStats();
    const poll = setInterval(refreshStats, 20_000);
    const ch = api.supabase
      .channel('match-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, (p) => {
        const g = p.new as LiveGame;
        setGames((gs) => gs.map((x) => (x.id === g.id ? g : x)));
        refreshStats();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        setMessages((ms) => [...ms, p.new as Message].slice(-500));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) => {
        const m = p.new as Message & { hidden: boolean };
        if (m.hidden) setMessages((ms) => ms.filter((x) => x.id !== m.id));
      })
      .subscribe();
    return () => {
      clearInterval(poll);
      api.supabase.removeChannel(ch);
    };
  }, [refreshStats]);

  const score = matchScore(games);
  const next = nextGame(games, now);
  const played = games.filter((g) => g.status === 'finished').length;
  const live = games.find((g) => g.status === 'live') ?? null;

  // Start a sparring game from a match game: the moves up to where it left the bot's pre-match book
  // (at most SPAR_START_CAP plies), against the bot of whoever had the other colour.
  const sparOpening = async (g: LiveGame, you: Color) => {
    const bot = you === 'w' ? g.black : g.white;
    if (!bot) return;
    try {
      setNotice('');
      const ucis = sansToUcis(sanMoves(g.pgn));
      const [before, withMatch] = await Promise.all([loadPreset(bot), loadPreset(bot, games)]);
      const n = bookExit(before.book, you === 'w' ? 'b' : 'w', ucis);
      onSpar(withMatch, { you, elo: MAIA_ELO_MAX, yourElo: 1500, useBook: true }, ucis.slice(0, n));
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const guard = async (fn: () => Promise<unknown>) => {
    if (!getToken()) return login();
    try {
      setNotice('');
      await fn();
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  return (
    <div className="live">
      <section className="lv-banner" aria-label="Match">
        <svg className="lv-stage" viewBox="0 0 1440 640" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <defs>
            <path id="lv-pawn" d={PAWN} />
            <radialGradient id="lv-cone" cx="0.5" cy="0" r="1">
              <stop offset="0" stopColor="#F2B544" stopOpacity="0.3" />
              <stop offset="0.55" stopColor="#F2B544" stopOpacity="0.06" />
              <stop offset="1" stopColor="#F2B544" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="lv-pool" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#000" stopOpacity="0.95" />
              <stop offset="1" stopColor="#000" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="lv-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4A4F58" />
              <stop offset="0.3" stopColor="#17191E" />
              <stop offset="1" stopColor="#040506" />
            </linearGradient>
            <linearGradient id="lv-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#07080A" stopOpacity="1" />
              <stop offset="0.3" stopColor="#07080A" stopOpacity="0" />
              <stop offset="1" stopColor="#07080A" stopOpacity="0.95" />
            </linearGradient>
            <pattern id="lv-sq" width="80" height="80" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill="#1B1E24" />
              <rect x="40" y="40" width="40" height="40" fill="#1B1E24" />
            </pattern>
          </defs>
          <polygon points="620,0 820,0 1060,520 380,520" fill="url(#lv-cone)" />
          <g transform="translate(720 430) scale(1 0.32)">
            <rect x="-1400" y="-200" width="2800" height="1400" fill="url(#lv-sq)" />
          </g>
          <rect x="0" y="360" width="1440" height="280" fill="url(#lv-fade)" />
          <ellipse cx="720" cy="520" rx="170" ry="34" fill="url(#lv-pool)" />
          <g transform="translate(720 520) scale(2)">
            <use href="#lv-pawn" fill="url(#lv-body)" stroke="#F2B544" strokeOpacity="0.35" strokeWidth="0.6" />
          </g>
        </svg>
        <div className="lv-side lv-left">
          <p className="lv-eyebrow">Geneva · {next ? `${next.label} next` : played ? `${played} of 14 played` : '14 games'}</p>
          <h1 className="lv-name gold">Gukesh</h1>
          <span className="lv-score">{fmtScore(score.gukesh)}</span>
        </div>
        <div className="lv-side lv-right">
          <p className="lv-eyebrow">World Championship 2026</p>
          <h1 className="lv-name blue">Sindarov</h1>
          <span className="lv-score">{fmtScore(score.sindarov)}</span>
        </div>
        <div className="lv-cta">
          <a className="lv-btn gold" href="#predict">
            {next ? `Predict ${next.label.toLowerCase()}` : 'Predictions'}
          </a>
          <a className="lv-btn ghost" href="#spar">
            Play against anyone
          </a>
        </div>
      </section>

      <ol className="lv-strip" aria-label="Game results">
        {games.map((g) => {
          const w = winnerOf(g);
          const cls = g.status === 'finished' ? (w === 'draw' ? 'd' : w === 'gukesh' ? 'g' : 's') : g.status === 'live' ? 'live' : g.id === next?.id ? 'next' : '';
          const label = g.status === 'finished' ? (w === 'draw' ? '½' : w === 'gukesh' ? 'G' : 'S') : String(g.id);
          const aria = `${g.label}: ${g.status === 'finished' ? (w === 'draw' ? 'draw' : `${NAMES[w as 'gukesh']} won`) : g.status}`;
          return (
            <li key={g.id} className={cls} aria-label={aria}>
              {label}
            </li>
          );
        })}
      </ol>

      {offline && <p className="lv-notice">Live data is not connected yet. Results, predictions and the chat appear here once the match hub is online.</p>}
      {notice && (
        <p className="lv-notice" role="alert">
          {notice}
        </p>
      )}

      <div className="lv-account">
        {me ? (
          <>
            Logged in as <strong>{me.username}</strong>
            {me.admin && <span className="lv-chip">admin</span>}
            <button
              className="lv-link"
              onClick={async () => {
                await logout();
                setMe(null);
              }}
            >
              Log out
            </button>
          </>
        ) : (
          <>
            Guests can follow everything.{' '}
            <button className="lv-btn small gold" onClick={() => login()}>
              Log in with Lichess
            </button>{' '}
            to predict and chat.
          </>
        )}
      </div>

      <div className="lv-pair">
        <PredictCard loaded={loaded && !offline} game={next} tally={next ? tally[next.id] : undefined} me={me} now={now} onPick={(p) => guard(async () => { await api.predict(next!.id, p); await refreshMe(); refreshStats(); })} />
        <SparCard onScouted={onScouted} games={games} />
      </div>

      <LiveRoom games={games} live={live} messages={messages} me={me} onPost={(gid, ply, body) => guard(() => api.post(gid, ply, body))} onHide={(id) => guard(() => api.adminHide(id))} onBan={(id) => guard(() => api.adminBan(id))} />

      <div className="lv-pair">
        <section className="lv-card lv-games" aria-labelledby="lv-games-h">
          <h2 id="lv-games-h">The games</h2>
          <div className="lv-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>White</th>
                  <th>Result</th>
                  <th>Opening</th>
                  <th>Community call</th>
                  <th>Spar</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => {
                  const pct = percentages(tally[g.id] ?? {});
                  const top = (Object.entries(pct) as [Pick, number][]).sort((a, b) => b[1] - a[1])[0];
                  const w = winnerOf(g);
                  return (
                    <tr key={g.id}>
                      <td className="mono">{g.id}</td>
                      <td>{g.white ? NAMES[g.white] : '–'}</td>
                      <td className={w === 'gukesh' ? 'gold' : w === 'sindarov' ? 'blue' : ''}>
                        {g.status === 'finished' ? (w === 'draw' ? 'Draw' : w ? `${NAMES[w]} won` : g.result) : g.status === 'live' ? 'Live now' : g.starts_at ? new Date(g.starts_at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Scheduled'}
                      </td>
                      <td>{g.opening ?? '–'}</td>
                      <td className="mono">{top && top[1] ? `${top[0] === 'draw' ? 'Draw' : NAMES[top[0]]} ${top[1]}%` : '–'}</td>
                      <td>
                        {g.status !== 'scheduled' && g.pgn && g.white && g.black ? (
                          sparRow === g.id ? (
                            <span className="lv-chips">
                              <button className="lv-chip-btn" onClick={() => sparOpening(g, 'w')} title={`You play White against ${NAMES[g.black]}’s bot`}>
                                as White
                              </button>
                              <button className="lv-chip-btn" onClick={() => sparOpening(g, 'b')} title={`You play Black against ${NAMES[g.white]}’s bot`}>
                                as Black
                              </button>
                            </span>
                          ) : (
                            <button className="lv-chip-btn" onClick={() => setSparRow(g.id)}>
                              Spar this opening
                            </button>
                          )
                        ) : (
                          '–'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="lv-card" aria-labelledby="lv-lb-h">
          <h2 id="lv-lb-h">Top predictors</h2>
          <p className="lv-muted">1 point per correct call, 2 when fewer than a third of voters saw it coming.</p>
          {leaders.length ? (
            <ol className="lv-leaders">
              {leaders.map((l, i) => (
                <li key={l.username}>
                  <span className="mono rank">{i + 1}</span>
                  <span className="who">{l.username}</span>
                  <span className="mono">{l.points}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="lv-muted">The table fills up after game 1.</p>
          )}
        </section>
      </div>

      {me?.admin && <AdminPanel games={games} onSave={(id, patch) => guard(() => api.adminGame(id, patch))} />}

      <p className="lv-foot">No money, only points. Be kind on the board. Not affiliated with FIDE.</p>
    </div>
  );
}

function PredictCard({ loaded, game, tally, me, now, onPick }: { loaded: boolean; game: LiveGame | null; tally?: Partial<Record<Pick, number>>; me: Me | null; now: number; onPick: (p: Pick) => void }) {
  const pct = percentages(tally ?? {});
  const total = (tally?.gukesh ?? 0) + (tally?.draw ?? 0) + (tally?.sindarov ?? 0);
  const mine = game && me?.predictions.find((p) => p.game_id === game.id)?.pick;
  return (
    <section id="predict" className="lv-card lv-hero gold" aria-labelledby="lv-pred-h">
      <div className="lv-head">
        <h2 id="lv-pred-h">{game ? `Predict ${game.label.toLowerCase()}` : loaded ? 'Predictions closed' : 'Predict the games'}</h2>
        {game?.starts_at && isOpen(game, now) && (
          <span className="mono">
            locks in <strong className="gold">{countdown(new Date(game.starts_at).getTime() - now)}</strong>
          </span>
        )}
      </div>
      {game ? (
        <div className="lv-picks" role="group" aria-label="Your prediction">
          {PICKS.map(({ pick, label }) => (
            <button key={pick} className={`lv-pick ${pick}${mine === pick ? ' mine' : ''}`} aria-pressed={mine === pick} onClick={() => onPick(pick)}>
              <span className="bar" style={{ width: `${pct[pick]}%` }} aria-hidden="true" />
              <span className="lbl">
                {label}
                {mine === pick && ' · your call'}
              </span>
              <span className="mono">{pct[pick]}%</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="lv-muted">{loaded ? 'The next game opens for predictions as soon as the current one ends.' : 'Call every game: Gukesh, draw or Sindarov. Voting opens when the match hub is online.'}</p>
      )}
      <p className="lv-muted">
        {total.toLocaleString()} predictions · Locks when the game starts. {me ? 'You can change your call until then.' : 'Log in with Lichess to vote.'}
      </p>
    </section>
  );
}

function SparCard({ onScouted, games }: { onScouted: (o: Opponent) => void; games: LiveGame[] }) {
  const [site, setSite] = useState<'chess.com' | 'lichess'>('chess.com');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    setBusy('Reading games…');
    try {
      onScouted(await scout(site, name.trim(), { onProgress: setBusy }));
    } catch (err) {
      setError(err instanceof SourceError ? err.message : 'Something went wrong while reading the games.');
    } finally {
      setBusy('');
    }
  }

  async function preset(id: PresetId) {
    setError('');
    setBusy(`Loading ${NAMES[id]}…`);
    try {
      onScouted(await loadPreset(id, games));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <section id="spar" className="lv-card lv-hero blue" aria-labelledby="lv-spar-h">
      <h2 id="lv-spar-h">Play against anyone</h2>
      <p>Type any chess.com or Lichess username. The bot opens the way that person does in their public games, then plays on like a human of their rating.</p>
      <form className="lv-form" onSubmit={go}>
        <div className="lv-seg" role="group" aria-label="Site">
          {(['chess.com', 'lichess'] as const).map((s) => (
            <button type="button" key={s} aria-pressed={site === s} className={site === s ? 'on' : ''} onClick={() => setSite(s)}>
              {s === 'lichess' ? 'Lichess' : s}
            </button>
          ))}
        </div>
        <label className="lv-input">
          <span className="sr-only">Username</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Any username" autoComplete="off" spellCheck={false} />
        </label>
        <button className="lv-btn gold" disabled={!!busy}>
          {busy || 'Scout and spar'}
        </button>
      </form>
      {error && <p className="lv-notice">{error}</p>}
      <div className="lv-chips">
        <span className="lv-muted">Or try</span>
        <button className="lv-chip-btn" onClick={() => onScouted(demoOpponent())}>
          the demo player
        </button>
        {PRESET_IDS.map((id) => (
          <button key={id} className="lv-chip-btn" disabled={!!busy} onClick={() => preset(id)}>
            {NAMES[id]}
          </button>
        ))}
      </div>
    </section>
  );
}

function LiveRoom({
  games,
  live,
  messages,
  me,
  onPost,
  onHide,
  onBan,
}: {
  games: LiveGame[];
  live: LiveGame | null;
  messages: Message[];
  me: Me | null;
  onPost: (gameId: number | null, ply: number, body: string) => Promise<void>;
  onHide: (id: number) => void;
  onBan: (lichessId: string) => void;
}) {
  const started = games.filter((g) => g.status !== 'scheduled' || g.pgn);
  const defaultChannel = live?.id ?? started.at(-1)?.id ?? null;
  const [channel, setChannel] = useState<number | null | undefined>(undefined);
  const active = channel === undefined ? defaultChannel : channel;
  const game = games.find((g) => g.id === active) ?? null;
  const sans = useMemo(() => sanMoves(game?.pgn ?? ''), [game?.pgn]);
  const [pinned, setPinned] = useState<number | null>(null);
  const ply = pinned ?? sans.length;
  const pos = positionAt(sans, ply);
  const [draft, setDraft] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const shown = messages.filter((m) => m.game_id === active);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length, active]);

  const channels: { id: number | null; name: string; live?: boolean }[] = [{ id: null, name: '#match' }, ...started.map((g) => ({ id: g.id, name: `#game-${g.id}`, live: g.status === 'live' }))];
  const white = game?.white ? NAMES[game.white] : 'White';
  const black = game?.black ? NAMES[game.black] : 'Black';

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    await onPost(active, game ? sans.length : 0, text);
    setDraft('');
  }

  return (
    <section className="lv-room" aria-labelledby="lv-room-h">
      <div className="lv-boardcol">
        {game ? (
          <>
            <div className="lv-player">
              <span className={game.black === 'gukesh' ? 'gold' : 'blue'}>{black}</span>
              <span className="mono">{game.status === 'live' ? 'LIVE' : game.result ?? ''}</span>
            </div>
            <div className="lv-board">
              <Board fen={pos.fen} orientation="w" movable={null} lastMove={pos.lastMove} />
            </div>
            <div className="lv-player">
              <span className={game.white === 'gukesh' ? 'gold' : 'blue'}>{white}</span>
              <span className="mono">{moveLabel(sans, ply)}</span>
            </div>
            <div className="lv-nav" role="group" aria-label="Move through the game">
              <button onClick={() => setPinned(0)} aria-label="First move">«</button>
              <button onClick={() => setPinned(Math.max(0, ply - 1))} aria-label="Previous move">‹</button>
              <button onClick={() => setPinned(Math.min(sans.length, ply + 1))} aria-label="Next move">›</button>
              <button onClick={() => setPinned(null)} className={pinned === null ? 'on' : ''}>
                {game.status === 'live' ? 'Follow live' : 'Last move'}
              </button>
            </div>
          </>
        ) : (
          <div className="lv-empty">
            <p className="mono">The board comes alive when game 1 starts.</p>
            <p className="lv-muted">Every chat message is pinned to the move it was written at. Click a move tag to see the board at that moment.</p>
          </div>
        )}
      </div>

      <div className="lv-chat">
        <div className="lv-chat-top">
          <h2 id="lv-room-h">Match board</h2>
          <div role="tablist" aria-label="Channels" className="lv-tabs">
            {channels.map((c) => (
              <button
                key={c.name}
                role="tab"
                aria-selected={c.id === active}
                className={c.id === active ? 'on' : ''}
                onClick={() => {
                  setChannel(c.id);
                  setPinned(null);
                }}
              >
                {c.name}
                {c.live && <span className="dot" aria-label="live" />}
              </button>
            ))}
          </div>
        </div>
        <div className="lv-lines" ref={list} aria-live="polite">
          {shown.length === 0 && <p className="lv-line sys">No messages yet. Say something smart about the opening.</p>}
          {shown.map((m) => (
            <div key={m.id} className={`lv-line${m.ply === ply && game && pinned !== null ? ' hot' : ''}`}>
              {game && (
                <button className="tag" onClick={() => setPinned(m.ply)} title="Show the board at this move">
                  {moveLabel(sans, m.ply)}
                </button>
              )}
              <span className="time">{new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="nick">{m.username}</span>
              <span className="text">{m.body}</span>
              {me?.admin && (
                <span className="mod">
                  <button onClick={() => onHide(m.id)}>hide</button>
                  <button onClick={() => onBan(m.lichess_id)}>ban</button>
                </span>
              )}
            </div>
          ))}
        </div>
        <form className="lv-send" onSubmit={send}>
          {game && <span className="tag">@ {moveLabel(sans, sans.length)}</span>}
          {me ? (
            <>
              <label className="lv-input grow">
                <span className="sr-only">Message</span>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder={`Message ${channels.find((c) => c.id === active)?.name ?? ''}`} />
              </label>
              <button className="lv-btn gold small">Send</button>
            </>
          ) : (
            <>
              <span className="lv-muted grow">Guests can read. Log in to post.</span>
              <button type="button" className="lv-btn gold small" onClick={() => login()}>
                Log in with Lichess
              </button>
            </>
          )}
        </form>
      </div>
    </section>
  );
}

function AdminPanel({ games, onSave }: { games: LiveGame[]; onSave: (id: number, patch: Partial<LiveGame>) => void }) {
  const [id, setId] = useState(1);
  const g = games.find((x) => x.id === id);
  const [form, setForm] = useState<Partial<LiveGame>>({});
  useEffect(() => {
    if (g) setForm({ white: g.white, black: g.black, starts_at: g.starts_at, status: g.status, result: g.result, opening: g.opening, pgn: g.pgn });
  }, [g]);
  if (!g) return null;
  const set = (k: keyof LiveGame) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const local = form.starts_at ? new Date(form.starts_at).toISOString().slice(0, 16) : '';
  return (
    <section className="lv-card lv-admin" aria-labelledby="lv-admin-h">
      <h2 id="lv-admin-h">Admin</h2>
      <div className="lv-admin-grid">
        <label>
          Game
          <select value={id} onChange={(e) => setId(Number(e.target.value))}>
            {games.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          White
          <select value={form.white ?? ''} onChange={(e) => setForm({ ...form, white: (e.target.value || null) as LiveGame['white'], black: e.target.value === 'gukesh' ? 'sindarov' : e.target.value === 'sindarov' ? 'gukesh' : null })}>
            <option value="">–</option>
            <option value="gukesh">Gukesh</option>
            <option value="sindarov">Sindarov</option>
          </select>
        </label>
        <label>
          Starts (UTC)
          <input type="datetime-local" value={local} onChange={(e) => setForm({ ...form, starts_at: e.target.value ? new Date(e.target.value + 'Z').toISOString() : null })} />
        </label>
        <label>
          Status
          <select value={form.status} onChange={set('status')}>
            <option value="scheduled">scheduled</option>
            <option value="live">live</option>
            <option value="finished">finished</option>
          </select>
        </label>
        <label>
          Result
          <select value={form.result ?? ''} onChange={set('result')}>
            <option value="">–</option>
            <option value="1-0">1-0</option>
            <option value="1/2-1/2">½-½</option>
            <option value="0-1">0-1</option>
          </select>
        </label>
        <label>
          Opening
          <input value={form.opening ?? ''} onChange={set('opening')} />
        </label>
      </div>
      <label className="lv-pgn">
        PGN (paste the moves so far; the board and move tags follow it)
        <textarea rows={4} value={form.pgn ?? ''} onChange={set('pgn')} />
      </label>
      <button className="lv-btn gold" onClick={() => onSave(id, form)}>
        Save {g.label}
      </button>
    </section>
  );
}
