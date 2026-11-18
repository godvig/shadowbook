// Library settings: how much is new each day, how hard the schedule aims, how training runs, and the data itself
// (reset a deck, backup, restore). Every change is saved at once; the training switches are the same ones that
// sit beside the board.
import { useState } from 'react';
import { parseBackup } from './model/backup';
import type { Deck, Settings } from './model/types';

const SPEEDS = [
  { ms: 700, label: 'Slow' },
  { ms: 350, label: 'Normal' },
  { ms: 150, label: 'Fast' },
];

export function SettingsPage(props: {
  settings: Settings;
  decks: Deck[];
  onSettings(patch: Partial<Settings>): void;
  /** Resets one deck after a confirm; returns what to tell the person, or nothing if cancelled. */
  onReset(deck: Deck): string | undefined;
  onBackup(): void;
  onRestore(b: ReturnType<typeof parseBackup>): Promise<void>;
  onBack(): void;
}) {
  const s = props.settings;
  const [resetId, setResetId] = useState(props.decks[0]?.id ?? '');
  const [note, setNote] = useState('');
  const pct = Math.round(s.retention * 100);

  return (
    <div className="settings-page">
      <div className="deck-head">
        <button className="link" onClick={props.onBack}>
          ← Your library
        </button>
      </div>
      <h1>Settings</h1>
      <p className="muted">Saved as you change them, in this browser.</p>

      <section className="card settings-card">
        <h2>Schedule</h2>
        <label className="setting">
          <span>
            New moves per day <b>{s.newPerDay}</b>
          </span>
          <input type="range" min={5} max={50} step={1} value={s.newPerDay} onChange={(e) => props.onSettings({ newPerDay: Number(e.target.value) })} />
          <span className="muted small">How many moves you have not trained before are taught each day, across all decks.</span>
        </label>
        <label className="setting">
          <span>
            Target retention <b>{pct}%</b>
          </span>
          <input type="range" min={80} max={95} step={1} value={pct} onChange={(e) => props.onSettings({ retention: Number(e.target.value) / 100 })} />
          <span className="muted small">
            How often you should still know a move when it comes back. Higher means more reviews. A change applies from each move's next review.
          </span>
        </label>
      </section>

      <section className="card settings-card">
        <h2>Training</h2>
        <fieldset className="setting">
          <legend>Mode</legend>
          <label className="rep-check">
            <input type="radio" name="mode" checked={s.mode === 'lines'} onChange={() => props.onSettings({ mode: 'lines' })} /> Full lines: play each line from the start
          </label>
          <label className="rep-check">
            <input type="radio" name="mode" checked={s.mode === 'positions'} onChange={() => props.onSettings({ mode: 'positions' })} /> Positions: go straight to the moves that are due
          </label>
          <span className="muted small">The switch beside the board changes the same setting.</span>
        </fieldset>
        <label className="setting">
          <span>Speed of the opponent's moves</span>
          <select value={SPEEDS.reduce((a, b) => (Math.abs(b.ms - s.autoplayMs) < Math.abs(a.ms - s.autoplayMs) ? b : a)).ms} onChange={(e) => props.onSettings({ autoplayMs: Number(e.target.value) })}>
            {SPEEDS.map((x) => (
              <option key={x.ms} value={x.ms}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="rep-check">
          <input type="checkbox" checked={s.pauseAfterMove} onChange={(e) => props.onSettings({ pauseAfterMove: e.target.checked })} /> Pause after each move
        </label>
        <label className="rep-check">
          <input type="checkbox" checked={s.showBookMoves} onChange={(e) => props.onSettings({ showBookMoves: e.target.checked })} /> Show my other book moves
        </label>
        <label className="rep-check">
          <input type="checkbox" checked={s.engine} onChange={(e) => props.onSettings({ engine: e.target.checked })} /> Stockfish's recommendation, in training and Insights (asks Lichess,
          sends only the position)
        </label>
      </section>

      <section className="card settings-card">
        <h2>Your data</h2>
        <p className="muted small">The library lives in this browser only. A backup holds every deck, your progress and your settings.</p>
        <div className="row">
          <button className="btn" onClick={props.onBackup}>
            Download backup
          </button>
          <label className="btn file-btn">
            Restore a backup
            <input
              type="file"
              accept="application/json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const b = parseBackup(await f.text());
                  if (props.decks.length && !window.confirm(`Replace your library (${props.decks.length} decks) with this backup (${b.decks.length} decks)? This cannot be undone.`)) return;
                  await props.onRestore(b);
                  setNote(`Restored ${b.decks.length} deck${b.decks.length === 1 ? '' : 's'} with ${b.cards.length} positions.`);
                } catch (err) {
                  setNote(err instanceof Error ? err.message : 'Could not read that file.');
                }
              }}
            />
          </label>
        </div>
        {props.decks.length > 0 && (
          <div className="setting">
            <span>Reset progress for a deck</span>
            <div className="row">
              <select value={resetId} onChange={(e) => setResetId(e.target.value)} aria-label="Deck to reset">
                {props.decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                onClick={() => {
                  const d = props.decks.find((x) => x.id === resetId);
                  const msg = d && props.onReset(d);
                  if (msg) setNote(msg);
                }}
              >
                Reset progress
              </button>
            </div>
            <span className="muted small">Its moves become new again, to be learned from the start. The deck and its moves stay.</span>
          </div>
        )}
        {note && (
          <p className="small" role="status">
            {note}
          </p>
        )}
      </section>
    </div>
  );
}
