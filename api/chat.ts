import { callGroq, chatDailyLimit, cleanMessages, json, rateLimited, requireUser, safeTz, str, userRpc } from './_lib';

export const config = { runtime: 'edge' };

function tutorPrompt(subjects: string[], focus: string, left: number) {
  return `You are Buddy, a cute, kind pixel-cat study tutor inside the "Study Buddy" app for school students.

How to help:
- Explain simply and step by step, like a patient older sister. Use small, everyday examples.
- If the request is missing something you need to give a GOOD answer (e.g. a study plan without the topics, exam date or level; "help with my homework" without the question), FIRST ask 1-2 short, friendly questions and wait. Don't guess.
- Keep replies short and friendly (usually under 200 words). The student only gets a few messages a day (${left} left after this one), so make each reply count.
- Formatting: short paragraphs, bullet or numbered lists, **bold** key terms, and "### " headings for longer answers. NEVER use tables and NEVER use HTML tags (no <br>).
- For homework, teach the method and guide them to the answer; check understanding with a quick question at the end when it fits.
- Maths/science: write formulas in plain text (e.g. x^2 + 3x = 10, H2O, P(A|B)), never LaTeX. Double-check every calculation.
- Be encouraging. If they sound stressed or sad, be warm first, then help. A cute emoji now and then is fine 🎀.
- Stay age-appropriate and on the topic of studying and wellbeing. Politely decline anything harmful.

Language: reply in the SAME language and style the student uses. English -> English. Roman Urdu / Hinglish (e.g. "mujhe samajh nahi aya") -> Roman Urdu/Hinglish. Urdu script -> Urdu script.

The student's subjects: ${subjects.length ? subjects.join(', ') : 'not set yet'}.${focus ? `\nThey are currently asking about: ${focus}.` : ''}`;
}

export default async function handler(req: Request): Promise<Response> {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const limit = chatDailyLimit();

  // GET /api/chat?tz=Asia/Karachi -> how many messages are used today
  if (req.method === 'GET') {
    const tz = safeTz(new URL(req.url).searchParams.get('tz'));
    try {
      const used = await userRpc<number>(user, 'chats_used_today', { tz });
      return json(200, { used, limit });
    } catch (e) {
      console.error(e);
      return json(500, { error: 'Couldn’t check your messages for today. Did you run supabase/006_ai_limits.sql?' });
    }
  }
  if (req.method !== 'POST') return json(405, { error: 'Use GET or POST' });
  if (rateLimited(`chat:${user.id}`)) return json(429, { error: 'Whoa, so many questions! Wait a minute and ask again 🐱' });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const tz = safeTz(body?.tz);
  const messages = cleanMessages(body?.messages);
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json(400, { error: 'Nothing to answer.' });
  const subjects = Array.isArray(body?.subjects) ? body.subjects.map((s) => str(s, 60)).filter(Boolean).slice(0, 20) : [];
  const focus = str(body?.subject, 60);

  // Daily limit — checked before calling the AI, counted only if the AI answers.
  let used: number;
  try {
    used = await userRpc<number>(user, 'chats_used_today', { tz });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'Couldn’t check your messages for today. Did you run supabase/006_ai_limits.sql?' });
  }
  if (used >= limit) {
    return json(429, {
      error: `That’s all ${limit} of today’s Buddy messages 💜 They come back tomorrow! You can still make quizzes ✨`,
      limitReached: true,
    });
  }

  const groq = await callGroq({
    messages: [{ role: 'system', content: tutorPrompt(subjects, focus, limit - used - 1) }, ...messages],
    stream: true,
    temperature: 0.5,
    max_completion_tokens: 4096,
    reasoning_effort: 'medium',
  });
  if (!groq.ok || !groq.body) return groq;

  let nowUsed = used + 1;
  try {
    nowUsed = await userRpc<number>(user, 'use_chat_credit', { tz });
  } catch (e) {
    console.error('[chat] could not count message', e);
  }

  // Pass Groq's server-sent events straight through to the browser.
  return new Response(groq.body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      'x-chats-used': String(nowUsed),
      'x-chats-limit': String(limit),
    },
  });
}
