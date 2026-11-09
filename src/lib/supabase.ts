import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

export const supabaseConfigured = Boolean(url && key);

// Placeholder values keep the import from crashing before .env is set up;
// App shows a setup screen in that case.
export const supabase = createClient(url || 'http://localhost', key || 'missing-key');
