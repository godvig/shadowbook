// "Build decks from your games": fetch the games in this browser, pick time classes, preview the decks with the
// games and score behind every move of yours, then save. The counting is in model/fromGames.ts.
import { useState } from 'react';
import type { Game } from '../lib/types';
import type * as db from './db';
import { GamesForm, type Fetched } from './GamesForm';
import { ucisToSanLine } from '../lib/chess';
import { mainLine, makeMain } from './model/deck';
import { buildDecks, commitBuild, planBuild, type GamesSite, type PlannedDeck } from './model/fromGames';
import { loadOpenings } from './model/openings';
import type { Card, Color, LibraryData } from './model/types';
import { RepTree } from './RepTree';
import { buildTree } from './tree';

const pct = (points: number, games: number) => `${Math.round((100 * points) / games)}%`;
const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black');

export function FromGames({
  lib,
  cards,
  initial,
  onSaved,
}: {
  lib: LibraryData;
  cards: Map<string, Card>;
  initial?: { site: GamesSite; username: string };
  /** Called with what was saved, as one sentence for the person. */
  onSaved(next: LibraryData, change: db.Change, message: string): void;
}) {
  const [color, setColor] = useState<Color | 'both'>('both');
  const [plan, setPlan] = useState<PlannedDeck[] | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');

  const preview = async (picked: Game[], fetched: Fetched) => {
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
      <GamesForm
        initial={initial}
        action={(n) => `Preview ${n} game${n === 1 ? '' : 's'}`}
        onGo={(picked, fetched) => void preview(picked, fetched)}
        onReset={() => {
          setPlan(null);
          setNote('');
        }}
        extra={
          <label>
            <span className="muted small">Colour</span>
            <select value={color} onChange={(e) => setColor(e.target.value as Color | 'both')}>
              <option value="both">White and Black</option>
              <option value="w">White</option>
              <option value="b">Black</option>
            </select>
          </label>
        }
      />

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
