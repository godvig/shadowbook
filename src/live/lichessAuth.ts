// "Log in with Lichess": OAuth 2 authorization code flow with PKCE, entirely in the browser.
// Lichess accepts public clients without registration, so there is no client secret.
import { LICHESS, LICHESS_CLIENT_ID } from './config';
import { MATCH_PATH } from './routes';

const TOKEN_KEY = 'shadowbook.lichessToken';
const PENDING_KEY = 'shadowbook.oauthPending';

export function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

const random = (n: number) => base64url(crypto.getRandomValues(new Uint8Array(n)));
const redirectUri = () => location.origin + import.meta.env.BASE_URL;

function store(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export const getToken = () => store()?.getItem(TOKEN_KEY) ?? null;

export async function login(): Promise<void> {
  const verifier = random(48);
  const state = random(16);
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state }));
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: LICHESS_CLIENT_ID,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    state,
  });
  location.assign(`${LICHESS}/oauth?${q}`);
}

/** True when this page load is the return from Lichess. */
export const isOAuthReturn = () => new URLSearchParams(location.search).has('state');

/** Finishes a login after Lichess redirects back. Returns the token, or null if this was not a login return. */
export async function completeLogin(): Promise<string | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!state) return null;
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as { verifier: string; state: string } | null;
  sessionStorage.removeItem(PENDING_KEY);
  history.replaceState(null, '', MATCH_PATH);
  if (!code || !pending || pending.state !== state) throw new Error('Lichess login was cancelled or expired. Try again.');
  const res = await fetch(`${LICHESS}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: pending.verifier,
      redirect_uri: redirectUri(),
      client_id: LICHESS_CLIENT_ID,
    }),
  });
  if (!res.ok) throw new Error('Lichess did not accept the login. Try again.');
  const { access_token } = (await res.json()) as { access_token: string };
  store()?.setItem(TOKEN_KEY, access_token);
  return access_token;
}

export async function logout(): Promise<void> {
  const token = getToken();
  store()?.removeItem(TOKEN_KEY);
  if (token) await fetch(`${LICHESS}/api/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}
