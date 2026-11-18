import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Chess } from 'chess.js';
import { fenKey, playUci, START_FEN } from '../lib/chess';
import type { Color } from '../lib/types';
import { AddDialog, type AddPanel } from '../rep/AddDialog';
import * as db from '../rep/db';
import { DeckView } from '../rep/DeckView';
import { backupJson } from '../rep/model/backup';
import { cardId, deckCounts, deckDrills, drillQueue, gradeCard, isNew, syncCards, type Drill } from '../rep/model/cards';
import { addPath, makeMain, newDeck, ownMoveIndex, removeEdge, signatureFen } from '../rep/model/deck';
import { commitBuild, type GamesSite } from '../rep/model/fromGames';
import type { Habit } from '../rep/model/insights';
import { Insights } from '../rep/Insights';
import { V1_DECK_NAME } from '../rep/model/migrateV1';
import { serializeDeck } from '../rep/model/pgn';
import { linesFor, positionsFor, type Effect } from '../rep/model/session';
import type { Deck, Edge, LibraryData, Settings } from '../rep/model/types';
import { meet, prepQueue } from '../rep/meet';
import { MeetPanel } from '../rep/MeetPanel';
import { isLibraryHash, parseRoute, routeHash, type LibraryRoute } from '../rep/route';
import { Share } from '../rep/Share';
import { Shelf, type DeckInfo } from '../rep/Shelf';
import { STARTERS, starterDeck, type Starter } from '../rep/starters';
import { Train } from '../rep/Train';
import type { Opponent } from '../lib/opponent';
import { isLibraryOAuthReturn } from '../live/lichessAuth';
import '../rep/rep.css';

const today = () => new Date().toISOString().slice(0, 10);

