// Real, crawlable addresses for the match hub. The old #match link redirects here.
export const MATCH_PATH = '/world-chess-championship-2026/';
export const MATCH_PATH_SV = '/sv/schack-vm-2026/';

export const isMatchPath = (pathname: string) => pathname === MATCH_PATH || pathname === MATCH_PATH_SV || pathname === MATCH_PATH.slice(0, -1) || pathname === MATCH_PATH_SV.slice(0, -1);
