import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { choiceShares, scorePct, type LineStat } from '../lib/book';
import { START_FEN, playUci, ucisToSanLine } from '../lib/chess';
import { clampElo, MAIA_ELO_MAX, MAIA_ELO_MIN } from '../lib/maia';
import { ratingFor, withTimeClasses, type Opponent } from '../lib/opponent';
import type { Color, TimeClass } from '../lib/types';
import type { GameSettings } from './Game';

const CLASSES: TimeClass[] = ['bullet', 'blitz', 'rapid', 'classical', 'daily'];

function sanOf(fen: string, uci: string) {
  return playUci(new Chess(fen), uci).san;
}

function afterMoves(...sans: string[]) {
  const c = new Chess();
  sans.forEach((s) => c.move(s));
  return c.fen();
}

function Shares({ opponent, color, fen, prefix }: { opponent: Opponent; color: Color; fen: string; prefix: string }) {
  const shares = choiceShares(opponent.book, color, fen).slice(0, 4);
  if (!shares.length) return <p className="small muted">No games here.</p>;
  return (
    <>
      {shares.map((s) => (
        <div className="share" key={s.uci}>
          <span className="label mono">
            {prefix}
            {sanOf(fen, s.uci)}
          </span>
          <div className="bar">
            <div style={{ width: `${Math.round(s.share * 100)}%` }} />
          </div>
          <span className="pct">{Math.round(s.share * 100)}%</span>
        </div>
      ))}
      <p className="small muted" style={{ marginTop: 6 }}>
        {shares[0].total} games
      </p>
    </>
  );
}

function Lines({ lines }: { lines: LineStat[] }) {
  if (!lines.length) return <p className="small muted">Not enough repeated lines yet.</p>;
  return (
    <>
      {lines.map((l) => {
        const pct = scorePct(l);
        return (
          <div className="line-item" key={l.ucis.join(' ')}>
            <span className="n">{l.n}×</span>
            <span className="mono" style={{ flex: 1, minWidth: 220 }}>
              {ucisToSanLine(l.ucis)}
            </span>
            {pct !== null && <span className={`tag ${pct >= 55 ? 'coral' : pct <= 45 ? 'blue' : ''}`}>scores {pct}%</span>}
          </div>
        );
      })}
    </>
  );
}

