import { useEffect, useState } from 'react';
import { Home } from './views/Home';
import { Report } from './views/Report';
import { Game, type GameSettings, type FinishedGame } from './views/Game';
import { Debrief } from './views/Debrief';
import type { Opponent } from './lib/opponent';
import { Logo } from './components/Logo';
import { Match } from './views/Match';
import { Privacy } from './views/Privacy';
import { isOAuthReturn } from './live/lichessAuth';
import { MATCH_PATH, isMatchPath } from './live/routes';

type View =
  | { name: 'home' }
  | { name: 'match' }
  | { name: 'privacy' }
  | { name: 'report' }
  | { name: 'game'; settings: GameSettings; startUcis: string[]; key: number }
  | { name: 'debrief'; settings: GameSettings; game: FinishedGame };

function viewFromLocation(): View {
  if (location.hash === '#privacy') return { name: 'privacy' };
  if (isMatchPath(location.pathname) || location.hash === '#match' || isOAuthReturn()) return { name: 'match' };
  return { name: 'home' };
}

export default function App() {
  const [view, setViewRaw] = useState<View>(() => viewFromLocation());
  const setView = (v: View) => {
    setViewRaw(v);
    // The match hub has its own address; everything else lives on the root, privacy as #privacy.
    const onMatch = isMatchPath(location.pathname);
    if (v.name === 'match') {
      if (!onMatch) history.pushState(null, '', MATCH_PATH);
    } else {
      const target = v.name === 'privacy' ? '/#privacy' : '/';
      if (onMatch) history.pushState(null, '', target);
      else if (`${location.pathname}${location.hash}` !== target) history.replaceState(null, '', target);
    }
  };

  useEffect(() => {
    // Old links (and the OAuth return) used /#match: move them to the real address.
    if (!isMatchPath(location.pathname) && (location.hash === '#match' || isOAuthReturn())) {
      history.replaceState(null, '', `${MATCH_PATH}${location.search}`);
    }
    const onPop = () => setViewRaw(viewFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    // The crawlable text on the match pages is only shown with the match view.
    document.body.dataset.view = view.name;
    document.title =
      view.name === 'match'
        ? location.pathname.startsWith('/sv/')
          ? 'Schack-VM 2026: Gukesh mot Sindarov – tippa varje parti och chatta live | Shadowbook'
          : 'Gukesh vs Sindarov: World Chess Championship 2026 predictions and live chat | Shadowbook'
        : view.name === 'privacy'
          ? 'Privacy | Shadowbook'
          : 'Shadowbook – spar against the openings of a real player';
  }, [view.name]);
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
        {view.name === 'privacy' && <Privacy onBack={() => setView({ name: 'match' })} />}
        {view.name === 'match' && (
          <Match
            onPrivacy={() => setView({ name: 'privacy' })}
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
