// Addresses inside the Library, so a reload keeps the page and Back works. They live after "#library" in the
// hash; visit counting only ever sees /library (App.tsx), never a deck id.
export type LibraryRoute =
  | { page: 'shelf' }
  | { page: 'deck'; id: string }
  | { page: 'train'; id: string }
  | { page: 'starter'; id: string }
  | { page: 'insights' }
  /** Send to Lichess, with one deck ticked when it comes from that deck. */
  | { page: 'share'; id?: string }
  /** Drilling what a scouted opponent steers into. Needs the opponent in memory, so a reload goes to the shelf. */
  | { page: 'prep' };

export const isLibraryHash = (hash: string) => hash === '#library' || hash.startsWith('#library/');

export function parseRoute(hash: string): LibraryRoute {
  const [, page, id] = hash.replace(/^#library\/?/, '#/').split('/');
  const safe = id ? decodeURIComponent(id) : '';
  if ((page === 'deck' || page === 'train' || page === 'starter') && safe) return { page, id: safe };
  if (page === 'prep' || page === 'insights') return { page };
  if (page === 'share') return safe ? { page, id: safe } : { page };
  return { page: 'shelf' };
}

export function routeHash(r: LibraryRoute): string {
  if (r.page === 'shelf') return '#library';
  if (r.page === 'prep' || r.page === 'insights' || (r.page === 'share' && !r.id)) return `#library/${r.page}`;
  return `#library/${r.page}/${encodeURIComponent(r.id!)}`;
}