export function Report({
  opponent,
  onChange,
  onStart,
  onBack,
}: {
  opponent: Opponent;
  onChange: (o: Opponent) => void;
  onStart: (s: GameSettings) => void;
  onBack: () => void;
}) {
  const [you, setYou] = useState<Color | 'random'>('w');
  const [elo, setElo] = useState(() => (opponent.preset ? MAIA_ELO_MAX : clampElo(Math.round(ratingFor(opponent) / 50) * 50)));
  const [yourElo, setYourElo] = useState(1500);
  const [useBook, setUseBook] = useState(true);

  const available = useMemo(() => CLASSES.filter((tc) => opponent.games.some((g) => g.timeClass === tc)), [opponent.games]);
  const { book } = opponent;
  const ratings = Object.entries(book.ratings).filter(([tc]) => tc !== 'unknown');
  const afterE4 = afterMoves('e4');
  const afterD4 = afterMoves('d4');
  const eloOptions = Array.from({ length: (MAIA_ELO_MAX - MAIA_ELO_MIN) / 50 + 1 }, (_, i) => MAIA_ELO_MIN + i * 50);
  const preset = opponent.preset;

  return (
    <div className="split">
      <div className="main">
        <button className="btn small ghost" onClick={onBack} style={{ marginBottom: 14 }}>
          ← Another player
        </button>
        <div className="row" style={{ marginBottom: 18 }}>
          <div className="avatar" style={{ width: 56, height: 56, fontSize: 24 }}>
            {opponent.username[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0 }}>{opponent.username}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {opponent.site === 'demo' ? 'Demo player (made-up games)' : preset ? 'Classical over-the-board games' : opponent.site} · {opponent.games.length} games read
              {ratings.length > 0 && ' · ' + ratings.map(([tc, r]) => `${tc} ${r}`).join(' · ')}
            </p>
            {preset && preset.matchGames > 0 && <p className="small muted" style={{ margin: 0 }}>Includes {preset.matchGames} games from this match.</p>}
          </div>
        </div>

        {available.length > 1 && (
          <div className="row" style={{ marginBottom: 16 }}>
            <span className="small muted">Games:</span>
            <div className="seg" role="group" aria-label="Time control">
              <button aria-pressed={!opponent.timeClasses} onClick={() => onChange(withTimeClasses(opponent, null))}>
                All
              </button>
              {available.map((tc) => (
                <button key={tc} aria-pressed={opponent.timeClasses?.[0] === tc} onClick={() => onChange(withTimeClasses(opponent, [tc]))}>
                  {tc[0].toUpperCase() + tc.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <div className="grid2">
            <div>
              <p className="eyebrow">As White</p>
              <Shares opponent={opponent} color="w" fen={START_FEN} prefix="1." />
            </div>
            <div>
              <p className="eyebrow">As Black vs 1.e4</p>
              <Shares opponent={opponent} color="b" fen={afterE4} prefix="1…" />
              <p className="eyebrow" style={{ marginTop: 14 }}>
                As Black vs 1.d4
              </p>
              <Shares opponent={opponent} color="b" fen={afterD4} prefix="1…" />
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Favourite lines</h2>
          <p className="small muted">The first moves of their games, most repeated first. “Scores” is their result in those games.</p>
          <p className="eyebrow" style={{ marginTop: 14 }}>
            When they have White
          </p>
          <Lines lines={book.lines.w} />
          <p className="eyebrow" style={{ marginTop: 18 }}>
            When they have Black
          </p>
          <Lines lines={book.lines.b} />
        </div>

        {preset && (
          <div className="card">
            <h2>Where the games come from</h2>
            <p className="small muted">
              {preset.meta.games} classical games ({preset.meta.asWhite} with White, {preset.meta.asBlack} with Black) from official broadcasts relayed on{' '}
              <a href="https://lichess.org/broadcast">Lichess</a>. Rapid, blitz, Armageddon and tiebreak games are left out.
            </p>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {preset.meta.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url}>{s.name}</a> <span className="muted">· {s.games}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <aside className="side">
        <div className="card" style={{ position: 'sticky', top: 16 }}>
          <h2>Spar {opponent.username}</h2>
          <div className="field" style={{ marginTop: 12 }}>
            <span className="small muted">You play</span>
            <div className="seg" role="group" aria-label="Your colour">
              {(['w', 'b', 'random'] as const).map((c) => (
                <button key={c} aria-pressed={you === c} onClick={() => setYou(c)}>
                  {c === 'w' ? 'White' : c === 'b' ? 'Black' : 'Random'}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="elo">Bot strength after the opening</label>
            <select id="elo" className="input" value={elo} onChange={(e) => setElo(Number(e.target.value))}>
              {eloOptions.map((r) => (
                <option key={r} value={r}>
                  Plays like a {r}
                  {r === Math.round(ratingFor(opponent) / 50) * 50 ? ' (their rating)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="you-elo">Your rating (helps the bot judge positions)</label>
            <select id="you-elo" className="input" value={yourElo} onChange={(e) => setYourElo(Number(e.target.value))}>
              {eloOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <label className="row small" style={{ marginTop: 14, gap: 10 }}>
            <input type="checkbox" checked={useBook} onChange={(e) => setUseBook(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#F2B544' }} />
            Play their openings from their games
          </label>
          <button
            className="btn primary"
            style={{ width: '100%', marginTop: 18 }}
            onClick={() => onStart({ you: you === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : you, elo, yourElo, useBook })}
          >
            Start sparring
          </button>
          {preset && (
            <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
              Opens like {preset.meta.display}, then plays like a strong human – not at world-champion strength.
            </p>
          )}
          <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
            The first time the bot leaves the book it loads a 22 MB neural network. It is cached afterwards.
          </p>
        </div>
      </aside>
    </div>
  );
}
