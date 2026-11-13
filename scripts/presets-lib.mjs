// Pure helpers for build-presets.mjs: PGN parsing, player matching, the classical filter and dedupe.
// Kept free of I/O so they can be unit-tested (see src/lib/presets.test.ts).
import { Chess } from 'chess.js';

/** Plies kept per game. Presets use a deeper book (32) than scouted players, plus a little slack. */
export const PRESET_PLIES = 40;

export function pgnHeaders(pgn) {
  const headers = {};
  for (const m of pgn.matchAll(/^\[(\w+)\s+"([^"]*)"\]/gm)) headers[m[1]] = m[2];
  return headers;
}

/** Main-line SAN moves, ignoring comments, variations, NAGs and move numbers. */
export function pgnSans(pgn) {
  const body = pgn
    .replace(/^\[.*\]\s*$/gm, '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ');
  let depth = 0;
  let clean = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) clean += ch;
  }
  return clean
    .split(/\s+/)
    .map((t) => t.replace(/^\d+\.+/, '').replace(/[!?]+$/, ''))
    .filter((t) => t && !/^\$\d+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}

export function splitPgn(text) {
  return text
    .split(/(?=^\[Event\s)/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function sansToUcis(sans) {
  const chess = new Chess();
  const out = [];
  for (const san of sans) {
    try {
      const m = chess.move(san);
      out.push(m.from + m.to + (m.promotion ?? ''));
    } catch {
      break;
    }
  }
  return out;
}

/** Lowercase name tokens without accents or punctuation: "Sindarov, Javokhir" → ["sindarov", "javokhir"]. */
export function nameTokens(name) {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * Whether a PGN player is the preset player. A FIDE id decides on its own when the header has one;
 * otherwise the name must contain the surname and nothing but known given names or initials,
 * so "Gukesh D", "Gukesh, D", "Dommaraju Gukesh" and "D. Gukesh" match but "Gukesh Junior" does not.
 */
export function isPlayer(player, name, fideId) {
  const id = Number(fideId);
  if (id > 0) return id === player.fideId;
  const tokens = nameTokens(name);
  if (!tokens.includes(player.surname)) return false;
  return tokens.every((t) => t === player.surname || player.given.includes(t));
}

/** Seconds of thinking time for a 60-move game, from a PGN TimeControl tag ("5400+30", "40/7200:1800+30"). */
export function secondsFor60(tc) {
  // Broadcast tags are hand-typed: "40/5400+30:1800_30\"" means 40/5400+30:1800+30.
  tc = tc?.replace(/["\\\s]/g, '').replace(/_/g, '+');
  if (!tc || tc === '-' || tc === '?') return null;
  let total = 0;
  let moves = 0;
  for (const part of tc.split(':')) {
    const m = part.match(/^(?:(\d+)\/)?(\d+)(?:\+(\d+))?$/);
    if (!m) return null;
    const [, perMoves, base, inc] = m;
    const period = Math.min(perMoves ? Number(perMoves) : 60, 60 - moves);
    total += Number(base) + period * Number(inc ?? 0);
    moves += period;
    if (moves >= 60) break;
  }
  return total;
}

const NOT_CLASSICAL = /\b(rapid|blitz|bullet|armageddon|tie-?breaks?|play-?offs?|960|freestyle|fischer|exhibition|simul)\b/i;

/**
 * Classical by FIDE's definition: more than 60 minutes per player for a 60-move game.
 * The TimeControl tag decides when it can be parsed; event and round names catch
 * rapid, blitz, Armageddon and tiebreak games that come without one.
 */
export function isClassical(headers, eventName = '') {
  const names = [headers.Event, headers.Round, headers.RoundName, eventName].filter(Boolean).join(' ');
  if (NOT_CLASSICAL.test(names)) return false;
  if (headers.Variant && headers.Variant.toLowerCase() !== 'standard') return false;
  if (headers.SetUp === '1' || headers.FEN) return false;
  const secs = secondsFor60(headers.TimeControl);
  return secs === null ? true : secs > 3600;
}

function toResult(s) {
  return s === '1-0' || s === '0-1' || s === '1/2-1/2' ? s : '*';
}

function dateOf(h) {
  const d = (h.UTCDate ?? h.Date ?? '').replace(/\./g, '-');
  const t = Date.parse(d);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Picks the preset player's classical games from one event's PGN export.
 * Their name is normalised to `player.name` so the book can find them; opponents keep theirs.
 */
export function gamesFromEvent(pgnText, player, event) {
  const out = [];
  // Norway Chess relays the Armageddon game in the same broadcast round as the classical game it
  // decides, with the same pairing and no TimeControl. Only the first meeting in a round is classical.
  const pairings = new Set();
  for (const pgn of splitPgn(pgnText)) {
    const h = pgnHeaders(pgn);
    const pairing = [h.BroadcastURL ?? h.Round?.split('.')[0], ...[h.White, h.Black].map((n) => nameTokens(n).sort().join(' ')).sort()].join('|');
    const repeat = pairings.has(pairing);
    pairings.add(pairing);
    const asWhite = isPlayer(player, h.White, h.WhiteFideId);
    const asBlack = isPlayer(player, h.Black, h.BlackFideId);
    if (asWhite === asBlack) continue;
    if (repeat || !isClassical(h, event?.name)) continue;
    const ucis = sansToUcis(pgnSans(pgn));
    if (ucis.length < 2) continue;
    out.push({
      id: h.GameURL ?? h.Site ?? `${event?.id ?? 'pgn'}:${h.White}:${h.Black}:${h.Round ?? ''}`,
      white: asWhite ? player.name : h.White,
      black: asBlack ? player.name : h.Black,
      whiteElo: Number(h.WhiteElo) || undefined,
      blackElo: Number(h.BlackElo) || undefined,
      result: toResult(h.Result),
      timeClass: 'classical',
      end: dateOf(h),
      ucis,
      source: event?.id,
    });
  }
  return out;
}

/** Drops games with the same players, date and moves (e.g. one game relayed in two broadcasts). */
export function dedupe(games) {
  const seen = new Set();
  return games.filter((g) => {
    const key = [nameTokens(g.white).sort().join(' '), nameTokens(g.black).sort().join(' '), new Date(g.end).toISOString().slice(0, 10), g.ucis.join(' ')].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The committed file: games truncated to the opening, plus where they came from. */
export function presetFile(player, games, events, generatedAt = new Date().toISOString()) {
  const sorted = [...games].sort((a, b) => a.end - b.end);
  const count = (e) => sorted.filter((g) => g.source === e.id).length;
  return {
    meta: {
      name: player.name,
      display: player.display,
      fideId: player.fideId,
      games: sorted.length,
      asWhite: sorted.filter((g) => g.white === player.name).length,
      asBlack: sorted.filter((g) => g.black === player.name).length,
      sources: events.map((e) => ({ name: e.name, url: e.url, date: e.date, games: count(e) })).filter((s) => s.games > 0),
      credit: 'Moves from official broadcasts relayed on Lichess (https://lichess.org/broadcast).',
      generatedAt,
    },
    games: sorted.map((g) => {
      const { source, ...rest } = g;
      void source;
      return { ...rest, ucis: g.ucis.slice(0, PRESET_PLIES) };
    }),
  };
}
