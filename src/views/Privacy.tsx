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
      <p className="muted">Last updated 15 November 2026</p>

      <h2>The short version</h2>
      <p>
        Shadowbook stores as little as it can. The sparring tool keeps everything in your own browser. The match hub stores your Lichess username and
        what you post or predict, so the leaderboard and the chat work. You can download or delete all of it yourself, at any time, from the Match tab.
      </p>

      <h2>Who runs this</h2>
      <p>
        Shadowbook is an open source project by Adam Englund. Questions and data requests:{' '}
        <a href="mailto:adamenglund@godvig.com">adamenglund@godvig.com</a>, or{' '}
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
          with a timestamp. Nothing else: no e-mail address, no password, no rating.
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
          <strong>How long:</strong> until you delete your account, or until it has not been used for three months, whichever comes first. Every visit
          while logged in resets that clock. Nothing is removed for inactivity before 31 March 2027, so the match stays readable as an archive until
          then. Removing an account removes its predictions, messages, reactions and reports with it; only anonymous totals (such as how many
          people called a draw) are kept.
        </li>
      </ul>

      <h2>Visit counting</h2>
      <ul>
        <li>
          <strong>What is counted:</strong> page views, to see which parts of the site are used and where visitors come from. Each view sends the page
          address (never what comes after <code>?</code> or <code>#</code>), the page title, the site that linked you here, your screen width and, if the
          link had one, a campaign tag.
        </li>
        <li>
          <strong>Who counts:</strong> <a href="https://www.goatcounter.com/help/gdpr">GoatCounter</a>. It keeps totals (such as "40 visits from
          Telegram today"), not a log of individual visitors. Your IP address and browser type are used for up to eight hours, in memory only, to
          tell one visit from the next and to work out a country; they are not stored.
        </li>
        <li>
          <strong>What it is not:</strong> no cookies, nothing saved in your browser, no link to your Lichess account, and no following you to other
          sites. Nothing is counted if your browser sends Do Not Track or Global Privacy Control.
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
          provides the live games. <strong>Google Fonts</strong> serves the typefaces, so your browser contacts Google when the page loads.{' '}
          <strong>GoatCounter</strong> counts visits, as described above.
        </li>
        <li>No ads, no cookies of our own, no advertising or cross-site trackers.</li>
      </ul>
    </article>
  );
}
