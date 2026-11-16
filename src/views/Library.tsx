import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { Board } from '../components/Board';
import { fenKey, playUci, START_FEN, ucisToSanLine } from '../lib/chess';
import type { Color } from '../lib/types';
import * as db from '../rep/db';
import { backupJson, parseBackup } from '../rep/model/backup';
import { cardId, deckCounts, deckDrills, drillQueue, gradeCard, isNew, Rating, syncCards, type Drill } from '../rep/model/cards';
import { addPath, childrenOf, makeMain, newDeck, ownMoveIndex, removeEdge } from '../rep/model/deck';
import { importMessage, importText } from '../rep/model/importer';
import { V1_DECK_NAME } from '../rep/model/migrateV1';
import { loadOpenings } from '../rep/model/openings';
import { serializeDeck } from '../rep/model/pgn';
import type { Card, Deck, Edge, LibraryData } from '../rep/model/types';
import { meet, prepQueue } from '../rep/meet';
import { MeetPanel } from '../rep/MeetPanel';
import { RepTree } from '../rep/RepTree';
import { buildTree } from '../rep/tree';
import { chapterSource, fetchStudy, pgnSource } from '../rep/lichessStudy';
import type { Opponent } from '../lib/opponent';
import '../rep/rep.css';

const today = () => new Date().toISOString().slice(0, 10);
const sanOf = (fen: string, uci: string) => {
  try {
    return playUci(new Chess(fen), uci).san;
  } catch {
    return uci;
  }
};
const arrow = (uci: string, brush: string): DrawShape => ({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush });
const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black');

function positionAfter(line: string[]) {
  const c = new Chess(START_FEN);
  for (const u of line) playUci(c, u);
  return { fen: c.fen(), turn: c.turn() as Color };
}

type Mode = 'overview' | 'build' | 'review' | 'prep';
type Outcome = 'clean' | 'hint' | 'wrong';
/** First try without help = Good, with a hint = Hard, wrong or revealed = Again. */
const ratingFor = (o: Outcome) => (o === 'clean' ? Rating.Good : o === 'hint' ? Rating.Hard : Rating.Again);

export interface LibraryStart {
  prep?: Color;
  fill?: { color: Color; line: string[] };
}

/** "Add a move" from Report: the deck of that colour that has the position, else the one trained last. */
function deckFor(decks: Deck[], edges: Edge[], color: Color, line: string[]): Deck | undefined {
  const key = fenKey(positionAfter(line).fen);
  const mine = decks.filter((d) => d.color === color);
  const has = mine.find((d) => edges.some((e) => e.deckId === d.id && (e.to === key || e.from === key)));
  const recent = (d: Deck) => d.lastTrainedAt ?? d.updatedAt;
  return has ?? [...mine].sort((a, b) => recent(b).localeCompare(recent(a)))[0];
}

