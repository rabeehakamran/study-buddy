import { callGroq, json, rateLimited, requireUser, str } from './_lib';

export const config = { runtime: 'edge' };

type Question = { question: string; options: string[]; answer_index: number; explanation: string };

/** What the model writes. It must SOLVE first (working), then write the options. */
type Draft = { question: string; working: string; correct_answer: string; options: string[]; explanation: string };

const DRAFT_SCHEMA = {
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
        // Order matters: the model writes these in order, so it works the answer out before the options.
        required: ['question', 'working', 'correct_answer', 'options', 'explanation'],
        properties: {
          question: { type: 'string' },
          working: { type: 'string' },
          correct_answer: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          explanation: { type: 'string' },
        },
      },
    },
  },
};

const CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answers'],
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'working', 'choice', 'question_is_sound'],
        properties: {
          number: { type: 'integer' },
          working: { type: 'string' },
          choice: { type: 'string' }, // letter A-D
          question_is_sound: { type: 'boolean' },
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
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.。]$/, '').trim();
// Explanations that talk about fixing the key are a sign of a broken question.
const SUSPICIOUS = /\b(answer[_ ]index|adjusted|re-?indexed|mistake in (the )?(options|question)|should be|correct option is not listed|none of the options)\b/i;

/** Structural checks + derive answer_index by matching the solved answer to the options. */
function toQuestions(raw: unknown): { title: string; questions: Question[] } | null {
  const q = raw as { title?: unknown; questions?: unknown } | null;
  if (!q || !Array.isArray(q.questions)) return null;
  const out: Question[] = [];
  for (const d of q.questions as Partial<Draft>[]) {
    if (!d || typeof d.question !== 'string' || typeof d.correct_answer !== 'string' || typeof d.explanation !== 'string') continue;
    if (!Array.isArray(d.options) || d.options.length !== 4) continue;
    const options = d.options.map((o) => (typeof o === 'string' ? o.trim() : ''));
    if (options.some((o) => !o) || new Set(options.map(norm)).size !== 4) continue; // blanks or duplicates
    const matches = options.map((o, i) => (norm(o) === norm(d.correct_answer!) ? i : -1)).filter((i) => i >= 0);
    if (matches.length !== 1) continue; // solved answer must be exactly one option
    if (SUSPICIOUS.test(d.explanation)) continue;
    out.push({ question: d.question.trim(), options, answer_index: matches[0], explanation: d.explanation.trim() });
  }
  return { title: typeof q.title === 'string' && q.title.trim() ? q.title.trim() : 'Quiz time!', questions: out };
}

async function groqJson(messages: object[], schemaName: string, schema: object, temperature: number) {
  const formats = [{ type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } }, { type: 'json_object' }];
  let lastError: Response | null = null;
  for (const response_format of formats) {
    const r = await callGroq({ messages, response_format, temperature, max_completion_tokens: 12000, reasoning_effort: 'medium' });
    if (!r.ok) {
      lastError = r;
      if (r.status === 429 || r.status === 401 || r.status >= 500) break;
      continue;
    }
    const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    try {
      return { data: JSON.parse(data.choices?.[0]?.message?.content ?? '') as unknown };
    } catch {
      /* invalid JSON, try the next format */
    }
  }
  return { error: lastError };
}

/**
 * A second, independent pass: solve each question WITHOUT seeing the key.
 * Keeps only questions where the solver agrees with the key and finds the question sound.
 */
async function verify(questions: Question[], language: string): Promise<Question[] | null> {
  const list = questions
    .map((q, i) => `${i + 1}. ${q.question}\n${q.options.map((o, j) => `   ${LETTERS[j]}) ${o}`).join('\n')}`)
    .join('\n\n');
  const res = await groqJson(
    [
      {
        role: 'system',
        content:
          'You are a careful exam checker. Solve each multiple-choice question yourself, step by step, then pick the single correct option letter. ' +
          'Set question_is_sound to false if the question is ambiguous, self-contradictory, has no correct option, or has more than one correct option. Reply with JSON only.',
      },
      { role: 'user', content: `Questions (written in ${language}):\n\n${list}` },
    ],
    'check',
    CHECK_SCHEMA,
    0,
  );
  const answers = (res.data as { answers?: { number?: number; choice?: string; question_is_sound?: boolean }[] } | undefined)?.answers;
  if (!Array.isArray(answers)) return null; // checker unavailable
  return questions.filter((q, i) => {
    const a = answers.find((x) => x.number === i + 1);
    const letter = String(a?.choice ?? '').trim().toUpperCase().charAt(0);
    return a?.question_is_sound === true && LETTERS.indexOf(letter) === q.answer_index;
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  if (rateLimited(`quiz:${user.id}`, 6)) return json(429, { error: 'So many quizzes! Wait a minute and try again 🐱' });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const subject = str(body?.subject, 60);
  const topic = str(body?.topic, 120);
  const grade = str(body?.grade, 40);
  const difficulty = ['easy', 'medium', 'hard'].includes(String(body?.difficulty)) ? String(body?.difficulty) : 'medium';
  const count = [5, 10].includes(Number(body?.count)) ? Number(body?.count) : 5;
  const language = LANGS[String(body?.language)] ?? LANGS.english;
  if (!subject && !topic) return json(400, { error: 'Tell Buddy a subject or topic first.' });

  const extra = count + 3; // spares, because the checker may throw some out
  const prompt = `Write ${extra} ${difficulty} multiple-choice questions.
Subject: ${subject || 'general'}
Topic: ${topic || 'a mix of important topics in this subject'}
${grade ? `Student level: ${grade}` : 'Student level: school student'}
Language for title, question, options and explanation: ${language}

For EACH question, in this order:
1. question: clear and unambiguous, with all numbers needed. Only ONE answer can be correct.
2. working: solve it yourself step by step (double-check any arithmetic).
3. correct_answer: the final answer from your working, written exactly as it will appear in the options.
4. options: exactly 4 different options. One is EXACTLY correct_answer; the other 3 are believable mistakes students make. Put the correct one in a random position.
5. explanation: 1-2 short, friendly sentences that agree with your working.
If you notice a question is flawed, replace it with a different question. Never mention corrections.

Rules: facts must be accurate; no trick questions; no "all/none of the above"; no markdown or LaTeX (write x^2 for powers, P(A|B) for conditional probability).
title: short and cute, max 6 words.`;

  const gen = await groqJson(
    [
      { role: 'system', content: 'You are Buddy, a friendly, very careful tutor who writes accurate school quizzes. Reply with JSON only.' },
      { role: 'user', content: prompt },
    ],
    'quiz',
    DRAFT_SCHEMA,
    0.6,
  );
  if (!gen.data) return gen.error ?? json(502, { error: 'Buddy got confused making that quiz. Try again 🐱' });
  const draft = toQuestions(gen.data);
  if (!draft || draft.questions.length < 3) {
    return json(502, { error: 'Buddy got confused making that quiz. Try again, or change the topic a little.' });
  }

  const checked = await verify(draft.questions, language);
  const questions = (checked ?? draft.questions).slice(0, count);
  if (questions.length < Math.min(3, count)) {
    return json(502, { error: 'Buddy wasn’t sure enough about those questions. Try again, or make the topic a bit more specific.' });
  }
  return json(200, { title: draft.title, questions, verified: checked !== null });
}
