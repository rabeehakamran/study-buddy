import { supabase } from './supabase';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type QuizQuestion = { question: string; options: string[]; answer_index: number; explanation: string };
export type Quiz = { title: string; questions: QuizQuestion[] };
export type QuizRequest = {
  subject: string;
  topic: string;
  grade: string;
  difficulty: 'easy' | 'medium' | 'hard';
  count: 5 | 10;
  language: 'english' | 'roman' | 'urdu';
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return {
    'content-type': 'application/json',
    ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
  };
}

async function errorFrom(r: Response): Promise<Error> {
  const body = (await r.json().catch(() => null)) as { error?: string } | null;
  if (r.status === 404) return new Error('The AI server isn’t running. Restart `npm run dev` (or check the Vercel deploy).');
  return new Error(body?.error ?? `Buddy couldn’t answer (error ${r.status}).`);
}

export type ChatUsage = { used: number; limit: number };

/** Thrown when today's Ask Buddy messages are used up. */
export class LimitReachedError extends Error {}

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export async function getChatUsage(): Promise<ChatUsage> {
  const r = await fetch(`/api/chat?tz=${encodeURIComponent(tz())}`, { headers: await authHeaders() });
  if (!r.ok) throw await errorFrom(r);
  return (await r.json()) as ChatUsage;
}

/** Streams Buddy's reply; calls onText with each new piece of text. */
export async function streamChat(
  body: { messages: ChatMessage[]; subjects: string[]; subject: string },
  onText: (chunk: string) => void,
  signal?: AbortSignal,
  onUsage?: (u: ChatUsage) => void,
): Promise<void> {
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ ...body, tz: tz() }),
    signal,
  });
  if (r.status === 429) {
    const b = (await r.clone().json().catch(() => null)) as { error?: string; limitReached?: boolean } | null;
    if (b?.limitReached) throw new LimitReachedError(b.error ?? 'No Buddy messages left today.');
  }
  if (!r.ok || !r.body) throw await errorFrom(r);
  const used = Number(r.headers.get('x-chats-used'));
  const limit = Number(r.headers.get('x-chats-limit'));
  if (used && limit) onUsage?.({ used, limit });

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const data = line.trim().startsWith('data:') ? line.trim().slice(5).trim() : null;
      if (!data) continue;
      if (data === '[DONE]') return;
      try {
        const evt = JSON.parse(data) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
        if (evt.error) throw new Error(evt.error.message ?? 'Buddy got interrupted.');
        const text = evt.choices?.[0]?.delta?.content; // ignore the model's hidden "reasoning" deltas
        if (text) onText(text);
      } catch (e) {
        if (e instanceof SyntaxError) continue; // partial line
        throw e;
      }
    }
  }
}

export async function makeQuiz(req: QuizRequest, signal?: AbortSignal): Promise<Quiz> {
  const r = await fetch('/api/quiz', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(req), signal });
  if (!r.ok) throw await errorFrom(r);
  return (await r.json()) as Quiz;
}
