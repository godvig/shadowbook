// One deck as a workbench (design C): the board, the move tree, and the selected move's sign, note and arrows.
// Playing a move on the board adds it to the deck, for either side. A starter's preview is the same view, read-only.
import { useEffect, useMemo, useState } from 'react';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { Board } from '../components/Board';
import { fenKey, playUci, START_FEN, ucisToSanLine } from '../lib/chess';
import { Chess } from 'chess.js';
import { deckCounts, deckDrills } from './model/cards';
import { addPath, childrenOf, makeMain, removeEdge, updateEdge } from './model/deck';
import type { Brush, Card, Deck, Edge, Shape } from './model/types';
import { LineView } from './LineView';
import { cardState, GLYPH_NAMES, GLYPHS, GlyphMark, type CardState } from './marks';
import { RepTree } from './RepTree';
import { buildTree, moveNumber } from './tree';

const BRUSHES: Brush[] = ['green', 'red', 'blue', 'yellow'];
const colorName = (c: Deck['color']) => (c === 'w' ? 'White' : 'Black');

const toDraw = (s: Shape): DrawShape => ({ orig: s.orig as Key, dest: s.dest as Key | undefined, brush: s.brush });
const fromDraw = (s: DrawShape): Shape | null => {
  // Chessground's modifier keys give pale or other brushes; keep the four a PGN can carry.
  const brush = BRUSHES.find((b) => s.brush?.toLowerCase().endsWith(b));
  return brush ? { orig: s.orig, ...(s.dest && s.dest !== s.orig ? { dest: s.dest } : {}), brush } : null;
};

function positionAfter(line: string[]) {
  const c = new Chess(START_FEN);
  for (const u of line) playUci(c, u);
  return c;
}

export function sourceLabel(d: Deck): string {
  const s = d.source;
  if (s.kind === 'lichess') return 'from a Lichess study';
  if (s.kind === 'pgn') return 'from PGN';
  if (s.kind === 'starter') return 'starter opening';
  if (s.kind === 'games') return `from your ${s.site === 'chesscom' ? 'chess.com' : 'Lichess'} games`;
  return 'built on the board';
}