export function Library({ opponent, start }: { opponent?: Opponent | null; start?: LibraryStart }) {
  const [lib, setLib] = useState<db.Stored | null>(null);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('overview');
  const [prepColor, setPrepColor] = useState<Color>(start?.prep ?? 'w');
  const [buildFrom, setBuildFrom] = useState<string[]>([]);
  const [error, setError] = useState('');
  const handledStart = useRef(false);

  const save = (next: db.Stored, change: db.Change) => {
    setLib(next);
    db.apply(change).catch(() => setError('Could not save to this browser.'));
  };

  /** Replaces one deck's moves, then brings the cards in line. */
  const editDeck = (base: db.Stored, deck: Deck, edges: Edge[]) => {
    const now = new Date();
    const d = { ...deck, updatedAt: now.toISOString() };
    const decks = base.decks.some((x) => x.id === d.id) ? base.decks.map((x) => (x.id === d.id ? d : x)) : [...base.decks, d];
    const all = [...base.edges.filter((e) => e.deckId !== d.id), ...edges];
    const synced = syncCards(decks, all, base.cards, now);
    save({ ...base, decks, edges: all, cards: synced.cards }, { decks: [d], edges: [{ deckId: d.id, edges }], cards: synced.added, deleteCards: synced.removed });
  };

  const createDeck = (base: db.Stored, color: Color) => {
    const d = newDeck({ name: V1_DECK_NAME[color], color, source: { kind: 'board' } });
    save({ ...base, decks: [...base.decks, d] }, { decks: [d] });
    return d;
  };

  useEffect(() => {
    db.loadLibrary(today())
      .then((stored) => {
        setLib(stored);
        setDeckId(stored.decks[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error && err.message.includes('another tab') ? err.message : 'This browser does not allow local storage, so the library cannot be saved here.'));
  }, []);

  // Coming from the Report view: drill what the opponent reaches, or add a move where they leave your book.
  useEffect(() => {
    if (!lib || handledStart.current || !start) return;
    handledStart.current = true;
    if (start.prep) setMode('prep');
    if (start.fill) {
      const { color, line } = start.fill;
      const d = deckFor(lib.decks, lib.edges, color, line) ?? createDeck(lib, color);
      setDeckId(d.id);
      setBuildFrom(line);
      setMode('build');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib]);

  const own = useMemo(() => (lib ? ownMoveIndex(lib.decks, lib.edges) : null), [lib]);
  const cards = useMemo(() => new Map((lib?.cards ?? []).map((c) => [c.id, c])), [lib]);
  // Computed once per prep session, so grading cards doesn't reshuffle it.
  const prepDrills = useMemo(() => {
    if (mode !== 'prep' || !opponent || !lib || !own) return [];
    return prepQueue(meet(own, opponent.book, prepColor, opponent.bookPlies)).flatMap((m): Drill[] => {
      const id = cardId(prepColor, m.key, m.moves[0]);
      const card = cards.get(id);
      const home = lib.edges.find((e) => e.from === m.key && e.uci === m.moves[0] && e.mine && e.rank === 0 && lib.decks.some((d) => d.id === e.deckId && d.color === prepColor));
      return card && home ? [{ card, deckId: home.deckId, key: m.key, move: Math.floor(m.line.length / 2) + 1, path: m.line, moves: m.moves }] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, prepColor, opponent, lib === null]);

  if (error) return <div className="card rep-wrap"><p className="err">{error}</p></div>;
  if (!lib || !own) return <div className="card rep-wrap"><p className="muted">Opening your library…</p></div>;

  const deck = lib.decks.find((d) => d.id === deckId) ?? null;
  const deckEdges = deck ? lib.edges.filter((e) => e.deckId === deck.id) : [];
  const now = new Date();
  const newLeft = lib.settings.newPerDay - lib.newToday;
  const drills = deck ? deckDrills(deck, deckEdges, cards) : [];
  const q = drillQueue(drills, now, newLeft, deck?.startMove);

  const onGraded = (d: Drill, o: Outcome) => {
    const at = new Date();
    const { card, review } = gradeCard(d.card, ratingFor(o), { deckId: d.deckId, mode: 'positions', retention: lib.settings.retention }, at);
    const wasNew = isNew(d.card);
    const decks = lib.decks.map((x) => (x.id === d.deckId ? { ...x, lastTrainedAt: at.toISOString() } : x));
    const newToday = lib.newToday + (wasNew ? 1 : 0);
    save(
      { ...lib, decks, newToday, cards: lib.cards.map((c) => (c.id === card.id ? card : c)) },
      { cards: [card], reviews: [review], decks: decks.filter((x) => x.id === d.deckId), newToday: wasNew ? { day: today(), n: newToday } : undefined },
    );
  };

  return (
    <div className="rep-wrap">
      <div className="rep-head">
        <div>
          <h1>Library</h1>
          <p className="muted">Your opening repertoire, drilled with spaced repetition. Stored only in this browser.</p>
        </div>
        {lib.decks.length > 0 && mode === 'overview' && (
          <label className="rep-pick">
            <span className="muted small">Deck</span>
            <select aria-label="Deck" value={deck?.id ?? ''} onChange={(e) => setDeckId(e.target.value)}>
              {lib.decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {colorName(d.color)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {mode === 'overview' && (
        <Overview
          lib={lib}
          deck={deck}
          drills={drills}
          due={q.filter((d) => !isNew(d.card)).length}
          fresh={q.filter((d) => isNew(d.card)).length}
          cards={cards}
          onReview={() => setMode('review')}
          onBuild={() => {
            setBuildFrom([]);
            setMode('build');
          }}
          onOpen={(line) => {
            setBuildFrom(line);
            setMode('build');
          }}
          onNewDeck={(c) => setDeckId(createDeck(lib, c).id)}
          onImported={(next, change, firstId) => {
            save({ ...lib, ...next }, change);
            if (firstId) setDeckId(firstId);
          }}
          onRestore={async (b) => {
            await db.restore(b);
            const stored = await db.loadLibrary(today());
            setLib(stored);
            setDeckId(stored.decks[0]?.id ?? null);
          }}
          onDelete={() => {
            if (!deck) return;
            const decks = lib.decks.filter((d) => d.id !== deck.id);
            const edges = lib.edges.filter((e) => e.deckId !== deck.id);
            const synced = syncCards(decks, edges, lib.cards);
            save({ ...lib, decks, edges, cards: synced.cards }, { deleteDecks: [deck.id], deleteCards: synced.removed });
            setDeckId(decks[0]?.id ?? null);
          }}
        />
      )}
      {mode === 'overview' && opponent && (
        <MeetPanel
          opponent={opponent}
          own={own}
          onTrain={(c) => {
            setPrepColor(c);
            setMode('prep');
          }}
          onFill={(c, line) => {
            const d = deckFor(lib.decks, lib.edges, c, line) ?? createDeck(lib, c);
            setDeckId(d.id);
            setBuildFrom(line);
            setMode('build');
          }}
        />
      )}
      {mode === 'build' && deck && (
        <Build key={deck.id + buildFrom.join(' ')} deck={deck} start={buildFrom} edges={deckEdges} onChange={(edges) => editDeck(lib, deck, edges)} onDone={() => setMode('overview')} />
      )}
      {mode === 'prep' && opponent && (
        <Review key={'prep' + prepColor} color={prepColor} title={`Positions ${opponent.username} steers into`} initial={prepDrills} onGraded={onGraded} onDone={() => setMode('overview')} />
      )}
      {mode === 'review' && deck && <Review key={deck.id} color={deck.color} title={deck.name} initial={q} onGraded={onGraded} onDone={() => setMode('overview')} />}
    </div>
  );
}

function Overview(props: {
  lib: db.Stored;
  deck: Deck | null;
  drills: Drill[];
  cards: Map<string, Card>;
  due: number;
  fresh: number;
  onReview(): void;
  onBuild(): void;
  onOpen(line: string[]): void;
  onNewDeck(color: Color): void;
  onImported(next: LibraryData, change: db.Change, firstId?: string): void;
  onRestore(b: ReturnType<typeof parseBackup>): Promise<void>;
  onDelete(): void;
}) {
  const { lib, deck } = props;
  const [pgn, setPgn] = useState('');
  const [note, setNote] = useState<string[]>([]);
  const [study, setStudy] = useState('');
  const [studyNote, setStudyNote] = useState<string[]>([]);
  const [backupNote, setBackupNote] = useState('');
  const [busy, setBusy] = useState(false);
  const tree = useMemo(() => (deck ? buildTree(deck, lib.edges.filter((e) => e.deckId === deck.id), props.cards) : []), [deck, lib.edges, props.cards]);
  const file = useRef<HTMLInputElement>(null);
  const counts = deckCounts(props.drills, new Date(), 0, deck?.startMove);
  const fallback: Color = deck?.color ?? 'w';

  const runImport = async (text: string, source: Parameters<typeof importText>[2]['source']) => {
    const r = importText(lib, text, { color: fallback, source, openings: await loadOpenings() });
    if (r.decks.length) {
      props.onImported(r.lib, { decks: r.write.decks, edges: r.write.edges, cards: r.write.cardsAdded, deleteCards: r.write.cardsRemoved }, r.decks[0].deck.id);
    }
    return r;
  };

  return (
    <>
      {deck ? (
        <div className="card rep-today">
          <div className="rep-stats">
            <div><b>{props.due}</b><span>due</span></div>
            <div><b>{props.fresh}</b><span>new today</span></div>
            <div><b>{counts.learned}/{counts.total}</b><span>positions learned</span></div>
          </div>
          <div className="row">
            <button className="btn primary" disabled={!props.due && !props.fresh} onClick={props.onReview}>
              {props.due || props.fresh ? `Train ${props.due + props.fresh}` : 'Nothing due — come back tomorrow'}
            </button>
            <button className="btn" onClick={props.onBuild}>Add moves on the board</button>
          </div>
        </div>
      ) : (
        <div className="card">
          <h2>Start your library</h2>
          <p className="muted small">Import a Lichess study or a PGN below, or start a deck and add moves on the board.</p>
        </div>
      )}
      <div className="card">
        <div className="row">
          <span className="muted small">New deck:</span>
          <button className="btn small" onClick={() => props.onNewDeck('w')}>White</button>
          <button className="btn small" onClick={() => props.onNewDeck('b')}>Black</button>
        </div>
      </div>

      {deck && (
        <div className="card">
          <h2>{deck.name}</h2>
          <p className="muted small">{colorName(deck.color)} · {counts.total} position{counts.total === 1 ? '' : 's'}</p>
          <p className="rep-legend">
            <span><b>Bold</b> = your move, <i style={{ all: 'unset', fontStyle: 'italic' }}>italic</i> = also accepted</span>
            <span><i style={{ background: '#8a90a0' }} />new</span>
            <span><i style={{ background: '#ff8a80' }} />due</span>
            <span><i style={{ background: '#7bd88f' }} />learned</span>
            <span>⤴ = continues elsewhere</span>
            <span>Click a move to open the position.</span>
          </p>
          <RepTree nodes={tree} onOpen={props.onOpen} />
        </div>
      )}

      <div className="card">
        <h2>Import from a Lichess study</h2>
        <p className="muted small">Paste a link to a public or unlisted study, or to one chapter. Each chapter becomes a deck, White or Black by its board orientation. Importing the same study again updates those decks and never removes your moves.</p>
        <form
          className="rep-study"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const { ref, pgn: text } = await fetchStudy(study);
              const r = await runImport(text, (g) => chapterSource(g.tags, ref));
              setStudyNote(importMessage(r));
              if (r.decks.length) setStudy('');
            } catch (err) {
              setStudyNote([err instanceof Error ? err.message : 'Could not import that study.']);
            }
            setBusy(false);
          }}
        >
          <input value={study} onChange={(e) => setStudy(e.target.value)} placeholder="https://lichess.org/study/…" aria-label="Lichess study link" />
          <button className="btn" disabled={!study.trim() || busy}>{busy ? 'Importing…' : 'Import study'}</button>
        </form>
        <Notes lines={studyNote} />
      </div>

      <div className="card">
        <h2>Import PGN</h2>
        <p className="muted small">Paste one or more games. Each becomes a deck; every variation, comment, sign and arrow is kept. Games without an Orientation tag become {colorName(fallback)} decks.</p>
        <textarea className="rep-pgn" value={pgn} onChange={(e) => setPgn(e.target.value)} placeholder={'1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5 4. c3) 3... a6 *'} rows={5} aria-label="PGN" />
        <div className="row">
          <button
            className="btn"
            disabled={!pgn.trim() || busy}
            onClick={async () => {
              const r = await runImport(pgn, (g) => pgnSource(g.tags));
              setNote(importMessage(r));
              if (r.decks.length) setPgn('');
            }}
          >
            Import
          </button>
        </div>
        <Notes lines={note} />
      </div>

      <div className="card rep-backup">
        <h2>Backup and export</h2>
        <p className="muted small">The library lives in this browser only. Clearing site data removes it, so keep a copy.</p>
        <div className="row">
          <button
            className="btn small"
            disabled={!lib.decks.length}
            onClick={async () => {
              const blob = new Blob([backupJson(await db.loadBackup())], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `shadowbook-library-${today()}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Download backup
          </button>
          <button className="btn small" onClick={() => file.current?.click()}>Restore backup</button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const b = parseBackup(await f.text());
                if (lib.decks.length && !window.confirm(`Replace your library (${lib.decks.length} decks) with this backup (${b.decks.length} decks)? This cannot be undone.`)) return;
                await props.onRestore(b);
                setBackupNote(`Restored ${b.decks.length} deck${b.decks.length === 1 ? '' : 's'} with ${b.cards.length} positions.`);
              } catch (err) {
                setBackupNote(err instanceof Error ? err.message : 'Could not read that file.');
              }
            }}
          />
          <button
            className="btn small"
            disabled={!deck}
            onClick={() => {
              if (!deck) return;
              const blob = new Blob([serializeDeck(deck, lib.edges.filter((e) => e.deckId === deck.id))], { type: 'application/x-chess-pgn' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `${deck.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'deck'}.pgn`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Export PGN
          </button>
          <button
            className="btn small ghost"
            disabled={!deck}
            onClick={() => {
              if (!deck) return;
              const n = lib.edges.filter((e) => e.deckId === deck.id && e.mine).length;
              if (window.confirm(`Delete ${deck.name}? Your progress on its ${n} move${n === 1 ? '' : 's'} will be lost. Download a backup first if you might want it back.`)) props.onDelete();
            }}
          >
            Delete this deck
          </button>
        </div>
        {backupNote && <p className="muted small">{backupNote}</p>}
      </div>
    </>
  );
}

function Notes({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <ul className="rep-notes muted small">
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

function Build({ deck, start, edges, onChange, onDone }: { deck: Deck; start: string[]; edges: Edge[]; onChange(edges: Edge[]): void; onDone(): void }) {
  const [line, setLine] = useState<string[]>(start);
  const { fen, turn } = useMemo(() => positionAfter(line), [line]);
  const key = fenKey(fen);
  const here = useMemo(() => childrenOf(edges).get(key) ?? [], [edges, key]);
  const mine = turn === deck.color;

  const play = (uci: string) => {
    // Your move is saved with the path to it, so the moves of the other side are stored too.
    if (mine) onChange(addPath(edges, deck, [...line, uci]));
    setLine([...line, uci]);
  };

  const shapes = here.map((e) => arrow(e.uci, mine ? (e.rank === 0 ? 'green' : 'paleGreen') : 'paleBlue'));

  return (
    <div className="rep-grid">
      <div className="rep-board">
        <Board fen={fen} orientation={deck.color} movable={turn} lastMove={line[line.length - 1]} shapes={shapes} onMove={play} />
      </div>
      <div className="card rep-side">
        <h2>Add moves</h2>
        <p className="muted small">
          {deck.name}. Play both sides. Every move you make for {colorName(deck.color)} is saved, with the moves that led to it. Green arrows are your moves already saved; blue arrows are replies you've prepared for.
        </p>
        <p className="rep-line">{line.length ? ucisToSanLine(line) : 'Start position'}</p>
        {mine && here.length > 0 && (
          <ul className="rep-moves">
            {here.map((e) => (
              <li key={e.uci}>
                <b>{e.san}</b>
                {e.glyph}
                {e.rank === 0 ? <span className="pill">main</span> : <button className="link" onClick={() => onChange(makeMain(edges, key, e.uci))}>make main</button>}
                <button
                  className="link"
                  onClick={() => {
                    const next = removeEdge(edges, key, e.uci);
                    const after = edges.length - next.length - 1;
                    if (after > 0 && !window.confirm(`Remove ${e.san} and the ${after} move${after === 1 ? '' : 's'} after it?`)) return;
                    onChange(next);
                  }}
                >
                  remove
                </button>
                {e.comment && <span className="muted small">{e.comment}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button className="btn small" disabled={!line.length} onClick={() => setLine(line.slice(0, -1))}>Back</button>
          <button className="btn small" disabled={!line.length} onClick={() => setLine([])}>Start</button>
          <button className="btn small primary" onClick={onDone}>Done</button>
        </div>
      </div>
    </div>
  );
}

function Review({ color, title, initial, onGraded, onDone }: { color: Color; title?: string; initial: Drill[]; onGraded(d: Drill, o: Outcome): void; onDone(): void }) {
  const [drills, setDrills] = useState(initial);
  const [i, setI] = useState(0);
  const [hint, setHint] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);
  const [solved, setSolved] = useState<string | null>(null);
  const [tally, setTally] = useState({ clean: 0, hint: 0, wrong: 0 });
  const drill = drills[i];

  if (!drill) {
    return (
      <div className="card rep-done">
        <h2>Done for now</h2>
        <p>
          {tally.clean} right first time · {tally.hint} with a hint · {tally.wrong} missed
        </p>
        <p className="muted small">Missed positions come back soon; the ones you knew come back later, a little further apart each time.</p>
        <button className="btn primary" onClick={onDone}>Back to library</button>
      </div>
    );
  }

  const fen = drill.card.fen;
  const grade = (o: Outcome) => {
    onGraded(drill, o);
    setTally((t) => ({ ...t, [o]: t[o] + 1 }));
    // A missed card is shown once more at the end of the session.
    if (o === 'wrong') setDrills((d) => [...d, drill]);
  };
  const next = () => {
    setI(i + 1);
    setHint(false);
    setWrong(null);
    setSolved(null);
  };

  const onMove = (uci: string) => {
    if (drill.moves.includes(uci)) {
      setSolved(uci);
      if (!wrong) grade(hint ? 'hint' : 'clean');
      setTimeout(next, 650);
    } else if (!wrong) {
      setWrong(uci);
      grade('wrong');
    }
  };

  const main = drill.moves[0];
  const shapes: DrawShape[] = [];
  if (wrong) shapes.push(arrow(main, 'green'));
  else if (hint) shapes.push({ orig: main.slice(0, 2) as Key, brush: 'green' });
  const display = solved ? (() => { const c = new Chess(fen); playUci(c, solved); return c.fen(); })() : fen;

  return (
    <div className="rep-grid">
      <div className="rep-board">
        <Board key={drill.card.id + i + (wrong ?? '')} fen={display} orientation={color} movable={solved ? null : color} lastMove={solved ?? drill.path[drill.path.length - 1]} shapes={shapes} onMove={onMove} />
      </div>
      <div className="card rep-side">
        <p className="muted small">
          {i + 1} / {drills.length} {isNew(drill.card) && <span className="pill">new</span>}
        </p>
        {title && <p className="eyebrow">{title}</p>}
        <h2>Your move</h2>
        <p className="rep-line">{drill.path.length ? ucisToSanLine(drill.path) : 'Start position'}</p>
        {drill.moves.length > 1 && !wrong && <p className="muted small">You have {drill.moves.length} moves here; any of them counts.</p>}
        {wrong && (
          <p className="err">
            Not {sanOf(fen, wrong)} — you play <b>{sanOf(fen, main)}</b>
            {drill.moves.length > 1 && <> (or {drill.moves.slice(1).map((m) => sanOf(fen, m)).join(', ')})</>}. Play it to continue.
          </p>
        )}
        {solved && <p className="ok">{sanOf(fen, solved)} ✓</p>}
        <div className="row">
          <button className="btn small" disabled={hint || !!wrong || !!solved} onClick={() => setHint(true)}>Hint</button>
          <button
            className="btn small"
            disabled={!!wrong || !!solved}
            onClick={() => {
              setWrong(main);
              grade('wrong');
            }}
          >
            Show move
          </button>
          <button className="btn small ghost" onClick={onDone}>Stop</button>
        </div>
      </div>
    </div>
  );
}
