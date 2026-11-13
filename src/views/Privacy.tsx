// Privacy notice for Shadowbook and Shadowbook Live. Plain language; it describes what the code actually does.
import { useEffect } from 'react';

export function Privacy({ onBack }: { onBack: () => void }) {
  useEffect(() => window.scrollTo(0, 0), []);
  return (
    <article className="privacy">
      <button className="link" onClick={onBack}>
        ← Back
      </button>
      <h1>Privacy</h1>
      <p className="muted">Last updated 14 November 2026</p>

      <h2>The short version</h2>
      <p>
        Shadowbook stores as little as it can. The sparring tool keeps everything in your own browser. The match hub stores your Lichess username and
        what you post or predict, so the leaderboard and the chat work. You can download or delete all of it yourself, at any time, from the Match tab.
      </p>

      <h2>Who runs this</h2>
      <p>
        Shadowbook is an open source project by Adam Englund. Questions and requests:{' '}
        <a href="https://github.com/godvig/shadowbook/issues">open an issue on GitHub</a>.
      </p>

      <h2>Sparring (no account)</h2>
      <ul>
        <li>When you scout a player, your browser downloads their public games straight from chess.com or Lichess. Shadowbook's servers are not involved.</li>
        <li>Scouted players are cached in your browser (IndexedDB) for a few hours. Nothing is sent to us.</li>
      </ul>

      <h2>Match hub (Log in with Lichess)</h2>
      <ul>
        <li>
          <strong>What we store:</strong> your Lichess id and username, your predictions, your chat messages, your reactions and any reports you make, each
          with a timestamp. Nothing else: no e-mail address, no password, no rating, no tracking.
        </li>
        <li>
          <strong>Your Lichess login:</strong> Lichess gives your browser a token that only proves who you are. It is kept in your browser; our server uses
          it to check your username with Lichess and does not store it. Logging out revokes it.
        </li>
        <li>
          <strong>What is public:</strong> your username, your messages and reactions, and your points on the leaderboard. Your individual predictions are
          not shown to others, only the totals.
        </li>
        <li>
          <strong>Why:</strong> to run the features you choose to use (legitimate interest, GDPR article 6(1)(f)). Moderation: three reports from different
          players hide a message, and an admin can hide messages or block accounts that break the rules.
        </li>
        <li>
          <strong>How long:</strong> until you delete your account. After the match the data may be removed or kept as an archive of the event; if that
          changes, this page will say so.
        </li>
      </ul>

      <h2>Your rights</h2>
      <ul>
        <li>
          <strong>Download your data:</strong> Match tab → "Download my data" gives you everything we store about you as a JSON file.
        </li>
        <li>
          <strong>Delete your account:</strong> Match tab → "Delete my account" removes your profile, predictions, messages, reactions and reports
          immediately and for good.
        </li>
        <li>You can also ask for correction or object to processing via the contact above, and complain to your data protection authority (in Sweden, IMY).</li>
      </ul>

      <h2>Services involved</h2>
      <ul>
        <li>
          <strong>GitHub Pages</strong> hosts the site. <strong>Supabase</strong> hosts the match hub database. <strong>Lichess</strong> handles login and
          provides the live games. <strong>Google Fonts</strong> serves the typefaces, so your browser contacts Google when the page loads.
        </li>
        <li>No analytics, no ads, no cookies of our own.</li>
      </ul>
    </article>
  );
}