export function DeckView(props: {
  deck: Deck;
  edges: Edge[];
  cards: Map<string, Card>;
  /** Where the board starts, e.g. a position from the Report. */
  start?: string[];
  readOnly?: boolean;
  onBack(): void;
  onChange?(edges: Edge[]): void;
  onUpdate?(patch: Partial<Pick<Deck, 'name' | 'startMove'>>): void;
  onTrain?(): void;
  onExport(): void;
  onDelete?(): void;
  /** Starter preview: add it, or open the copy already in the library. */
  starter?: { inLibrary: boolean; onAdd(): void; onOpen(): void };
}) {
  const { deck, edges, readOnly } = props;
  const [line, setLine] = useState<string[]>(props.start ?? []);
  const [name, setName] = useState(deck.name);
  useEffect(() => setName(deck.name), [deck.name]);

  const chess = useMemo(() => positionAfter(line), [line]);
  const fen = chess.fen();
  const key = fenKey(fen);
  const kids = useMemo(() => childrenOf(edges), [edges]);
  const here = useMemo(() => kids.get(key) ?? [], [kids, key]);
  const parentKey = useMemo(() => fenKey(positionAfter(line.slice(0, -1)).fen()), [line]);
  const selected = line.length ? edges.find((e) => e.from === parentKey && e.uci === line[line.length - 1]) : undefined;
  const tree = useMemo(() => buildTree(deck, edges, props.cards), [deck, edges, props.cards]);
  const drills = deckDrills(deck, edges, props.cards);
  const counts = deckCounts(drills, new Date(), 0, deck.startMove);
  const states = useMemo(() => {
    const now = new Date();
    const out = { new: 0, due: 0, ok: 0 };
    for (const d of drills) out[cardState(d.card, now)]++;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, props.cards]);
  const [view, setView] = useState<'line' | 'all'>('line');
  const own = edges.filter((e) => e.mine && e.rank === 0).length;

  const change = (next: Edge[]) => !readOnly && props.onChange?.(next);
  const forward = () => here[0] && setLine([...line, here[0].uci]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft' && line.length) setLine(line.slice(0, -1));
      if (e.key === 'ArrowRight') forward();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const play = (uci: string) => {
    // Every move is saved with the moves that lead to it, for either side.
    change(addPath(edges, deck, [...line, uci]));
    setLine([...line, uci]);
  };

  const arrows = useMemo(() => here.map((e): DrawShape => ({ orig: e.uci.slice(0, 2) as Key, dest: e.uci.slice(2, 4) as Key, brush: e.mine ? (e.rank === 0 ? 'green' : 'paleGreen') : 'paleBlue' })), [here]);
  const drawn = useMemo(() => (selected?.shapes ?? []).map(toDraw), [selected]);

  return (
    <div className="deck-view">
      <div className="deck-head">
        <button className="link" onClick={props.onBack}>
          ← Your library
        </button>
        {readOnly ? (
          <h1>{deck.name}</h1>
        ) : (
          <input
            className="deck-name"
            aria-label="Deck name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== deck.name ? props.onUpdate?.({ name: name.trim() }) : setName(deck.name)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        )}
        <span className="muted small">
          {colorName(deck.color)} · {own} move{own === 1 ? '' : 's'} of yours · {readOnly ? sourceLabel(deck) : `${counts.total ? Math.round((100 * counts.learned) / counts.total) : 0}% learned`}
        </span>
      </div>

      <div className="rep-grid">
        <div>
          <div className="rep-board">
            <Board
              fen={fen}
              orientation={deck.color}
              movable={readOnly ? null : (chess.turn() as Deck['color'])}
              lastMove={line[line.length - 1]}
              shapes={arrows}
              drawn={drawn}
              onMove={play}
              onShapes={(s) => selected && !readOnly && change(updateEdge(edges, selected.from, selected.uci, { shapes: s.map(fromDraw).filter((x): x is Shape => !!x) }))}
            />
          </div>
          <div className="row deck-controls">
            <button className="btn small" disabled={!line.length} onClick={() => setLine(line.slice(0, -1))} aria-label="Back one move">
              ← Back
            </button>
            <button className="btn small" disabled={!here.length} onClick={forward} aria-label="Forward one move">
              Forward →
            </button>
            {props.starter ? (
              props.starter.inLibrary ? (
                <button className="btn small primary" onClick={props.starter.onOpen}>
                  Open my copy
                </button>
              ) : (
                <button className="btn small primary" onClick={props.starter.onAdd}>
                  Add to my library
                </button>
              )
            ) : (
              <button className="btn small primary" disabled={!counts.total} onClick={props.onTrain}>
                Train
              </button>
            )}
            <button className="btn small" disabled={!edges.length} onClick={props.onExport}>
              Export PGN
            </button>
          </div>
          <p className="muted small rep-arrows">
            Arrows on the board are the book moves from this position: <span className="sw green" /> your main move, <span className="sw pale-green" /> your other moves,{' '}
            <span className="sw blue" /> their replies you have prepared for.
          </p>
          {!readOnly && (
            <p className="muted small">
              Play a move on the board to add it, for either side. Select a move in the tree to give it a sign or a note. Arrows you draw yourself (right-click and drag) are saved on the selected move.
            </p>
          )}
        </div>

        <div className="card rep-side">
          <div className="moves-head">
            <h2>Moves</h2>
            <div className="seg" role="group" aria-label="Show">
              <button className={view === 'line' ? 'on' : ''} aria-pressed={view === 'line'} onClick={() => setView('line')}>
                This line
              </button>
              <button className={view === 'all' ? 'on' : ''} aria-pressed={view === 'all'} onClick={() => setView('all')}>
                All lines
              </button>
            </div>
          </div>
          <MoveKey states={states} view={view} />
          {deck.intro && !line.length && <p className="small deck-note">{deck.intro}</p>}
          {view === 'line' ? (
            <LineView deck={deck} edges={edges} cards={props.cards} path={line} onOpen={setLine} />
          ) : (
            <RepTree nodes={tree} onOpen={setLine} current={line.join(' ')} />
          )}

          <div className="deck-move">
            {!selected ? (
              <p className="muted small">{line.length ? ucisToSanLine(line) : 'Start position.'} Select a move in the tree, or play one on the board.</p>
            ) : (
              <MoveDetails
                key={line.join(' ')}
                edge={selected}
                line={line}
                readOnly={!!readOnly}
                onPatch={(patch) => change(updateEdge(edges, selected.from, selected.uci, patch))}
                onMain={() => change(makeMain(edges, selected.from, selected.uci))}
                onRemove={() => {
                  const next = removeEdge(edges, selected.from, selected.uci);
                  const after = edges.length - next.length - 1;
                  if (after > 0 && !window.confirm(`Remove ${selected.san} and the ${after} move${after === 1 ? '' : 's'} after it?`)) return;
                  change(next);
                  setLine(line.slice(0, -1));
                }}
              />
            )}
          </div>

          {!readOnly && (
            <div className="deck-settings">
              <label>
                <span className="muted small">Training starts at move</span>
                <select value={deck.startMove} onChange={(e) => props.onUpdate?.({ startMove: Number(e.target.value) })}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn small ghost" onClick={props.onDelete}>
                Delete deck
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MoveDetails({ edge, line, readOnly, onPatch, onMain, onRemove }: { edge: Edge; line: string[]; readOnly: boolean; onPatch(p: Partial<Edge>): void; onMain(): void; onRemove(): void }) {
  const [note, setNote] = useState(edge.comment ?? '');
  const role = edge.mine ? (edge.rank === 0 ? 'your main move' : 'also accepted') : edge.rank === 0 ? 'their main reply' : 'their other reply';
  return (
    <>
      <p className="deck-move-title">
        <b>
          {moveNumber(line.length)}
          {edge.san}
        </b>
        <GlyphMark glyph={edge.glyph} /> <span className="muted small">{role}</span>
      </p>
      {readOnly ? (
        edge.comment && <p className="small deck-note">{edge.comment}</p>
      ) : (
        <>
          <div className="row glyphs" role="group" aria-label="Move sign">
            {GLYPHS.map((g) => (
              <button key={g} className={`btn small${edge.glyph === g ? ' on' : ''}`} aria-pressed={edge.glyph === g} title={GLYPH_NAMES[g]} onClick={() => onPatch({ glyph: edge.glyph === g ? undefined : g })}>
                <GlyphMark glyph={g} />
              </button>
            ))}
          </div>
          <label className="deck-note-edit">
            <span className="muted small">Note</span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note.trim() !== (edge.comment ?? '') && onPatch({ comment: note.trim() || undefined })} />
          </label>
          <div className="row">
            {edge.rank > 0 && (
              <button className="btn small" onClick={onMain}>
                Make main
              </button>
            )}
            <button className="btn small ghost" onClick={onRemove}>
              Remove move
            </button>
          </div>
        </>
      )}
    </>
  );
}

/** What the marks in the move list mean, with this deck's cards counted by state. */
function MoveKey({ states, view }: { states: Record<CardState, number>; view: 'line' | 'all' }) {
  const total = states.new + states.due + states.ok;
  return (
    <div className="move-key">
      <div className="rep-tree key-row">
        <span className="key-item">
          <span className="tm mine">e4</span> your move
        </span>
        <span className="key-item">
          <span className="tm mine alt">Bb5</span> also counts
        </span>
        <span className="key-item">
          <span className="tm">e5</span> their move
        </span>
      </div>
      {total > 0 && (
        <div className="key-row" aria-label="Your cards in this deck">
          <span className="state-pill new">
            <span className="dot new" /> {states.new} not learned yet
          </span>
          <span className="state-pill due">
            <span className="dot due" /> {states.due} due
          </span>
          <span className="state-pill ok">
            <span className="dot ok" /> {states.ok} learned
          </span>
        </div>
      )}
      <details className="rep-help">
        <summary className="small">More about the marks</summary>
        <ul className="small">
          <li>The dot after your move is its card, coloured as above.</li>
          {view === 'line' ? (
            <li>
              <span className="alt-move">or 3…Nf6</span> is another way the line can go from there. Click it to follow that line.
            </li>
          ) : (
            <li>↳ starts another line from that move. ⤴ means the line reaches a position shown elsewhere in the tree and continues there.</li>
          )}
          <li className="key-glyphs">
            Signs: {GLYPHS.map((g) => (
              <span key={g}>
                <GlyphMark glyph={g} /> {GLYPH_NAMES[g].toLowerCase()}
              </span>
            ))}
          </li>
        </ul>
      </details>
    </div>
  );
}
