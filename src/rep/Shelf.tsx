// "Your library" (design B): deck cards, most due first, and the starter openings below.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Deck } from './model/types';
import { MiniBoard } from './MiniBoard';
import { sourceLabel } from './DeckView';
import type { Starter } from './starters';

export interface DeckInfo {
  deck: Deck;
  /** Cards of the deck at or after its start move. */
  total: number;
  learned: number;
  due: number;
  signature: string;
}

const colorName = (c: Deck['color']) => (c === 'w' ? 'White' : 'Black');
const STEP = 3;

export function Shelf(props: {
  decks: DeckInfo[];
  /** Positions in the library, each counted once, and how many are up for review today. */
  moves: number;
  dueToday: number;
  starters: (Starter & { signature: string; moves: number; deckId?: string })[];
  onOpen(id: string): void;
  onTrain(id: string): void;
  onTrainAll(): void;
  onAdd(panel?: 'games'): void;
  onAddStarter(id: string): void;
  onPreviewStarter(id: string): void;
  onBackup(): void;
  onInsights(): void;
  onShare(): void;
}) {
  const [filter, setFilter] = useState<'all' | 'w' | 'b'>('all');
  const [shown, setShown] = useState(STEP * 2);
  const ordered = useMemo(() => {
    const recent = (d: Deck) => d.lastTrainedAt ?? '';
    return props.decks
      .filter((d) => filter === 'all' || d.deck.color === filter)
      .sort((a, b) => b.due - a.due || recent(b.deck).localeCompare(recent(a.deck)) || b.deck.updatedAt.localeCompare(a.deck.updatedAt));
  }, [props.decks, filter]);
  const empty = props.decks.length === 0;

  return (
    <div className="shelf">
      <div className="shelf-head">
        <div>
          <h1>Your library</h1>
          {!empty && (
            <p className="muted">
              {props.decks.length} opening{props.decks.length === 1 ? '' : 's'} · {props.moves} move{props.moves === 1 ? '' : 's'} · {props.dueToday} to review today
            </p>
          )}
        </div>
        <div className="row">
          {!empty && (
            <button className={`btn${props.dueToday ? ' primary' : ''}`} disabled={!props.dueToday} onClick={props.onTrainAll}>
              Train all {props.dueToday || ''}
            </button>
          )}
          <button className={`btn${empty ? '' : ' ghost'}`} onClick={() => props.onAdd()}>
            + Add
          </button>
          <button className="btn ghost" onClick={props.onInsights}>
            Insights
          </button>
        </div>
      </div>

      {empty ? (
        <div className="card shelf-welcome">
          <h2>Start your library</h2>
          <p>Shadowbook trains the openings you play with spaced repetition. The quickest start: build decks from the games you have already played.</p>
          <div className="row">
            <button className="btn primary" onClick={() => props.onAdd('games')}>
              Build decks from my games
            </button>
            <button className="btn" onClick={() => props.onAdd()}>
              Other ways to add
            </button>
          </div>
          <p className="muted small">New to openings? Pick a classic below; every move of yours comes with the idea behind it.</p>
        </div>
      ) : (
        <>
          <div className="row shelf-filter" role="group" aria-label="Show decks for">
            {(['all', 'w', 'b'] as const).map((f) => (
              <button key={f} className={`btn small${filter === f ? ' on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : colorName(f)}
              </button>
            ))}
            <span className="muted small">Most due first</span>
          </div>
          <ul className="shelf-grid">
            {ordered.slice(0, shown).map((d) => (
              <li key={d.deck.id} className="card deck-card">
                <button className="deck-card-board" onClick={() => props.onOpen(d.deck.id)} aria-label={`Open ${d.deck.name}`}>
                  <MiniBoard fen={d.signature} orientation={d.deck.color} label={`${d.deck.name}, ${colorName(d.deck.color)}`} />
                </button>
                <p className="eyebrow">{colorName(d.deck.color)}</p>
                <h3>{d.deck.name}</h3>
                <p className="muted small">
                  {d.total} move{d.total === 1 ? '' : 's'} · {sourceLabel(d.deck)}
                </p>
                <div className="bar" role="progressbar" aria-label="Learned" aria-valuenow={d.total ? Math.round((100 * d.learned) / d.total) : 0} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${d.total ? (100 * d.learned) / d.total : 0}%` }} />
                </div>
                <p className="small">
                  {d.total ? Math.round((100 * d.learned) / d.total) : 0}% learned · <b>{d.due}</b> due
                </p>
                <div className="row">
                  <button className={`btn small${d.due ? ' primary' : ''}`} disabled={!d.due} onClick={() => props.onTrain(d.deck.id)}>
                    Train
                  </button>
                  <button className="btn small" onClick={() => props.onOpen(d.deck.id)}>
                    Open
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {ordered.length > STEP * 2 && (
            <div className="shelf-more">
              <button className="btn small ghost" onClick={() => setShown(shown >= ordered.length ? STEP * 2 : shown + STEP)}>
                {shown >= ordered.length ? 'Show less' : `Show ${Math.min(STEP, ordered.length - shown)} more`}
              </button>
            </div>
          )}
        </>
      )}

      <Starters starters={props.starters} onAdd={props.onAddStarter} onPreview={props.onPreviewStarter} onOpen={props.onOpen} />

      {!empty && (
        <p className="shelf-foot muted small">
          The library lives in this browser only.{' '}
          <button className="link" onClick={props.onBackup}>
            Download backup
          </button>{' '}
          ·{' '}
          <button className="link" onClick={props.onShare}>
            Send to Lichess
          </button>
        </p>
      )}
    </div>
  );
}

function Starters({ starters, onAdd, onPreview, onOpen }: { starters: Parameters<typeof Shelf>[0]['starters']; onAdd(id: string): void; onPreview(id: string): void; onOpen(id: string): void }) {
  const row = useRef<HTMLUListElement>(null);
  const [first, setFirst] = useState(0);
  const [perView, setPerView] = useState(3);
  const measure = () => {
    const el = row.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    const step = card.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || '0');
    setFirst(Math.round(el.scrollLeft / step));
    setPerView(Math.max(1, Math.round((el.clientWidth + 1) / step)));
  };
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const page = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth, behavior: 'smooth' });
  const last = Math.min(starters.length, first + perView);

  return (
    <section className="starters" aria-labelledby="starters-title">
      <div className="shelf-head">
        <div>
          <h2 id="starters-title">Start from a classic</h2>
          <p className="muted small">Eight common openings with the main ideas explained.</p>
        </div>
        <div className="row">
          <span className="muted small" aria-live="polite">
            {first + 1}–{last} of {starters.length}
          </span>
          <button className="btn small" onClick={() => page(-1)} disabled={first === 0} aria-label="Previous openings">
            ‹
          </button>
          <button className="btn small" onClick={() => page(1)} disabled={last >= starters.length} aria-label="Next openings">
            ›
          </button>
        </div>
      </div>
      <ul className="starter-row" ref={row} onScroll={measure}>
        {starters.map((s) => (
          <li key={s.id} className="card deck-card">
            <button className="deck-card-board" onClick={() => onPreview(s.id)} aria-label={`Preview ${s.name}`}>
              <MiniBoard fen={s.signature} orientation={s.color} label={`${s.name}, ${colorName(s.color)}`} />
            </button>
            <p className="eyebrow">{colorName(s.color)}</p>
            <h3>{s.name}</h3>
            <p className="small">{s.pitch}</p>
            <p className="muted small">{s.moves} moves with the ideas explained</p>
            <div className="row">
              {s.deckId ? (
                <>
                  <span className="pill">In your library</span>
                  <button className="btn small" onClick={() => onOpen(s.deckId!)}>
                    Open
                  </button>
                </>
              ) : (
                <>
                  <button className="btn small primary" onClick={() => onAdd(s.id)}>
                    Add to my library
                  </button>
                  <button className="btn small" onClick={() => onPreview(s.id)}>
                    Preview
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
