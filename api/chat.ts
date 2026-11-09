import { callGroq, cleanMessages, json, rateLimited, requireUser, str } from './_lib';

export const config = { runtime: 'edge' };

function tutorPrompt(subjects: string[], focus: string) {
  return `You are Buddy, a cute, kind pixel-cat study tutor inside the "Study Buddy" app for school students.

How to help:
- Explain simply and step by step, like a patient older sister. Use small, everyday examples.
- Keep replies short and friendly (usually under 200 words). Use markdown: short paragraphs, bullet points, **bold** key terms.
- For homework, teach the method and guide them to the answer; check understanding with a quick question at the end when it fits.
- Maths/science: write formulas in plain text (e.g. x^2 + 3x = 10, H2O), never LaTeX.
- Be encouraging. If they sound stressed or sad, be warm first, then help. A cute emoji now and then is fine 🎀.
- Stay age-appropriate and on the topic of studying and wellbeing. Politely decline anything harmful.

Language: reply in the SAME language and style the student uses. English -> English. Roman Urdu / Hinglish (e.g. "mujhe samajh nahi aya") -> Roman Urdu/Hinglish. Urdu script -> Urdu script.

The student's subjects: ${subjects.length ? subjects.join(', ') : 'not set yet'}.${focus ? `\nThey are currently asking about: ${focus}.` : ''}`;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  if (rateLimited(user.id)) return json(429, { error: 'Whoa, so many questions! Wait a minute and ask again 🐱' });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const messages = cleanMessages(body?.messages);
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json(400, { error: 'Nothing to answer.' });
  const subjects = Array.isArray(body?.subjects) ? body.subjects.map((s) => str(s, 60)).filter(Boolean).slice(0, 20) : [];
  const focus = str(body?.subject, 60);

  const groq = await callGroq({
    messages: [{ role: 'system', content: tutorPrompt(subjects, focus) }, ...messages],
    stream: true,
    temperature: 0.6,
    max_completion_tokens: 2048,
    reasoning_effort: 'low',
  });
  if (!groq.ok || !groq.body) return groq;

  // Pass Groq's server-sent events straight through to the browser.
  return new Response(groq.body, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
  });
}
