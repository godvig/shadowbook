import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Chess } from 'chess.js';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { Board } from '../components/Board';
import { fenKey, playUci, START_FEN, ucisToSanLine } from '../lib/chess';
import type { Color } from '../lib/types';
import { AddDialog, type AddPanel } from '../rep/AddDialog';
import * as db from '../rep/db';
import { DeckView } from '../rep/DeckView';
import { backupJson } from '../rep/model/backup';
import { cardId, deckCounts, deckDrills, drillQueue, gradeCard, isNew, Rating, syncCards, type Drill } from '../rep/model/cards';
import { newDeck, ownMoveIndex, signatureFen } from '../rep/model/deck';
import { commitBuild } from '../rep/model/fromGames';
import { V1_DECK_NAME } from '../rep/model/migrateV1';
import { serializeDeck } from '../rep/model/pgn';
import type { Deck, Edge, LibraryData } from '../rep/model/types';
import { meet, prepQueue } from '../rep/meet';
import { MeetPanel } from '../rep/MeetPanel';
import { isLibraryHash, parseRoute, routeHash, type LibraryRoute } from '../rep/route';
import { Shelf, type DeckInfo } from '../rep/Shelf';
import { STARTERS, starterDeck, type Starter } from '../rep/starters';
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

function positionAfter(line: string[]) {
  const c = new Chess(START_FEN);
  for (const u of line) playUci(c, u);
  return { fen: c.fen(), turn: c.turn() as Color };
}

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
  const [route, setRoute] = useState<LibraryRoute>(() => parseRoute(location.hash));
  /** Where the deck view opens, e.g. the position from "add a move" in the Report. */
  const [deckLine, setDeckLine] = useState<string[]>([]);
  const [prepColor, setPrepColor] = useState<Color>(start?.prep ?? 'w');
  const [adding, setAdding] = useState<AddPanel | 'menu' | null>(null);
  /** A message for the shelf, e.g. what was just saved. */
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const handledStart = useRef(false);

  /** Moves to a page inside the Library; Back returns to the page before. */
  const go = (r: LibraryRoute, line: string[] = []) => {
    setDeckLine(line);
    if (routeHash(r) !== location.hash) history.pushState(null, '', `/${routeHash(r)}`);
    setRoute(r);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const onPop = () => {
      if (!isLibraryHash(location.hash)) return;
      setDeckLine([]);
      setRoute(parseRoute(location.hash));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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

  const updateDeck = (base: db.Stored, deck: Deck, patch: Partial<Deck>) => {
    const d = { ...deck, ...patch, updatedAt: new Date().toISOString() };
    save({ ...base, decks: base.decks.map((x) => (x.id === d.id ? d : x)) }, { decks: [d] });
  };

  const createDeck = (base: db.Stored, color: Color) => {
    const d = newDeck({ name: V1_DECK_NAME[color], color, source: { kind: 'board' } });
    save({ ...base, decks: [...base.decks, d] }, { decks: [d] });
    return d;
  };

  const addStarter = (base: db.Stored, s: Starter) => {
    const r = commitBuild(base, [{ ...starterDeck(s), isNew: true }]);
    save({ ...base, ...r.lib }, r.write);
    return r.write.decks[0];
  };

  const deleteDeck = (base: db.Stored, deck: Deck) => {
    const decks = base.decks.filter((d) => d.id !== deck.id);
    const edges = base.edges.filter((e) => e.deckId !== deck.id);
    const synced = syncCards(decks, edges, base.cards);
    save({ ...base, decks, edges, cards: synced.cards }, { deleteDecks: [deck.id], deleteCards: synced.removed });
  };

  const download = (name: string, text: string, type: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  useEffect(() => {
    db.loadLibrary(today())
      .then(setLib)
      .catch((err) => setError(err instanceof Error && err.message.includes('another tab') ? err.message : 'This browser does not allow local storage, so the library cannot be saved here.'));
  }, []);

  // Coming from the Report view: drill what the opponent reaches, or add a move where they leave your book.
  useEffect(() => {
    if (!lib || handledStart.current || !start) return;
    handledStart.current = true;
    if (start.prep) go({ page: 'prep' });
    if (start.fill) {
      const { color, line } = start.fill;
      const d = deckFor(lib.decks, lib.edges, color, line) ?? createDeck(lib, color);
      go({ page: 'deck', id: d.id }, line);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib]);

  const own = useMemo(() => (lib ? ownMoveIndex(lib.decks, lib.edges) : null), [lib]);
  const cards = useMemo(() => new Map((lib?.cards ?? []).map((c) => [c.id, c])), [lib]);
  const edgesBy = useMemo(() => {
    const m = new Map<string, Edge[]>();
    for (const e of lib?.edges ?? []) m.set(e.deckId, [...(m.get(e.deckId) ?? []), e]);
    return m;
  }, [lib]);
  // Computed once per prep session, so grading cards doesn't reshuffle it.
  const prepDrills = useMemo(() => {
    if (route.page !== 'prep' || !opponent || !lib || !own) return [];
    return prepQueue(meet(own, opponent.book, prepColor, opponent.bookPlies)).flatMap((m): Drill[] => {
      const id = cardId(prepColor, m.key, m.moves[0]);
      const card = cards.get(id);
      const home = lib.edges.find((e) => e.from === m.key && e.uci === m.moves[0] && e.mine && e.rank === 0 && lib.decks.some((d) => d.id === e.deckId && d.color === prepColor));
      return card && home ? [{ card, deckId: home.deckId, key: m.key, move: Math.floor(m.line.length / 2) + 1, path: m.line, moves: m.moves }] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.page, prepColor, opponent, lib === null]);

  if (error) return <div className="card rep-wrap"><p className="err">{error}</p></div>;
  if (!lib || !own) return <div className="card rep-wrap"><p className="muted">Opening your library…</p></div>;

  const now = new Date();
  const newLeft = Math.max(0, lib.settings.newPerDay - lib.newToday);
  const drillsOf = (d: Deck) => deckDrills(d, edgesBy.get(d.id) ?? [], cards);

  /** Every deck's queue, most due deck first, each card once, with one budget for new cards. */
  const allQueue = () => {
    const seen = new Set<string>();
    let budget = newLeft;
    const out: Drill[] = [];
    const decks = [...lib.decks].sort((a, b) => deckCounts(drillsOf(b), now, newLeft, b.startMove).due - deckCounts(drillsOf(a), now, newLeft, a.startMove).due);
    for (const d of decks) {
      for (const x of drillQueue(drillsOf(d), now, budget, d.startMove)) {
        if (seen.has(x.card.id)) continue;
        seen.add(x.card.id);
        if (isNew(x.card)) budget--;
        out.push(x);
      }
    }
    return out;
  };

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

  const onImported = (next: LibraryData, change: db.Change) => save({ ...lib, ...next }, change);
  const exportDeck = (d: Deck, edges: Edge[]) =>
    download(`${d.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'deck'}.pgn`, serializeDeck(d, edges), 'application/x-chess-pgn');
  const toShelf = () => go({ page: 'shelf' });

  const deck = route.page === 'deck' || route.page === 'train' ? lib.decks.find((d) => d.id === route.id) : undefined;
  const starter = route.page === 'starter' ? STARTERS.find((s) => s.id === route.id) : undefined;
  const starterCopy = (id: string) => lib.decks.find((d) => d.source.kind === 'starter' && d.source.starterId === id);

  let page: ReactNode;
  if (route.page === 'deck' && deck) {
    const edges = edgesBy.get(deck.id) ?? [];
    page = (
      <DeckView
        key={deck.id + deckLine.join(' ')}
        deck={deck}
        edges={edges}
        cards={cards}
        start={deckLine}
        onBack={toShelf}
        onChange={(next) => editDeck(lib, deck, next)}
        onUpdate={(patch) => updateDeck(lib, deck, patch)}
        onTrain={() => go({ page: 'train', id: deck.id })}
        onExport={() => exportDeck(deck, edges)}
        onDelete={() => {
          const n = edges.filter((e) => e.mine).length;
          if (!window.confirm(`Delete ${deck.name}? Your progress on its ${n} move${n === 1 ? '' : 's'} will be lost. Download a backup first if you might want it back.`)) return;
          deleteDeck(lib, deck);
          toShelf();
        }}
      />
    );
  } else if (route.page === 'starter' && starter) {
    const preview = starterDeck(starter);
    const copy = starterCopy(starter.id);
    page = (
      <DeckView
        deck={preview.deck}
        edges={preview.edges}
        cards={new Map()}
        readOnly
        onBack={toShelf}
        onExport={() => exportDeck(preview.deck, preview.edges)}
        starter={{
          inLibrary: !!copy,
          onAdd: () => go({ page: 'deck', id: addStarter(lib, starter).id }),
          onOpen: () => copy && go({ page: 'deck', id: copy.id }),
        }}
      />
    );
  } else if (route.page === 'train' && (deck || route.id === ALL)) {
    page = deck ? (
      <Review key={deck.id} color={deck.color} title={deck.name} initial={drillQueue(drillsOf(deck), now, newLeft, deck.startMove)} onGraded={onGraded} onDone={toShelf} />
    ) : (
      <Review key="all" title="All decks" initial={allQueue()} onGraded={onGraded} onDone={toShelf} />
    );
  } else if (route.page === 'prep' && opponent) {
    page = <Review key={'prep' + prepColor} color={prepColor} title={`Positions ${opponent.username} steers into`} initial={prepDrills} onGraded={onGraded} onDone={toShelf} />;
  } else {
    const infos: DeckInfo[] = lib.decks.map((d) => ({ deck: d, ...deckCounts(drillsOf(d), now, newLeft, d.startMove), signature: signatureFen(edgesBy.get(d.id) ?? []) }));
    page = (
      <>
        {notice && (
          <div className="notice shelf-notice" role="status">
            <span>{notice}</span>
            <button className="btn small ghost" onClick={() => setNotice('')} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
        <Shelf
          decks={infos}
          moves={lib.cards.length}
          dueToday={allQueue().length}
          starters={STARTERS.map((s) => ({ ...s, signature: signatureFen(starterDeck(s).edges), moves: s.edges.filter((e) => e.from.split(' ')[1] === s.color).length, deckId: starterCopy(s.id)?.id }))}
          onOpen={(id) => go({ page: 'deck', id })}
          onTrain={(id) => go({ page: 'train', id })}
          onTrainAll={() => go({ page: 'train', id: ALL })}
          onAdd={(p) => setAdding(p ?? 'menu')}
          onAddStarter={(id) => addStarter(lib, STARTERS.find((s) => s.id === id)!)}
          onPreviewStarter={(id) => go({ page: 'starter', id })}
          onBackup={async () => download(`shadowbook-library-${today()}.json`, backupJson(await db.loadBackup()), 'application/json')}
        />
        {opponent && (
          <MeetPanel
            opponent={opponent}
            own={own}
            onTrain={(c) => {
              setPrepColor(c);
              go({ page: 'prep' });
            }}
            onFill={(c, line) => {
              const d = deckFor(lib.decks, lib.edges, c, line) ?? createDeck(lib, c);
              go({ page: 'deck', id: d.id }, line);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="rep-wrap">
      {page}
      <AddDialog
        open={adding}
        lib={lib}
        cards={cards}
        onClose={() => setAdding(null)}
        onImported={onImported}
        onBuilt={(next, change, message) => {
          onImported(next, change);
          setAdding(null);
          setNotice(message);
          go({ page: 'shelf' });
        }}
        onNewDeck={(c) => {
          setAdding(null);
          go({ page: 'deck', id: createDeck(lib, c).id });
        }}
        onRestore={async (b) => {
          await db.restore(b);
          setLib(await db.loadLibrary(today()));
        }}
      />
    </div>
  );
}

/** The train page for all decks at once. */
const ALL = 'all';

/** Training as in Phase 1, until Phase 3 replaces it. Without `color`, each card is shown from its own side. */
function Review({ color: side, title, initial, onGraded, onDone }: { color?: Color; title?: string; initial: Drill[]; onGraded(d: Drill, o: Outcome): void; onDone(): void }) {
  const [drills, setDrills] = useState(initial);
  const [i, setI] = useState(0);
  const [hint, setHint] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);
  const [solved, setSolved] = useState<string | null>(null);
  const [tally, setTally] = useState({ clean: 0, hint: 0, wrong: 0 });
  /** Bumped after a move that is not accepted, so only that piece goes back. */
  const [takeBack, setTakeBack] = useState(0);
  const drill = drills[i];

  if (!drill) {
    return (
      <div className="card rep-done">
        <h2>Done for now</h2>
        <p>
          {tally.clean} right first time · {tally.hint} with a hint · {tally.wrong} missed
        </p>
        <p className="muted small">Missed positions come back soon; the ones you knew come back later, a little further apart each time.</p>
        <button className="btn primary" onClick={onDone}>Back to Library</button>
      </div>
    );
  }

  const fen = drill.card.fen;
  const color = side ?? drill.card.color;
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
    } else {
      setTakeBack((n) => n + 1);
      if (!wrong) {
        setWrong(uci);
        grade('wrong');
      }
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
        {/* One board for the whole session: a new one per card makes the board flash. */}
        <Board
          fen={display}
          orientation={color}
          movable={solved ? null : color}
          lastMove={solved ?? drill.path[drill.path.length - 1]}
          shapes={shapes}
          onMove={onMove}
          revision={takeBack}
        />
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
            Not {sanOf(fen, wrong)} — your move is <b>{sanOf(fen, main)}</b>
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
          <button className="btn small ghost" onClick={onDone}>Back to Library</button>
        </div>
      </div>
    </div>
  );
}
