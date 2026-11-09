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

/** Streams Buddy's reply; calls onText with each new piece of text. */
export async function streamChat(
  body: { messages: ChatMessage[]; subjects: string[]; subject: string },
  onText: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const r = await fetch('/api/chat', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body), signal });
  if (!r.ok || !r.body) throw await errorFrom(r);

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
