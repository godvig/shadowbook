import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { Board } from '../components/Board';
import { playUci, ucisToSanLine } from '../lib/chess';
import type { Color } from '../lib/types';
import { addMove, entryId, importPgn, isNew, makeMain, positionAfter, queue, removeMove, review, type Outcome, type RepEntry } from '../rep/repertoire';
import * as store from '../rep/store';
import { meet, prepQueue } from '../rep/meet';
import { MeetPanel } from '../rep/MeetPanel';
import { RepTree } from '../rep/RepTree';
import { buildTree } from '../rep/tree';
import { fetchStudy, type Chapter } from '../rep/lichessStudy';
import type { Opponent } from '../lib/opponent';
import '../rep/rep.css';

const NEW_PER_DAY = 20;
const today = () => new Date().toISOString().slice(0, 10);
const sanOf = (fen: string, uci: string) => {
  try {
    return playUci(new Chess(fen), uci).san;
  } catch {
    return uci;
  }
};
const arrow = (uci: string, brush: string): DrawShape => ({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush });

type Mode = 'overview' | 'build' | 'review' | 'prep';

export interface LibraryStart {
  prep?: Color;
  fill?: { color: Color; line: string[] };
}

export function Library({ opponent, start }: { opponent?: Opponent | null; start?: LibraryStart }) {
  const [entries, setEntries] = useState<Map<string, RepEntry> | null>(null);
  const [mode, setMode] = useState<Mode>(start?.prep ? 'prep' : start?.fill ? 'build' : 'overview');
  const [color, setColor] = useState<Color>(start?.prep ?? start?.fill?.color ?? 'w');
  const [buildFrom, setBuildFrom] = useState<string[]>(start?.fill?.line ?? []);
  const [newDone, setNewDone] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([store.loadAll(), store.newToday(today())])
      .then(([m, n]) => {
        setEntries(m);
        setNewDone(n);
      })
      .catch(() => setError('This browser does not allow local storage, so the library cannot be saved here.'));
  }, []);

  const persist = (changed: RepEntry[], removed: string[] = []) => {
    setEntries((prev) => {
      const next = new Map(prev);
      for (const e of changed) next.set(e.id, e);
      for (const id of removed) next.delete(id);
      return next;
    });
    store.save(changed).catch(() => setError('Could not save to this browser.'));
    for (const id of removed) store.remove(id).catch(() => {});
  };

  // Computed once per prep session, so grading cards doesn't reshuffle it.
  const prepCards = useMemo(
    () => (mode === 'prep' && opponent && entries ? prepQueue(meet(entries, opponent.book, color, opponent.bookPlies)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, color, opponent, entries === null],
  );

  if (error) return <div className="card rep-wrap"><p className="err">{error}</p></div>;
  if (!entries) return <div className="card rep-wrap"><p className="muted">Opening your library…</p></div>;

  const mine = [...entries.values()].filter((e) => e.color === color);
  const now = new Date();
  const q = queue(mine, now, NEW_PER_DAY - newDone);

  return (
    <div className="rep-wrap">
      <div className="rep-head">
        <div>
          <h1>Library</h1>
          <p className="muted">Your opening repertoire, drilled with spaced repetition. Stored only in this browser.</p>
        </div>
        <div className="seg" role="group" aria-label="Repertoire colour">
          <button className={color === 'w' ? 'on' : ''} onClick={() => setColor('w')}>White</button>
          <button className={color === 'b' ? 'on' : ''} onClick={() => setColor('b')}>Black</button>
        </div>
      </div>

      {mode === 'overview' && (
        <Overview
          entries={mine}
          due={q.filter((e) => !isNew(e)).length}
          fresh={q.filter(isNew).length}
          onReview={() => setMode('review')}
          onBuild={() => {
            setBuildFrom([]);
            setMode('build');
          }}
          onImport={(pgn) => {
            const copy = new Map(entries);
            const res = importPgn(copy, pgn, color);
            const changed = [...copy.values()].filter((e) => entries.get(e.id) !== e);
            persist(changed);
            return res;
          }}
          onImportStudy={(chapters) => {
            const copy = new Map(entries);
            const per = { w: 0, b: 0 };
            let moves = 0;
            let skipped = 0;
            for (const ch of chapters) {
              if (!ch.fromStart) {
                skipped++;
                continue;
              }
              const c = ch.orientation ?? color;
              const r = importPgn(copy, ch.pgn, c);
              moves += r.moves;
              per[c]++;
            }
            persist([...copy.values()].filter((e) => entries.get(e.id) !== e));
            return { per, moves, skipped };
          }}
          color={color}
          onOpen={(line) => {
            setBuildFrom(line);
            setMode('build');
          }}
          all={entries}
          onRestore={(rows) => persist(rows)}
          onClear={() => {
            const ids = mine.map((e) => e.id);
            persist([], ids);
          }}
        />
      )}
      {mode === 'overview' && opponent && (
        <MeetPanel
          opponent={opponent}
          entries={entries}
          onTrain={(c) => {
            setColor(c);
            setMode('prep');
          }}
          onFill={(c, line) => {
            setColor(c);
            setBuildFrom(line);
            setMode('build');
          }}
        />
      )}
      {mode === 'build' && <Build key={buildFrom.join(' ')} color={color} start={buildFrom} entries={entries} persist={persist} onDone={() => setMode('overview')} />}
      {mode === 'prep' && opponent && (
        <Review
          key={'prep' + color}
          color={color}
          title={`Positions ${opponent.username} steers into`}
          initial={prepCards}
          onGraded={(e) => persist([e])}
          onDone={() => setMode('overview')}
        />
      )}
      {mode === 'review' && (
        <Review
          key={color}
          color={color}
          initial={q}
          onGraded={(e, wasNew) => {
            persist([e]);
            if (wasNew) {
              const n = newDone + 1;
              setNewDone(n);
              store.setNewToday(today(), n).catch(() => {});
            }
          }}
          onDone={() => setMode('overview')}
        />
      )}
    </div>
  );
}

