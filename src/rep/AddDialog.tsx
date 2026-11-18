// "+ Add": every way into the Library, building from your own games first. A small menu; each choice opens its panel.
import { useEffect, useRef, useState } from 'react';
import type * as db from './db';
import { FromGames } from './FromGames';
import type { GamesSite } from './model/fromGames';
import { chapterSource, fetchStudy, pgnSource } from './lichessStudy';
import { parseBackup } from './model/backup';
import { importMessage, importText } from './model/importer';
import { loadOpenings } from './model/openings';
import type { Card, Color, LibraryData } from './model/types';

export type AddPanel = 'games' | 'study' | 'pgn' | 'board' | 'backup';

const CHOICES: { id: AddPanel; title: string; text: string }[] = [
  { id: 'games', title: 'Build decks from your games', text: 'From what you play on chess.com or Lichess. No study needed.' },
  { id: 'study', title: 'Import a Lichess study', text: 'Each chapter becomes a deck, with its notes and arrows.' },
  { id: 'pgn', title: 'Paste PGN', text: 'One or more games with variations.' },
  { id: 'board', title: 'Start on the board', text: 'An empty deck you fill by playing moves.' },
  { id: 'backup', title: 'Restore a backup', text: 'A file from "Download backup".' },
];

export function AddDialog(props: {
  open: AddPanel | 'menu' | null;
  lib: LibraryData;
  cards: Map<string, Card>;
  /** Prefill for "Build decks from your games". */
  initial?: { site: GamesSite; username: string };
  onClose(): void;
  onImported(next: LibraryData, change: db.Change, firstId?: string): void;
  /** Decks built from games were saved: close, and say so on the shelf. */
  onBuilt(next: LibraryData, change: db.Change, message: string): void;
  onNewDeck(color: Color): void;
  onRestore(b: ReturnType<typeof parseBackup>): Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [panel, setPanel] = useState<AddPanel | 'menu'>('menu');
  const [busy, setBusy] = useState(false);
  const [study, setStudy] = useState('');
  const [pgn, setPgn] = useState('');
  const [color, setColor] = useState<Color>('w');
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) {
      setPanel(props.open);
      setNotes([]);
      d.showModal();
    } else if (!props.open && d.open) d.close();
  }, [props.open]);

  const runImport = async (text: string, source: Parameters<typeof importText>[2]['source']) => {
    const r = importText(props.lib, text, { color, source, openings: await loadOpenings() });
    if (r.decks.length) props.onImported(r.lib, { decks: r.write.decks, edges: r.write.edges, cards: r.write.cardsAdded, deleteCards: r.write.cardsRemoved }, r.decks[0].deck.id);
    setNotes(importMessage(r));
    return r;
  };

  const show = (p: AddPanel | 'menu') => {
    setPanel(p);
    setNotes([]);
  };
  const choice = CHOICES.find((c) => c.id === panel);

  return (
    <dialog ref={ref} className="add-dialog" onClose={props.onClose} aria-labelledby="add-title">
      <div className="add-head">
        {panel !== 'menu' && (
          <button className="link" onClick={() => show('menu')}>
            ← All ways to add
          </button>
        )}
        <h2 id="add-title">{choice?.title ?? 'Add to your library'}</h2>
        <button className="btn small ghost add-close" onClick={props.onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {panel === 'menu' && (
        <ul className="add-menu">
          {CHOICES.map((c, i) => (
            <li key={c.id}>
              <button className={`add-choice${i === 0 ? ' first' : ''}`} onClick={() => show(c.id)}>
                <b>{c.title}</b>
                <span className="muted small">{c.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {panel === 'games' && <FromGames lib={props.lib} cards={props.cards} initial={props.initial} onSaved={props.onBuilt} />}

      {panel === 'study' && (
        <form
          className="rep-study"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const { ref: at, pgn: text } = await fetchStudy(study);
              const r = await runImport(text, (g) => chapterSource(g.tags, at));
              if (r.decks.length) setStudy('');
            } catch (err) {
              setNotes([err instanceof Error ? err.message : 'Could not import that study.']);
            }
            setBusy(false);
          }}
        >
          <p className="muted small">
            Paste a link to a public or unlisted study, or to one chapter. Each chapter becomes a deck, White or Black by its board orientation. Importing the same
            study again updates those decks and never removes your moves.
          </p>
          <input value={study} onChange={(e) => setStudy(e.target.value)} placeholder="https://lichess.org/study/…" aria-label="Lichess study link" />
          <button className="btn" disabled={!study.trim() || busy}>
            {busy ? 'Importing…' : 'Import study'}
          </button>
        </form>
      )}

      {panel === 'pgn' && (
        <div>
          <p className="muted small">Each game becomes a deck; every variation, comment, sign and arrow is kept.</p>
          <textarea className="rep-pgn" value={pgn} onChange={(e) => setPgn(e.target.value)} placeholder={'1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5 4. c3) 3... a6 *'} rows={6} aria-label="PGN" />
          <div className="row">
            <label className="rep-check">
              <span className="muted small">Games without an Orientation tag are</span>
              <select value={color} onChange={(e) => setColor(e.target.value as Color)} aria-label="Colour for games without orientation">
                <option value="w">White</option>
                <option value="b">Black</option>
              </select>
            </label>
            <button
              className="btn"
              disabled={!pgn.trim() || busy}
              onClick={async () => {
                const r = await runImport(pgn, (g) => pgnSource(g.tags));
                if (r.decks.length) setPgn('');
              }}
            >
              Import
            </button>
          </div>
        </div>
      )}

      {panel === 'board' && (
        <div>
          <p className="muted small">Start an empty deck and add moves by playing them, for both sides.</p>
          <div className="row">
            <button className="btn" onClick={() => props.onNewDeck('w')}>
              New White deck
            </button>
            <button className="btn" onClick={() => props.onNewDeck('b')}>
              New Black deck
            </button>
          </div>
        </div>
      )}

      {panel === 'backup' && (
        <div>
          <p className="muted small">Restoring replaces your whole library with the backup.</p>
          <input
            type="file"
            accept="application/json"
            aria-label="Backup file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const b = parseBackup(await f.text());
                if (props.lib.decks.length && !window.confirm(`Replace your library (${props.lib.decks.length} decks) with this backup (${b.decks.length} decks)? This cannot be undone.`)) return;
                await props.onRestore(b);
                setNotes([`Restored ${b.decks.length} deck${b.decks.length === 1 ? '' : 's'} with ${b.cards.length} positions.`]);
              } catch (err) {
                setNotes([err instanceof Error ? err.message : 'Could not read that file.']);
              }
            }}
          />
        </div>
      )}

      {notes.length > 0 && (
        <ul className="rep-notes muted small">
          {notes.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </dialog>
  );
}
