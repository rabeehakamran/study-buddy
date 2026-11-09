import { callGroq, json, rateLimited, requireUser, str } from './_lib';

export const config = { runtime: 'edge' };

type Question = { question: string; options: string[]; answer_index: number; explanation: string };
type Quiz = { title: string; questions: Question[] };

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'questions'],
  properties: {
    title: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'options', 'answer_index', 'explanation'],
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answer_index: { type: 'integer' },
          explanation: { type: 'string' },
        },
      },
    },
  },
};

const LANGS: Record<string, string> = {
  english: 'English',
  roman: 'Roman Urdu / Hinglish (Urdu written in English letters, like "Is ka jawab kya hai?")',
  urdu: 'Urdu script',
};

function validate(raw: unknown, count: number): Quiz | null {
  const q = raw as Partial<Quiz> | null;
  if (!q || !Array.isArray(q.questions)) return null;
  const questions = q.questions
    .filter(
      (x): x is Question =>
        !!x &&
        typeof x.question === 'string' &&
        Array.isArray(x.options) &&
        x.options.length >= 2 &&
        x.options.length <= 6 &&
        x.options.every((o) => typeof o === 'string' && o.trim() !== '') &&
        Number.isInteger(x.answer_index) &&
        x.answer_index >= 0 &&
        x.answer_index < x.options.length &&
        typeof x.explanation === 'string',
    )
    .slice(0, count);
  if (questions.length < Math.min(3, count)) return null;
  return { title: typeof q.title === 'string' && q.title.trim() ? q.title.trim() : 'Quiz time!', questions };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  if (rateLimited(user.id, 8)) return json(429, { error: 'So many quizzes! Wait a minute and try again 🐱' });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const subject = str(body?.subject, 60);
  const topic = str(body?.topic, 120);
  const grade = str(body?.grade, 40);
  const difficulty = ['easy', 'medium', 'hard'].includes(String(body?.difficulty)) ? String(body?.difficulty) : 'medium';
  const count = [5, 10].includes(Number(body?.count)) ? Number(body?.count) : 5;
  const language = LANGS[String(body?.language)] ?? LANGS.english;
  if (!subject && !topic) return json(400, { error: 'Tell Buddy a subject or topic first.' });

  const prompt = `Make a ${difficulty} multiple-choice quiz with exactly ${count} questions.
Subject: ${subject || 'general'}
Topic: ${topic || 'a mix of important topics in this subject'}
${grade ? `Student level: ${grade}` : 'Student level: school student'}
Language for ALL text (title, questions, options, explanations): ${language}

Rules:
- Each question has exactly 4 options, only ONE correct. answer_index is the 0-based index of the correct option.
- Vary which position holds the correct answer.
- Facts must be accurate. Avoid trick questions and "all of the above".
- explanation: 1-2 short, friendly sentences saying why the answer is right.
- title: short and cute, max 6 words.
- Plain text only (no markdown, no LaTeX; write x^2 for powers).`;

  const messages = [
    { role: 'system', content: 'You are Buddy, a friendly tutor who writes accurate school quizzes. Reply with JSON only.' },
    { role: 'user', content: prompt },
  ];

  // Try strict JSON schema first, then plain JSON mode as a fallback.
  const formats = [
    { type: 'json_schema', json_schema: { name: 'quiz', strict: true, schema: SCHEMA } },
    { type: 'json_object' },
  ];
  let lastError: Response | null = null;
  for (const response_format of formats) {
    const r = await callGroq({ messages, response_format, temperature: 0.7, max_completion_tokens: 6000, reasoning_effort: 'low' });
    if (!r.ok) {
      lastError = r;
      if (r.status === 429 || r.status === 401) break;
      continue;
    }
    const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    try {
      const quiz = validate(JSON.parse(data.choices?.[0]?.message?.content ?? ''), count);
      if (quiz) return json(200, quiz);
    } catch {
      /* invalid JSON, try next format */
    }
  }
  return lastError ?? json(502, { error: 'Buddy got confused making that quiz. Try again, or change the topic a little.' });
}