function Overview(props: {
  entries: RepEntry[];
  color: Color;
  onImportStudy(chapters: Chapter[]): { per: Record<Color, number>; moves: number; skipped: number };
  onOpen(line: string[]): void;
  all: Map<string, RepEntry>;
  due: number;
  fresh: number;
  onReview(): void;
  onBuild(): void;
  onImport(pgn: string): { cards: number; moves: number };
  onRestore(rows: RepEntry[]): void;
  onClear(): void;
}) {
  const [pgn, setPgn] = useState('');
  const [note, setNote] = useState('');
  const [study, setStudy] = useState('');
  const [studyNote, setStudyNote] = useState('');
  const [busy, setBusy] = useState(false);
  const tree = useMemo(() => buildTree(props.entries, props.color), [props.entries, props.color]);
  const file = useRef<HTMLInputElement>(null);
  const total = props.entries.length;
  const learned = props.entries.filter((e) => !isNew(e)).length;

  return (
    <>
      <div className="card rep-today">
        <div className="rep-stats">
          <div><b>{props.due}</b><span>due</span></div>
          <div><b>{props.fresh}</b><span>new today</span></div>
          <div><b>{learned}/{total}</b><span>positions learned</span></div>
        </div>
        <div className="row">
          <button className="btn primary" disabled={!props.due && !props.fresh} onClick={props.onReview}>
            {props.due || props.fresh ? `Train ${props.due + props.fresh}` : 'Nothing due — come back tomorrow'}
          </button>
          <button className="btn" onClick={props.onBuild}>Add moves on the board</button>
        </div>
      </div>

      <div className="card">
        <h2>Your repertoire as {props.color === 'w' ? 'White' : 'Black'}</h2>
        <p className="rep-legend">
          <span><b>Bold</b> = your move, <i style={{ all: 'unset', fontStyle: 'italic' }}>italic</i> = also accepted</span>
          <span><i style={{ background: '#8a90a0' }} />new</span>
          <span><i style={{ background: '#ff8a80' }} />due</span>
          <span><i style={{ background: '#7bd88f' }} />learned</span>
          <span>Click a move to open the position.</span>
        </p>
        <RepTree nodes={tree} onOpen={props.onOpen} />
      </div>

      <div className="card">
        <h2>Import from a Lichess study</h2>
        <p className="muted small">Paste a link to a public or unlisted study, or to one chapter. Each chapter goes to White or Black by its board orientation; chapters without one go to the colour selected above.</p>
        <form
          className="rep-study"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const chapters = await fetchStudy(study);
              const r = props.onImportStudy(chapters);
              const parts = (['w', 'b'] as Color[]).filter((c) => r.per[c]).map((c) => `${r.per[c]} chapter${r.per[c] === 1 ? '' : 's'} as ${c === 'w' ? 'White' : 'Black'}`);
              setStudyNote(`${r.moves ? `Added ${r.moves} moves from ` + parts.join(' and ') : 'Nothing new in that study'}${r.skipped ? ` · ${r.skipped} chapter${r.skipped === 1 ? '' : 's'} skipped (custom start position)` : ''}.`);
              if (r.moves) setStudy('');
            } catch (err) {
              setStudyNote(err instanceof Error ? err.message : 'Could not reach Lichess.');
            }
            setBusy(false);
          }}
        >
          <input value={study} onChange={(e) => setStudy(e.target.value)} placeholder="https://lichess.org/study/…" aria-label="Lichess study link" />
          <button className="btn" disabled={!study.trim() || busy}>{busy ? 'Importing…' : 'Import study'}</button>
        </form>
        {studyNote && <p className="muted small">{studyNote}</p>}
      </div>

      <div className="card">
        <h2>Import PGN</h2>
        <p className="muted small">Paste a study or chapter. Every variation is read; your side's moves become cards, the other side's moves are the lines you prepare against.</p>
        <textarea className="rep-pgn" value={pgn} onChange={(e) => setPgn(e.target.value)} placeholder={'1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5 4. c3) 3... a6 *'} rows={5} />
        <div className="row">
          <button
            className="btn"
            disabled={!pgn.trim()}
            onClick={() => {
              const r = props.onImport(pgn);
              setNote(r.moves ? `Added ${r.moves} move${r.moves === 1 ? '' : 's'} (${r.cards} new position${r.cards === 1 ? '' : 's'}).` : 'Nothing new for this colour in that PGN.');
              if (r.moves) setPgn('');
            }}
          >
            Import
          </button>
          {note && <span className="muted small">{note}</span>}
        </div>
      </div>

      <div className="card rep-backup">
        <h2>Backup</h2>
        <p className="muted small">The library lives in this browser only. Clearing site data removes it, so keep a copy.</p>
        <div className="row">
          <button
            className="btn small"
            disabled={!props.all.size}
            onClick={() => {
              const blob = new Blob([store.exportJson(props.all.values())], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `shadowbook-repertoire-${today()}.json`;
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
              if (!f) return;
              try {
                const rows = store.importJson(await f.text());
                props.onRestore(rows);
                setNote(`Restored ${rows.length} positions.`);
              } catch (err) {
                setNote(err instanceof Error ? err.message : 'Could not read that file.');
              }
              e.target.value = '';
            }}
          />
          <button
            className="btn small ghost"
            disabled={!total}
            onClick={() => {
              if (window.confirm(`Delete all ${total} positions for this colour? This cannot be undone.`)) props.onClear();
            }}
          >
            Delete this colour
          </button>
        </div>
      </div>
    </>
  );
}

