// Public connection details. The publishable key is meant to ship in the browser:
// row level security in the database decides what it can read, and it cannot write anything.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://axpcobcbzetbcyvuugah.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_PLCSvm_nDzQKsD1OkzxfwQ_dpjl8f7y';
export const API_URL = `${SUPABASE_URL}/functions/v1/match-api`;
export const LICHESS = 'https://lichess.org';
export const LICHESS_CLIENT_ID = 'shadowbook';
