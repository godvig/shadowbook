import { lazy, Suspense, useEffect, useState } from 'react';
import { Home } from './views/Home';
import { Report } from './views/Report';
import { Game, type GameSettings, type FinishedGame } from './views/Game';
import { Debrief } from './views/Debrief';
import type { Opponent } from './lib/opponent';
import { Logo } from './components/Logo';
import { Match } from './views/Match';
import { Privacy } from './views/Privacy';
import type { LibraryStart } from './views/Library';
import { isLibraryOAuthReturn, isOAuthReturn } from './live/lichessAuth';
import { MATCH_PAGES, MATCH_PATH, isMatchPath, matchLang } from './live/routes';
import { countEvent, countView } from './lib/counter';
import { isLibraryHash } from './rep/route';

// The Library (and its opening names) loads only when opened, so Spar and Match do not carry it.
const Library = lazy(() => import('./views/Library').then((m) => ({ default: m.Library })));

type View =
  | { name: 'home' }
  | { name: 'match' }
  | { name: 'privacy' }
  | { name: 'library'; start?: LibraryStart; key?: number }
  | { name: 'report' }
  | { name: 'game'; settings: GameSettings; startUcis: string[]; key: number }
  | { name: 'debrief'; settings: GameSettings; game: FinishedGame };

function viewFromLocation(): View {
  if (location.hash === '#privacy') return { name: 'privacy' };
  if (isLibraryHash(location.hash) || isLibraryOAuthReturn()) return { name: 'library' };
  if (isMatchPath(location.pathname) || location.hash === '#match' || isOAuthReturn()) return { name: 'match' };
  return { name: 'home' };
}

export default function App() {
  const [view, setViewRaw] = useState<View>(() => viewFromLocation());
  // Read on the first render: the match view clears the login parameters from the address before the effects below run.
  const [backFromLogin] = useState(() => isOAuthReturn() || isLibraryOAuthReturn());
  const setView = (v: View) => {
    setViewRaw(v);
    // The match hub has its own address; everything else lives on the root, privacy as #privacy.
    const onMatch = isMatchPath(location.pathname);
    if (v.name === 'match') {
      if (!onMatch) history.pushState(null, '', MATCH_PATH);
    } else {
      // The Library keeps its own address below #library (rep/route.ts) when it is already showing.
      const target = v.name === 'privacy' ? '/#privacy' : v.name === 'library' ? (v.start || v.key || !isLibraryHash(location.hash) ? '/#library' : `/${location.hash}`) : '/';
      if (onMatch) history.pushState(null, '', target);
      else if (`${location.pathname}${location.hash}` !== target) history.replaceState(null, '', target);
    }
  };

  useEffect(() => {
    // Old links (and the OAuth return) used /#match: move them to the real address.
    if (!isMatchPath(location.pathname) && (location.hash === '#match' || isOAuthReturn())) {
      history.replaceState(null, '', `${MATCH_PATH}${location.search}`);
    }
    // Back and Forward inside the Library are handled by the Library itself, without loading it again.
    const onPop = () => setViewRaw((v) => (v.name === 'library' && isLibraryHash(location.hash) ? v : viewFromLocation()));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    // The crawlable text on the match pages is only shown with the match view.
    document.body.dataset.view = view.name;
    // A translated match page declares its own language; every other view is in English.
    document.documentElement.lang = view.name === 'match' ? (matchLang(location.pathname) ?? 'en') : 'en';
    document.title =
      view.name === 'match'
        ? MATCH_PAGES[matchLang(location.pathname) ?? 'en'].title
        : view.name === 'library'
          ? 'Library – Shadowbook'
          : view.name === 'privacy'
          ? 'Privacy | Shadowbook'
          : 'Shadowbook – spar against the openings of a real player';
    // Count the view anonymously (lib/counter.ts). Match pages keep their own address; the other views are named.
    // Coming back from the Lichess login is not a visit from lichess.org, so that referrer is left out.
    countView(view.name === 'match' ? location.pathname : view.name === 'home' ? '/' : `/${view.name}`, { referrer: !backFromLogin });
  }, [view.name, backFromLogin]);
  const [opponent, setOpponent] = useState<Opponent | null>(null);

  const start = (settings: GameSettings, startUcis: string[] = []) =>
    setView({ name: 'game', settings, startUcis, key: Date.now() });

  const spar = view.name !== 'match' && view.name !== 'library';
  // On a translated match page, point to the description in that language (it sits below the English app).
  const pageLang = matchLang(location.pathname);
  const noteLang = pageLang && MATCH_PAGES[pageLang].note && document.getElementById('seo-h') ? pageLang : null;

  return (
    <>
      <header className="topbar">
        <button className="logo" onClick={() => setView({ name: 'home' })} aria-label="Shadowbook – home">
          <Logo /> Shadowbook
        </button>
        <span className="tag">alpha</span>
        <nav className="tabs" aria-label="Sections">
          <button className={spar ? 'on' : ''} aria-current={spar ? 'page' : undefined} onClick={() => setView({ name: 'home' })}>
            Spar
          </button>
          <button className={view.name === 'match' ? 'on' : ''} aria-current={view.name === 'match' ? 'page' : undefined} onClick={() => setView({ name: 'match' })}>
            Match <span className="live-pill">Live</span>
          </button>
          <button
            className={view.name === 'library' ? 'on' : ''}
            aria-current={view.name === 'library' ? 'page' : undefined}
            onClick={() => setView({ name: 'library', key: view.name === 'library' ? Date.now() : undefined })}
          >
            Library
          </button>
        </nav>
        <span className="spacer" />
        {/* The match view puts its Lichess login here. */}
        {view.name === 'match' && <span id="topbar-account" className="topbar-account" />}
        <a className="gh" href="https://github.com/godvig/shadowbook">GitHub</a>
      </header>
      <main className="page">
        {view.name === 'library' && (
          <Suspense fallback={<div className="card rep-wrap"><p className="muted">Opening your library…</p></div>}>
            <Library key={view.key} opponent={opponent} start={view.start} />
          </Suspense>
        )}
        {view.name === 'privacy' && <Privacy onBack={() => setView({ name: 'match' })} />}
        {view.name === 'match' && noteLang && (
          <p className="lang-note" lang={noteLang}>
            <a href="#seo-h">{MATCH_PAGES[noteLang].note}</a>
          </p>
        )}
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
          <Report
            opponent={opponent}
            onChange={setOpponent}
            onStart={(s) => start(s)}
            onBack={() => setView({ name: 'home' })}
            onLibrary={(st) => setView({ name: 'library', start: st, key: Date.now() })}
          />
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
          browser. Free and open source (AGPL-3.0). Built by{' '}
          <a href="https://adamenglund.eu/">Adam Englund</a>. If it helps your chess, you can{' '}
          <a href="https://ko-fi.com/godvig?ref=shadowbook" onClick={() => countEvent('ko-fi', 'Support link')}>
            buy me a coffee
          </a>
          .
        </footer>
      </main>
    </>
  );
}
