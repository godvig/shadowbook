import { useState } from 'react';
import { Home } from './views/Home';
import { Report } from './views/Report';
import { Game, type GameSettings, type FinishedGame } from './views/Game';
import { Debrief } from './views/Debrief';
import type { Opponent } from './lib/opponent';
import { Logo } from './components/Logo';

type View =
  | { name: 'home' }
  | { name: 'report' }
  | { name: 'game'; settings: GameSettings; startUcis: string[]; key: number }
  | { name: 'debrief'; settings: GameSettings; game: FinishedGame };

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [opponent, setOpponent] = useState<Opponent | null>(null);

  const start = (settings: GameSettings, startUcis: string[] = []) =>
    setView({ name: 'game', settings, startUcis, key: Date.now() });

  return (
    <>
      <header className="topbar">
        <button className="logo" onClick={() => setView({ name: 'home' })} aria-label="Doppelgambit – home">
          <Logo /> Doppelgambit
        </button>
        <span className="tag">alpha</span>
        <span className="spacer" />
        <a className="gh" href="https://github.com/godvig/doppelgambit">GitHub</a>
      </header>
      <main className="page">
        {view.name === 'home' && (
          <Home
            onScouted={(o) => {
              setOpponent(o);
              setView({ name: 'report' });
            }}
          />
        )}
        {view.name === 'report' && opponent && (
          <Report opponent={opponent} onChange={setOpponent} onStart={(s) => start(s)} onBack={() => setView({ name: 'home' })} />
        )}
        {view.name === 'game' && opponent && (
          <Game
            key={view.key}
            opponent={opponent}
            settings={view.settings}
            startUcis={view.startUcis}
            onFinish={(game) => setView({ name: 'debrief', settings: view.settings, game })}
            onBack={() => setView({ name: 'report' })}
          />
        )}
        {view.name === 'debrief' && opponent && (
          <Debrief
            opponent={opponent}
            settings={view.settings}
            game={view.game}
            onRematch={(ucis) => start(view.settings, ucis)}
            onNewOpponent={() => setView({ name: 'home' })}
            onReport={() => setView({ name: 'report' })}
          />
        )}
        <footer className="footer">
          Openings come from the player’s public games. After that the bot is{' '}
          <a href="https://github.com/CSSLab/maia3">Maia3</a>, a neural network trained to play like humans of a given rating. Everything runs in your
          browser. Free and open source (AGPL-3.0).
        </footer>
      </main>
    </>
  );
}
