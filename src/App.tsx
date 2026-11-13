import { useState } from 'react';
import { Home } from './views/Home';
import { Report } from './views/Report';
import { Game, type GameSettings, type FinishedGame } from './views/Game';
import { Debrief } from './views/Debrief';
import type { Opponent } from './lib/opponent';
import { Logo } from './components/Logo';
import { Match } from './views/Match';
import { isOAuthReturn } from './live/lichessAuth';

type View =
  | { name: 'home' }
  | { name: 'match' }
  | { name: 'report' }
  | { name: 'game'; settings: GameSettings; startUcis: string[]; key: number }
  | { name: 'debrief'; settings: GameSettings; game: FinishedGame };

export default function App() {
  const [view, setViewRaw] = useState<View>(() => (location.hash === '#match' || isOAuthReturn() ? { name: 'match' } : { name: 'home' }));
  const setView = (v: View) => {
    setViewRaw(v);
    const hash = v.name === 'match' ? '#match' : '';
    if (location.hash !== hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  };
  const [opponent, setOpponent] = useState<Opponent | null>(null);

  const start = (settings: GameSettings, startUcis: string[] = []) =>
    setView({ name: 'game', settings, startUcis, key: Date.now() });

  return (
    <>
      <header className="topbar">
        <button className="logo" onClick={() => setView({ name: 'home' })} aria-label="Shadowbook – home">
          <Logo /> Shadowbook
        </button>
        <span className="tag">alpha</span>
        <nav className="tabs" aria-label="Sections">
          <button className={view.name === 'match' ? '' : 'on'} aria-current={view.name === 'match' ? undefined : 'page'} onClick={() => setView({ name: 'home' })}>
            Spar
          </button>
          <button className={view.name === 'match' ? 'on' : ''} aria-current={view.name === 'match' ? 'page' : undefined} onClick={() => setView({ name: 'match' })}>
            Match <span className="live-pill">Live</span>
          </button>
        </nav>
        <span className="spacer" />
        <a className="gh" href="https://github.com/godvig/shadowbook">GitHub</a>
      </header>
      <main className="page">
        {view.name === 'match' && (
          <Match
            onScouted={(o) => {
              setOpponent(o);
              setView({ name: 'report' });
            }}
            onSpar={(o, settings, startUcis) => {
              setOpponent(o);
              start(settings, startUcis);
            }}
          />
        )}
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