function Build({ color, start, entries, persist, onDone }: { color: Color; start: string[]; entries: Map<string, RepEntry>; persist: (c: RepEntry[], r?: string[]) => void; onDone(): void }) {
  const [line, setLine] = useState<string[]>(start);
  const { fen, turn } = useMemo(() => positionAfter(line), [line]);
  const here = turn === color ? entries.get(entryId(color, fen)) : undefined;
  // Opponent moves you have prepared against: positions after them that you have a card for.
  const replies = useMemo(() => {
    if (turn === color) return [];
    const c = new Chess(fen);
    return c
      .moves({ verbose: true })
      .map((m) => m.lan)
      .filter((uci) => {
        const next = new Chess(fen);
        playUci(next, uci);
        return entries.has(entryId(color, next.fen()));
      });
  }, [fen, turn, color, entries]);

  const play = (uci: string) => {
    if (turn === color) {
      const copy = new Map(entries);
      const changed = addMove(copy, color, line, uci);
      if (changed) persist([changed]);
    }
    setLine([...line, uci]);
  };

  const shapes = turn === color ? (here?.moves ?? []).map((m, i) => arrow(m, i === 0 ? 'green' : 'paleGreen')) : replies.map((m) => arrow(m, 'paleBlue'));

  return (
    <div className="rep-grid">
      <div className="rep-board">
        <Board fen={fen} orientation={color} movable={turn} lastMove={line[line.length - 1]} shapes={shapes} onMove={play} />
      </div>
      <div className="card rep-side">
        <h2>Add moves</h2>
        <p className="muted small">Play both sides. Every move you make for {color === 'w' ? 'White' : 'Black'} is saved as the move you play in that position. Green arrows are moves already saved; blue arrows are replies you've prepared for.</p>
        <p className="rep-line">{line.length ? ucisToSanLine(line) : 'Start position'}</p>
        {here && (
          <ul className="rep-moves">
            {here.moves.map((m, i) => (
              <li key={m}>
                <b>{sanOf(fen, m)}</b> {i === 0 ? <span className="pill">main</span> : <button className="link" onClick={() => persist([makeMain(here, m)])}>make main</button>}
                <button
                  className="link"
                  onClick={() => {
                    const left = removeMove(here, m);
                    if (left) persist([left]);
                    else persist([], [here.id]);
                  }}
                >
                  remove
                </button>
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

function Review({ color, title, initial, onGraded, onDone }: { color: Color; title?: string; initial: RepEntry[]; onGraded(e: RepEntry, wasNew: boolean): void; onDone(): void }) {
  const [cards, setCards] = useState(initial);
  const [i, setI] = useState(0);
  const [hint, setHint] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);
  const [solved, setSolved] = useState<string | null>(null);
  const [tally, setTally] = useState({ clean: 0, hint: 0, wrong: 0 });
  const card = cards[i];

  if (!card) {
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

  const grade = (o: Outcome) => {
    onGraded(review(card, o), isNew(card));
    setTally((t) => ({ ...t, [o]: t[o] + 1 }));
    // A missed card is shown once more at the end of the session.
    if (o === 'wrong') setCards((c) => [...c, card]);
  };
  const next = () => {
    setI(i + 1);
    setHint(false);
    setWrong(null);
    setSolved(null);
  };

  const onMove = (uci: string) => {
    if (card.moves.includes(uci)) {
      setSolved(uci);
      if (!wrong) grade(hint ? 'hint' : 'clean');
      setTimeout(next, 650);
    } else if (!wrong) {
      setWrong(uci);
      grade('wrong');
    }
  };

  const main = card.moves[0];
  const shapes: DrawShape[] = [];
  if (wrong) shapes.push(arrow(main, 'green'));
  else if (hint) shapes.push({ orig: main.slice(0, 2) as Key, brush: 'green' });
  const display = solved ? (() => { const c = new Chess(card.fen); playUci(c, solved); return c.fen(); })() : card.fen;

  return (
    <div className="rep-grid">
      <div className="rep-board">
        <Board key={card.id + (wrong ?? '')} fen={display} orientation={color} movable={solved ? null : color} lastMove={solved ?? card.line[card.line.length - 1]} shapes={shapes} onMove={onMove} />
      </div>
      <div className="card rep-side">
        <p className="muted small">
          {i + 1} / {cards.length} {isNew(card) && <span className="pill">new</span>}
        </p>
        {title && <p className="eyebrow">{title}</p>}
        <h2>Your move</h2>
        <p className="rep-line">{card.line.length ? ucisToSanLine(card.line) : 'Start position'}</p>
        {card.moves.length > 1 && !wrong && <p className="muted small">You have {card.moves.length} moves here; any of them counts.</p>}
        {wrong && (
          <p className="err">
            Not {sanOf(card.fen, wrong)} — you play <b>{sanOf(card.fen, main)}</b>
            {card.moves.length > 1 && <> (or {card.moves.slice(1).map((m) => sanOf(card.fen, m)).join(', ')})</>}. Play it to continue.
          </p>
        )}
        {solved && <p className="ok">{sanOf(card.fen, solved)} ✓</p>}
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

