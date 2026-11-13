// Writes supabase/dist/match-api.ts: the Edge Function as one file, for pasting into the
// Supabase dashboard editor. (With the Supabase CLI, deploy supabase/functions/match-api directly.)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, '..', 'supabase', 'functions', 'match-api');
const helpers = readFileSync(join(dir, 'broadcast.ts'), 'utf8');
const entry = readFileSync(join(dir, 'index.ts'), 'utf8').replace(/^import .* from '\.\/broadcast\.ts';\n/m, '');
const [head, ...rest] = entry.split(/\n(?=const db = )/);
const out = `${head}\n\n// ---- broadcast.ts ----\n${helpers}\n// ---- index.ts ----\n${rest.join('\n')}`;
mkdirSync(join(dir, '..', '..', 'dist'), { recursive: true });
writeFileSync(join(dir, '..', '..', 'dist', 'match-api.ts'), out);
console.log('Wrote supabase/dist/match-api.ts');