function positionAfter(line: string[]) {
  const c = new Chess(START_FEN);
  for (const u of line) playUci(c, u);
  return { fen: c.fen(), turn: c.turn() as Color };
}

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
  // Back from the Lichess login for Send to Lichess, the address has no #library yet.
  const [route, setRoute] = useState<LibraryRoute>(() => (isLibraryOAuthReturn() ? { page: 'share' } : parseRoute(location.hash)));
  /** Where the deck view opens, e.g. the position from "add a move" in the Report. */
  const [deckLine, setDeckLine] = useState<string[]>([]);
  const [prepColor, setPrepColor] = useState<Color>(start?.prep ?? 'w');
  const [adding, setAdding] = useState<AddPanel | 'menu' | null>(null);
  /** A message for the shelf, e.g. what was just saved. */
  const [notice, setNotice] = useState('');
  /** "Start at move" changed in training without "Remember": for this visit only. */
  const [startFor, setStartFor] = useState<Record<string, number>>({});
  /** "Train this position" from Insights: one card, trained on its own. */
  const [single, setSingle] = useState<{ title: string; drills: Drill[] } | null>(null);
  /** "Train all": the decks in order, and how far along. */
  const [allOrder, setAllOrder] = useState<{ ids: string[]; at: number } | null>(null);
  const [error, setError] = useState('');
  const handledStart = useRef(false);

  /** Moves to a page inside the Library; Back returns to the page before. */
  const go = (r: LibraryRoute, line: string[] = []) => {
    setDeckLine(line);
    setNotice('');
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
  const withEdges = (base: db.Stored, deck: Deck, edges: Edge[]): { next: db.Stored; change: db.Change } => {
    const now = new Date();
    const d = { ...deck, updatedAt: now.toISOString() };
    const decks = base.decks.some((x) => x.id === d.id) ? base.decks.map((x) => (x.id === d.id ? d : x)) : [...base.decks, d];
    const all = [...base.edges.filter((e) => e.deckId !== d.id), ...edges];
    const synced = syncCards(decks, all, base.cards, now);
    return { next: { ...base, decks, edges: all, cards: synced.cards }, change: { decks: [d], edges: [{ deckId: d.id, edges }], cards: synced.added, deleteCards: synced.removed } };
  };
  const editDeck = (base: db.Stored, deck: Deck, edges: Edge[]) => {
    const r = withEdges(base, deck, edges);
    save(r.next, r.change);
  };

  // Training sends several effects at once; each builds on the library the one before left.
  const latest = useRef(lib);
  latest.current = lib;
  const applyEffects = (effects: Effect[]) => {
    if (!latest.current) return;
    let base: db.Stored = latest.current;
    for (const ef of effects) {
      if (ef.type === 'grade') {
        const card = base.cards.find((c) => c.id === ef.cardId);
        if (!card) continue;
        const at = new Date();
        const r = gradeCard(card, ef.rating, { deckId: ef.deckId, mode: ef.mode, retention: base.settings.retention }, at);
        const wasNew = isNew(card);
        const decks = base.decks.map((x) => (x.id === ef.deckId ? { ...x, lastTrainedAt: at.toISOString() } : x));
        const newToday = base.newToday + (wasNew ? 1 : 0);
        base = { ...base, decks, newToday, cards: base.cards.map((c) => (c.id === r.card.id ? r.card : c)) };
        db.apply({ cards: [r.card], reviews: [r.review], decks: decks.filter((x) => x.id === ef.deckId), newToday: wasNew ? { day: today(), n: newToday } : undefined }).catch(() => setError('Could not save to this browser.'));
      } else {
        const deck = base.decks.find((d) => d.id === ef.deckId);
        if (!deck) continue;
        let edges = addPath(base.edges.filter((e) => e.deckId === deck.id), deck, ef.path);
        if (ef.type === 'makeMain') edges = makeMain(edges, ef.from, ef.uci);
        const r = withEdges(base, deck, edges);
        base = r.next;
        db.apply(r.change).catch(() => setError('Could not save to this browser.'));
      }
    }
    latest.current = base;
    setLib(base);
  };

  const changeSettings = (patch: Partial<Settings>) => {
    const base = latest.current;
    if (!base) return;
    const settings = { ...base.settings, ...patch };
    latest.current = { ...base, settings };
    setLib(latest.current);
    db.saveSettings(settings).catch(() => setError('Could not save to this browser.'));
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

  /** Every deck's queue, each card once, with one budget for new cards: how much there is to review today. */
  const dueToday = () => {
    const seen = new Set<string>();
    let budget = newLeft;
    for (const d of lib.decks) {
      for (const x of drillQueue(drillsOf(d), now, budget, d.startMove)) {
        if (seen.has(x.card.id)) continue;
        seen.add(x.card.id);
        if (isNew(x.card)) budget--;
      }
    }
    return seen.size;
  };
  const dueOf = (d: Deck) => deckCounts(drillsOf(d), now, newLeft, d.startMove).due;
  const edgesRecord = () => Object.fromEntries(lib.decks.map((d) => [d.id, edgesBy.get(d.id) ?? []]));

  /** The training screen for one deck, in the mode last used. */
  const trainDeck = (d0: Deck, after?: { label: string; next(): void }) => {
    const d = { ...d0, startMove: startFor[d0.id] ?? d0.startMove };
    const mode = lib.settings.mode;
    const cardMap = Object.fromEntries(lib.cards.map((c) => [c.id, c]));
    const items = mode === 'lines' ? linesFor(d, edgesBy.get(d.id) ?? [], cardMap, now) : positionsFor(drillQueue(drillsOf(d), now, newLeft, d.startMove), () => d.color, edgesRecord());
    return (
      <Train
        key={`${d.id}|${mode}|${d.startMove}`}
        mode={mode}
        title={d.name}
        items={items}
        edges={edgesRecord()}
        cards={lib.cards}
        newLeft={newLeft}
        settings={lib.settings}
        decks={lib.decks}
        allEdges={lib.edges}
        deck={d}
        dueBy={new Map(lib.decks.map((x) => [x.id, dueOf(x)]))}
        onEffects={applyEffects}
        onSettings={changeSettings}
        onDeck={(id) => {
          setAllOrder(null);
          go({ page: 'train', id });
        }}
        onStartMove={(n, remember) => {
          if (remember) {
            updateDeck(lib, d0, { startMove: n });
            setStartFor((all) => Object.fromEntries(Object.entries(all).filter(([id]) => id !== d0.id)));
          } else setStartFor({ ...startFor, [d0.id]: n });
        }}
        onDone={after ? after.next : toShelf}
        nextLabel={after?.label}
      />
    );
  };

  const onImported = (next: LibraryData, change: db.Change) => save({ ...lib, ...next }, change);
  const exportDeck = (d: Deck, edges: Edge[]) =>
    download(`${d.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'deck'}.pgn`, serializeDeck(d, edges), 'application/x-chess-pgn');
  const copyDeck = (d: Deck, edges: Edge[]) =>
    navigator.clipboard.writeText(serializeDeck(d, edges)).then(
      () => setNotice(`Copied ${d.name} as PGN.`),
      () => setNotice('This browser did not allow copying. Use Export PGN instead.'),
    );
  const toShelf = () => go({ page: 'shelf' });

  /** The player of the decks built from games most recently, to prefill the games forms. */
  const lastPlayer = (): { site: GamesSite; username: string } | undefined => {
    const built = lib.decks.flatMap((d) => (d.source.kind === 'games' ? [d.source] : [])).sort((a, b) => b.builtAt.localeCompare(a.builtAt))[0];
    return built && { site: built.site, username: built.username };
  };
  /** The deck of that colour with your main move in this position, and the card's drill there. */
  const drillAt = (color: Color, key: string): Drill | undefined => {
    for (const d of lib.decks.filter((x) => x.color === color)) {
      const found = drillsOf(d).find((x) => x.key === key);
      if (found) return found;
    }
  };
  /**
   * "Fix it": the better move becomes your main move, and the old move leaves every deck of that colour that plays
   * it there, with the lines after it, after a confirm. With no deck playing it, the deck that has the position.
   */
  const fixHabit = (h: Habit, better: string) => {
    const ply = h.path.length;
    const san = (u: string) => `${Math.floor(ply / 2) + 1}${ply % 2 ? '…' : '.'}${playUci(new Chess(positionAfter(h.path).fen), u).san}`;
    const playing = lib.decks.filter((d) => d.color === h.color && lib.edges.some((e) => e.deckId === d.id && e.from === h.key && e.uci === h.uci && e.mine));
    const targets = playing.length ? playing : [deckFor(lib.decks, lib.edges, h.color, h.path) ?? createDeck(lib, h.color)];
    const plans = targets.map((d) => {
      const edges = lib.edges.filter((e) => e.deckId === d.id);
      const next = edges.some((e) => e.from === h.key && e.uci === h.uci) ? removeEdge(edges, h.key, h.uci) : edges;
      return { d, next, gone: edges.length - next.length };
    });
    const removed = plans.filter((x) => x.gone > 0);
    if (removed.length) {
      const where = removed.map((x) => `${x.d.name}${x.gone > 1 ? ` (with the ${x.gone - 1} move${x.gone === 2 ? '' : 's'} after it)` : ''}`).join(', ');
      if (!window.confirm(`Remove ${san(h.uci)} from ${where}? ${san(better)} becomes your main move there, as a new card.`)) return;
    }
    let base = latest.current ?? lib;
    for (const x of plans) {
      const r = withEdges(base, x.d, makeMain(addPath(x.next, x.d, [...h.path, better]), h.key, better));
      base = r.next;
      db.apply(r.change).catch(() => setError('Could not save to this browser.'));
    }
    latest.current = base;
    setLib(base);
    go({ page: 'deck', id: targets[0].id }, [...h.path, better]);
    setNotice(`${san(better)} is now your main move in ${targets.map((d) => d.name).join(', ')}, as a new card.`);
  };
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
        onCopy={() => copyDeck(deck, edges)}
        onShare={() => go({ page: 'share', id: deck.id })}
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
        onCopy={() => copyDeck(preview.deck, preview.edges)}
        starter={{
          inLibrary: !!copy,
          onAdd: () => go({ page: 'deck', id: addStarter(lib, starter).id }),
          onOpen: () => copy && go({ page: 'deck', id: copy.id }),
        }}
      />
    );
  } else if (route.page === 'train' && deck) {
    page = trainDeck(deck);
  } else if (route.page === 'train' && route.id === ALL) {
    // "Train all": the decks one after another, most due first.
    const order = allOrder ?? { ids: [...lib.decks].filter((d) => dueOf(d) > 0).sort((a, b) => dueOf(b) - dueOf(a)).map((d) => d.id), at: 0 };
    if (!allOrder) queueMicrotask(() => setAllOrder(order));
    const current = lib.decks.find((d) => d.id === order.ids[order.at]);
    const nextDeck = lib.decks.find((d) => d.id === order.ids[order.at + 1]);
    page = current ? (
      trainDeck(current, { label: nextDeck ? `Next: ${nextDeck.name}` : 'Back to Library', next: () => (nextDeck ? setAllOrder({ ...order, at: order.at + 1 }) : toShelf()) })
    ) : (
      <div className="card rep-done">
        <h2>Nothing due right now</h2>
        <button className="btn primary" onClick={toShelf}>
          Back to Library
        </button>
      </div>
    );
  } else if (route.page === 'insights') {
    page = (
      <Insights
        decks={lib.decks}
        edges={lib.edges}
        initial={lastPlayer()}
        engine={lib.settings.engine}
        hasCard={(color, key) => !!drillAt(color, key)}
        onBack={toShelf}
        onFix={fixHabit}
        onTrain={(color, key) => {
          const d = drillAt(color, key);
          if (!d) return;
          setSingle({ title: 'A position from your games', drills: [d] });
          go({ page: 'prep' });
        }}
        onAddMove={(color, path) => {
          const d = deckFor(lib.decks, lib.edges, color, path) ?? createDeck(lib, color);
          go({ page: 'deck', id: d.id }, path);
        }}
      />
    );
  } else if (route.page === 'share') {
    page = (
      <Share
        decks={lib.decks.filter((d) => (edgesBy.get(d.id) ?? []).length)}
        ticked={route.id ? [route.id] : undefined}
        pgnOf={(d) => serializeDeck(d, edgesBy.get(d.id) ?? [], { studyTags: false })}
        backLabel={route.id ? (lib.decks.find((d) => d.id === route.id)?.name ?? 'Your library') : 'Your library'}
        onBack={() => (route.id ? go({ page: 'deck', id: route.id }) : toShelf())}
      />
    );
  } else if (route.page === 'prep' && single) {
    page = (
      <Train
        key={'single' + single.drills[0].card.id}
        mode="positions"
        fixed
        title={single.title}
        items={positionsFor(single.drills, (id) => lib.decks.find((d) => d.id === id)?.color ?? 'w', edgesRecord())}
        edges={edgesRecord()}
        cards={lib.cards}
        newLeft={newLeft}
        practice
        nextLabel="Back to Insights"
        settings={lib.settings}
        decks={lib.decks}
        allEdges={lib.edges}
        dueBy={new Map()}
        onEffects={applyEffects}
        onSettings={changeSettings}
        onDone={() => {
          setSingle(null);
          go({ page: 'insights' });
        }}
      />
    );
  } else if (route.page === 'prep' && opponent) {
    page = (
      <Train
        key={'prep' + prepColor}
        mode="positions"
        fixed
        title={`Positions ${opponent.username} steers into`}
        items={positionsFor(prepDrills, (id) => lib.decks.find((d) => d.id === id)?.color ?? prepColor, edgesRecord())}
        edges={edgesRecord()}
        cards={lib.cards}
        newLeft={newLeft}
        settings={lib.settings}
        decks={lib.decks}
        allEdges={lib.edges}
        dueBy={new Map()}
        onEffects={applyEffects}
        onSettings={changeSettings}
        onDone={toShelf}
      />
    );
  } else {
    const infos: DeckInfo[] = lib.decks.map((d) => ({ deck: d, ...deckCounts(drillsOf(d), now, newLeft, d.startMove), signature: signatureFen(edgesBy.get(d.id) ?? []) }));
    page = (
      <>
        <Shelf
          decks={infos}
          moves={lib.cards.length}
          dueToday={dueToday()}
          starters={STARTERS.map((s) => ({ ...s, signature: signatureFen(starterDeck(s).edges), moves: s.edges.filter((e) => e.from.split(' ')[1] === s.color).length, deckId: starterCopy(s.id)?.id }))}
          onOpen={(id) => go({ page: 'deck', id })}
          onTrain={(id) => go({ page: 'train', id })}
          onInsights={() => go({ page: 'insights' })}
          onShare={() => go({ page: 'share' })}
          onTrainAll={() => {
            setAllOrder(null);
            go({ page: 'train', id: ALL });
          }}
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
      {notice && (
        <div className="notice shelf-notice" role="status">
          <span>{notice}</span>
          <button className="btn small ghost" onClick={() => setNotice('')} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {page}
      <AddDialog
        open={adding}
        initial={lastPlayer()}
        lib={lib}
        cards={cards}
        onClose={() => setAdding(null)}
        onImported={onImported}
        onBuilt={(next, change, message) => {
          onImported(next, change);
          setAdding(null);
          go({ page: 'shelf' });
          setNotice(message);
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
