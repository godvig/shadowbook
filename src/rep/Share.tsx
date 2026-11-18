// Send to Lichess: tick decks, choose a new study or one of yours, and each deck becomes a chapter. A one-way copy;
// the calls are in lichessShare.ts. Connecting to Lichess goes to Lichess and back, so the ticks are kept for it.
import { useEffect, useState } from 'react';
import { chapterIds, completeConnect, connect, disconnect, LichessError, listStudies, MAX_CHAPTERS, sendDecks, shareToken, STUDIES_PER_DAY, whoami, type SendResult, type StudyMeta, type Visibility } from './lichessShare';
import type { Deck } from './model/types';
import { isLibraryOAuthReturn } from '../live/lichessAuth';

const today = () => new Date().toISOString().slice(0, 10);

export function Share(props: {
  decks: Deck[];
  /** Ticked on arrival, e.g. the deck the page was opened from. */
  ticked?: string[];
  pgnOf(deck: Deck): string;
  backLabel: string;
  onBack(): void;
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set(props.ticked ?? props.decks.map((d) => d.id)));
  const [token, setToken] = useState(shareToken);
  const [username, setUsername] = useState('');
  const [studies, setStudies] = useState<StudyMeta[] | null>(null);
  const [where, setWhere] = useState<'new' | string>('new');
  const [name, setName] = useState(`Shadowbook – ${today()}`);
  const [visibility, setVisibility] = useState<Visibility>('private');
  /** Chapters already in the chosen study, once read. */
  const [have, setHave] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<(SendResult & { name: string }) | null>(null);

  const fail = (e: unknown) => {
    if (e instanceof LichessError && e.status === 401) setToken(null);
    setError(e instanceof Error ? e.message : 'Something went wrong.');
  };

  // Back from Lichess: finish the login, and tick again what was ticked.
  useEffect(() => {
    if (!isLibraryOAuthReturn()) return;
    completeConnect()
      .then(({ decks }) => {
        setToken(shareToken());
        if (decks.length) setTicked(new Set(decks));
      })
      .catch(fail);
  }, []);

  // Connected: who you are and your studies, for "one of your studies".
  useEffect(() => {
    if (!token) return;
    whoami(token)
      .then(async (u) => {
        setUsername(u);
        setStudies(await listStudies(token, u));
      })
      .catch(fail);
  }, [token]);

  useEffect(() => {
    setHave(null);
    if (!token || where === 'new') return;
    chapterIds(token, where).then((ids) => setHave(ids.length), fail);
  }, [token, where]);

  const chosen = props.decks.filter((d) => ticked.has(d.id));
  const room = where === 'new' ? MAX_CHAPTERS : have === null ? null : MAX_CHAPTERS - have;
  const tooMany = room !== null && chosen.length > room;
  const study = studies?.find((s) => s.id === where);

  const send = async () => {
    if (!token) return;
    setError('');
    setResult(null);
    setBusy(`Sending 1 of ${chosen.length}…`);
    try {
      const target = where === 'new' ? { kind: 'new' as const, name: name.trim(), visibility } : { kind: 'existing' as const, id: where, name: study?.name ?? where };
      const chapters = chosen.map((d) => ({ name: d.name, orientation: d.color === 'w' ? ('white' as const) : ('black' as const), pgn: props.pgnOf(d) }));
      const r = await sendDecks(token, target, chapters, fetch, (done) => setBusy(`Sending ${Math.min(done + 1, chosen.length)} of ${chosen.length}…`));
      setResult({ ...r, name: target.name });
      if (r.stopped?.includes('Connect again')) setToken(null);
    } catch (e) {
      fail(e);
    }
    setBusy('');
  };

  const toggle = (id: string, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(id);
    else next.delete(id);
    setTicked(next);
  };

  return (
    <div className="send-lichess">
      <div className="deck-head">
        <button className="link" onClick={props.onBack}>
          ← {props.backLabel}
        </button>
      </div>
      <h1>Send to Lichess</h1>
      <p className="muted">
        Each deck becomes a chapter in a Lichess study, with its moves, signs, notes and arrows. It is a copy: sending again adds new chapters, and changes made on
        Lichess do not come back here.
      </p>

      <div className="card send-card">
        <div className="send-decks-head">
          <h2>Decks</h2>
          <span className="muted small">
            {chosen.length} of {props.decks.length} ·{' '}
            <button className="link small" onClick={() => setTicked(new Set(props.decks.map((d) => d.id)))}>
              all
            </button>{' '}
            ·{' '}
            <button className="link small" onClick={() => setTicked(new Set())}>
              none
            </button>
          </span>
        </div>
        <ul className="send-decks">
          {props.decks.map((d) => (
            <li key={d.id}>
              <label className="rep-check">
                <input type="checkbox" checked={ticked.has(d.id)} onChange={(e) => toggle(d.id, e.target.checked)} />
                {d.name} <span className="muted small">{d.color === 'w' ? 'White' : 'Black'}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="card send-card">
        {!token ? (
          <>
            <h2>Connect to Lichess</h2>
            <p className="small muted">
              Lichess will ask you to let Shadowbook read and write your studies. This login is only for sending decks and is separate from the Match tab's. Only
              the decks you send leave this browser.
            </p>
            <button className="btn primary" disabled={!chosen.length} onClick={() => void connect([...ticked])}>
              Connect to Lichess
            </button>
          </>
        ) : (
          <>
            <h2>Where to</h2>
            <p className="small muted">
              {username ? `Connected as ${username}. ` : 'Connected. '}
              <button
                className="link small"
                onClick={() => {
                  void disconnect();
                  setToken(null);
                  setStudies(null);
                  setUsername('');
                }}
              >
                Disconnect
              </button>
            </p>
            <label className="rep-check">
              <input type="radio" name="where" checked={where === 'new'} onChange={() => setWhere('new')} />
              A new study
            </label>
            {where === 'new' && (
              <div className="send-new">
                <label>
                  <span className="muted small">Name</span>
                  <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
                </label>
                <label>
                  <span className="muted small">Who can see it</span>
                  <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
                    <option value="private">Only you (private)</option>
                    <option value="unlisted">Anyone with the link (unlisted)</option>
                    <option value="public">Everyone (public)</option>
                  </select>
                </label>
                <p className="small muted">Lichess allows {STUDIES_PER_DAY} new studies a day.</p>
              </div>
            )}
            <label className="rep-check">
              <input type="radio" name="where" checked={where !== 'new'} disabled={!studies?.length} onChange={() => studies?.[0] && setWhere(studies[0].id)} />
              One of your studies{studies && !studies.length ? <span className="muted small"> (you have none yet)</span> : null}
            </label>
            {where !== 'new' && studies && (
              <div className="send-new">
                <select value={where} onChange={(e) => setWhere(e.target.value)} aria-label="Study">
                  {studies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="small muted">{have === null ? 'Counting its chapters…' : `${have} chapter${have === 1 ? '' : 's'} now, room for ${MAX_CHAPTERS - have} more.`}</p>
              </div>
            )}
            {tooMany && (
              <p className="small err">
                {where === 'new'
                  ? `A study holds at most ${MAX_CHAPTERS} chapters. Tick fewer decks.`
                  : `This study has room for ${room} more chapter${room === 1 ? '' : 's'} (a study holds at most ${MAX_CHAPTERS}). Tick fewer decks, or send them to a new study.`}
              </p>
            )}
            <div className="row">
              <button className="btn primary" disabled={!chosen.length || tooMany || !!busy || (where === 'new' ? name.trim().length < 2 : have === null)} onClick={() => void send()}>
                {busy || `Send ${chosen.length} deck${chosen.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}
        {error && (
          <p className="small err" role="alert">
            {error}
          </p>
        )}
        {result && (
          <div className="send-result" role="status">
            <p>
              {result.sent.length ? (
                <>
                  Sent {result.sent.length} deck{result.sent.length === 1 ? '' : 's'} to{' '}
                  <a href={result.url} target="_blank" rel="noreferrer">
                    {result.name}
                  </a>
                  .
                </>
              ) : (
                'Nothing was sent.'
              )}
            </p>
            {result.failed.map((x) => (
              <p key={x.name} className="small err">
                {x.name}: {x.error}
              </p>
            ))}
            {result.stopped && <p className="small err">{result.stopped}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
