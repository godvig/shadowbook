// Chat helpers: reactions with chess annotation glyphs, and @mentions.

/** Reactions are chess annotation symbols rather than emoji. */
export const GLYPHS = ['!!', '!', '?', '??', '½'] as const;
export type Glyph = (typeof GLYPHS)[number];
export const GLYPH_MEANING: Record<Glyph, string> = { '!!': 'Brilliant', '!': 'Good', '?': 'Dubious', '??': 'Blunder', '½': 'Drawish' };

export interface Reaction {
  message_id: number;
  lichess_id: string;
  glyph: Glyph;
}

export interface ReactionCount {
  glyph: Glyph;
  count: number;
  mine: boolean;
}

/** Reaction chips per message, in glyph order. */
export function reactionsByMessage(reactions: Reaction[], myId: string | undefined): Map<number, ReactionCount[]> {
  const counts = new Map<number, Map<Glyph, ReactionCount>>();
  for (const r of reactions) {
    const byGlyph = counts.get(r.message_id) ?? new Map<Glyph, ReactionCount>();
    const c = byGlyph.get(r.glyph) ?? { glyph: r.glyph, count: 0, mine: false };
    c.count++;
    if (myId && r.lichess_id === myId) c.mine = true;
    byGlyph.set(r.glyph, c);
    counts.set(r.message_id, byGlyph);
  }
  const out = new Map<number, ReactionCount[]>();
  for (const [id, byGlyph] of counts) out.set(id, GLYPHS.filter((g) => byGlyph.has(g)).map((g) => byGlyph.get(g)!));
  return out;
}

export type Segment = { text: string; mention?: string };

/** Splits a message into plain text and @mentions (Lichess usernames: letters, digits, _ and -). */
export function segments(body: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of body.matchAll(/(^|[^\w@])@([A-Za-z0-9][\w-]{1,29})/g)) {
    const at = m.index! + m[1].length;
    if (at > last) out.push({ text: body.slice(last, at) });
    out.push({ text: `@${m[2]}`, mention: m[2].toLowerCase() });
    last = at + 1 + m[2].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

export const mentions = (body: string, username: string | undefined) => !!username && segments(body).some((s) => s.mention === username.toLowerCase());
