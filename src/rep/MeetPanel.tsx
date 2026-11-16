import { useEffect, useMemo, useState } from 'react';
import { ucisToSanLine } from '../lib/chess';
import type { Opponent } from '../lib/opponent';
import type { Color } from '../lib/types';
import { meet, prepQueue } from './meet';
import { ownMoveIndex, type OwnMoveIndex } from './model/deck';
import { loadLibrary } from './db';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const name = (c: Color) => (c === 'w' ? 'White' : 'Black');

/** "Where your book meets theirs", for both colours. Loads the Library itself when not given one. */
export function MeetPanel({ opponent, own: given, onTrain, onFill, compact }: {
  opponent: Opponent;
  own?: OwnMoveIndex;
  onTrain(color: Color): void;
  onFill(color: Color, line: string[]): void;
  compact?: boolean;
}) {
  const [loaded, setLoaded] = useState<OwnMoveIndex | null>(null);
  useEffect(() => {
    if (!given)
      loadLibrary(new Date().toISOString().slice(0, 10))
        .then((lib) => setLoaded(ownMoveIndex(lib.decks, lib.edges)))
        .catch(() => setLoaded(ownMoveIndex([], [])));
  }, [given]);
  const own = given ?? loaded;
  const reports = useMemo(() => (own ? (['w', 'b'] as Color[]).map((c) => meet(own, opponent.book, c, opponent.bookPlies)) : []), [own, opponent]);
  if (!own) return null;
  const empty = reports.every((r) => !r.size);

  return (
    <div className="card meet">
      <h2>Your book vs {opponent.username}'s</h2>
      {empty ? (
        <p className="small muted">
          Add your openings in the Library and this shows where {opponent.username}'s real games leave your preparation — and lets you drill exactly the positions they steer into.
        </p>
      ) : (
        <p className="small muted">Your Library replayed against the moves {opponent.username} actually chooses, weighted by how often.</p>
      )}
      <div className="meet-cols">
        {reports.map((r) => (
          <div key={r.color} className="meet-col">
            <p className="eyebrow">You as {name(r.color)}</p>
            {!r.size ? (
              <p className="small muted">No {name(r.color)} repertoire yet.</p>
            ) : !r.theirGames ? (
              <p className="small muted">No games of theirs with {name(r.color === 'w' ? 'b' : 'w')}.</p>
            ) : (
              <>
                <div className="meet-bar" aria-label={`${pct(r.covered)} covered`}>
                  <span style={{ width: pct(r.covered) }} />
                </div>
                <p className="small">
                  <b>{pct(r.covered)}</b> of their games stay inside your prep{r.uncovered > 0.005 && <>; <b className="warn">{pct(r.uncovered)}</b> reach a position where you have no move.</>}
                </p>
                {r.gaps.length > 0 && (
                  <ul className="meet-gaps">
                    {r.gaps.slice(0, compact ? 3 : 6).map((g) => (
                      <li key={g.fen}>
                        <span className="mono">{ucisToSanLine(g.line)}</span>
                        <span className="muted small"> · {pct(g.reach)}</span>
                        <button className="link" onClick={() => onFill(r.color, g.line)}>add a move</button>
                      </li>
                    ))}
                  </ul>
                )}
                <button className="btn small" disabled={!prepQueue(r).length} onClick={() => onTrain(r.color)}>
                  Drill {prepQueue(r).length} position{prepQueue(r).length === 1 ? '' : 's'} they reach
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
