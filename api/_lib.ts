/**
 * Shared server helpers for the AI endpoints (runs on Vercel Edge, and inside the
 * Vite dev server locally). The Groq key only ever lives here, never in the browser.
 */
// GROQ_BASE_URL is only for testing against a fake server; normally leave it unset.
const groqUrl = () => `${process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'}/chat/completions`;

// Llama 3.x on Groq was shut down 2026-08-16; gpt-oss is the current production family.
function models(): string[] {
  return [...new Set([process.env.GROQ_MODEL || 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'])];
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Only signed-in Study Buddy users may use the AI (protects your free Groq quota). */
export type User = { id: string; token: string };

const supabaseEnv = () => ({
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  key: process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_KEY,
});

export async function requireUser(req: Request): Promise<User | Response> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const { url, key } = supabaseEnv();
  if (!url || !key) return json(500, { error: 'Server is missing the Supabase settings.' });
  if (!token) return json(401, { error: 'Please sign in again.' });
  const r = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: key } });
  if (!r.ok) return json(401, { error: 'Please sign in again.' });
  const user = (await r.json()) as { id?: string };
  return user.id ? { id: user.id, token } : json(401, { error: 'Please sign in again.' });
}

/** Call a Supabase SQL function as the signed-in user (row security applies). */
export async function userRpc<T>(user: User, fn: string, args: Record<string, unknown>): Promise<T> {
  const { url, key } = supabaseEnv();
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.token}`, apikey: key!, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn} failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

/** Daily "Ask Buddy" messages per user. Change with the CHAT_DAILY_LIMIT env var. */
export const chatDailyLimit = () => {
  const n = Number(process.env.CHAT_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
};

/** The user's time zone (for "per day"), falling back to UTC if it's missing or odd. */
export const safeTz = (v: unknown) => (typeof v === 'string' && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(v) ? v : 'UTC');

// Best-effort per-user limit (each server instance keeps its own memory).
const hits = new Map<string, number[]>();
export function rateLimited(userId: string, perMinute = 15): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > perMinute;
}

/** POST to Groq, falling back to the next model if one is unavailable. */
export async function callGroq(body: Record<string, unknown>): Promise<Response> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return json(500, { error: 'GROQ_API_KEY is not set on the server. See README.' });

  let last: Response | null = null;
  for (const model of models()) {
    const r = await fetch(groqUrl(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, model }),
    });
    if (r.ok) return r;
    const text = await r.text();
    console.error(`[groq] ${model} -> ${r.status}: ${text.slice(0, 300)}`);
    last = friendlyError(r.status, text);
    const modelProblem = (r.status === 404 || r.status === 400) && /model/i.test(text);
    if (!modelProblem) break;
  }
  return last!;
}

function friendlyError(status: number, text: string): Response {
  if (status === 429) return json(429, { error: 'Buddy needs a tiny break (free AI limit reached). Try again in a minute 🐱' });
  if (status === 401) return json(500, { error: 'The Groq API key on the server is wrong or expired.' });
  if (status === 413) return json(413, { error: 'That message is too long for Buddy. Try a shorter one.' });
  return json(502, { error: `Buddy couldn’t reach the AI right now (${status}).`, detail: text.slice(0, 200) });
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function cleanMessages(input: unknown, max = 20, maxChars = 4000): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (m): m is ChatMessage =>
        !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim() !== '',
    )
    .slice(-max)
    .map((m) => ({ role: m.role, content: m.content.slice(0, maxChars) }));
}

export const str = (v: unknown, maxLen: number, fallback = '') =>
  typeof v === 'string' ? v.trim().slice(0, maxLen) : fallback;
