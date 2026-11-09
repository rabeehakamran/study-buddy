import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { useRows } from '../lib/useRows';
import type { Subject } from '../lib/types';
import { makeQuiz, type Quiz as QuizData, type QuizRequest } from '../lib/ai';
import ErrorBanner from '../components/ErrorBanner';
import PageHeader from '../components/PageHeader';
import Mascot from '../pixel/Mascot';
import PixelArt from '../pixel/PixelArt';
import { QUESTION, QUESTION_PALETTE, type Mood } from '../pixel/sprites';

type Result = {
  id: string;
  subject_name: string | null;
  topic: string | null;
  title: string | null;
  difficulty: string;
  score: number;
  total: number;
  created_at: string;
};
type Setup = QuizRequest & { subjectId: string };

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const LANG_LABEL = { english: 'English', roman: 'Hinglish / Roman Urdu', urdu: 'اردو' } as const;

export default function Quiz() {
  const { session } = useAuth();
  const prefsKey = `sb.quizprefs.${session!.user.id}`;
  const subjects = useRows<Subject>('subjects', 'position');
  const navigate = useNavigate();

  const [setup, setSetup] = useState<Setup>(() => {
    const base: Setup = { subjectId: '', subject: '', topic: '', grade: '', difficulty: 'medium', count: 5, language: 'english' };
    try {
      return { ...base, ...JSON.parse(localStorage.getItem(prefsKey) ?? '{}'), topic: '' };
    } catch {
      return base;
    }
  });
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [finished, setFinished] = useState(false);
  const [history, setHistory] = useState<Result[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    supabase
      .from('quiz_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data, error }) => (error ? setError(error.message) : setHistory((data ?? []) as Result[])));
    return () => abortRef.current?.abort();
  }, []);

  const subjectName = (id: string) => subjects.rows.find((s) => s.id === id)?.name ?? '';

  async function start(e?: FormEvent) {
    e?.preventDefault();
    const subject = setup.subjectId ? subjectName(setup.subjectId) : setup.subject;
    if (!subject.trim() && !setup.topic.trim()) return setError('Pick a subject or type a topic first.');
    try {
      localStorage.setItem(prefsKey, JSON.stringify({ ...setup, topic: '' }));
    } catch {
      /* ignore */
    }
    setError(null);
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const q = await makeQuiz({ ...setup, subject }, ctrl.signal);
      setQuiz(q);
      setIndex(0);
      setAnswers(q.questions.map(() => null));
      setFinished(false);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function choose(option: number) {
    if (answers[index] !== null) return;
    setAnswers((a) => a.map((v, i) => (i === index ? option : v)));
  }

  async function next() {
    if (!quiz) return;
    if (index < quiz.questions.length - 1) return setIndex(index + 1);
    setFinished(true);
    const score = quiz.questions.filter((q, i) => answers[i] === q.answer_index).length;
    const { data, error } = await supabase
      .from('quiz_results')
      .insert({
        subject_id: setup.subjectId || null,
        subject_name: (setup.subjectId ? subjectName(setup.subjectId) : setup.subject).slice(0, 60) || null,
        topic: setup.topic.slice(0, 120) || null,
        title: quiz.title.slice(0, 120),
        difficulty: setup.difficulty,
        score,
        total: quiz.questions.length,
      })
      .select()
      .single();
    if (error) setError(`Couldn’t save your score: ${error.message}`);
    else setHistory((h) => [data as Result, ...h].slice(0, 8));
  }

  function askBuddy(qi: number) {
    if (!quiz) return;
    const q = quiz.questions[qi];
    const mine = answers[qi];
    const prompt =
      `I got this quiz question wrong:\n\n"${q.question}"\n\n` +
      `I chose: ${mine !== null ? q.options[mine] : '(no answer)'}\n` +
      `Correct answer: ${q.options[q.answer_index]}\n\nCan you explain it simply?`;
    navigate('/tutor', { state: { prompt } });
  }

  function reset() {
    setQuiz(null);
    setFinished(false);
  }

  // ---------- Loading ----------
  if (loading) {
    return (
      <div className="card mx-auto flex max-w-lg flex-col items-center gap-4 p-10 text-center">
        <Mascot mood="focus" className="w-24" />
        <p className="font-pixel animate-twinkle text-2xl">Buddy is writing &amp; double-checking your quiz…</p>
        <p className="text-sm text-muted">Every answer gets checked twice, so this takes a little while ✏️</p>
        <button className="btn btn-ghost" onClick={() => abortRef.current?.abort()}>
          Cancel
        </button>
      </div>
    );
  }

  // ---------- Results ----------
  if (quiz && finished) {
    const score = quiz.questions.filter((q, i) => answers[i] === q.answer_index).length;
    const pct = score / quiz.questions.length;
    const mood: Mood = pct >= 0.7 ? 'happy' : pct >= 0.4 ? 'focus' : 'sad';
    const message =
      pct === 1 ? 'PERFECT SCORE! You’re a genius 🌟' : pct >= 0.7 ? 'Amazing job! 🎉' : pct >= 0.4 ? 'Good try! Practice makes perfect 💪' : 'That was a tough one. Let’s learn it together 💜';
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <ErrorBanner message={error} onClose={() => setError(null)} />
        <section className="card flex flex-col items-center gap-3 p-8 text-center">
          <Mascot mood={mood} className="w-24" />
          <div className="font-pixel text-6xl font-bold">
            {score}/{quiz.questions.length}
          </div>
          <p className="font-pixel text-xl text-primary">{message}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button className="btn btn-primary" onClick={() => start()}>
              Another quiz on this ✨
            </button>
            <button className="btn btn-ghost" onClick={reset}>
              New topic
            </button>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-xl font-bold">Review</h2>
          <ol className="space-y-4">
            {quiz.questions.map((q, i) => {
              const right = answers[i] === q.answer_index;
              return (
                <li key={i} className="bg-surface-2 p-3">
                  <p className="font-semibold">
                    {right ? '✅' : '❌'} {i + 1}. {q.question}
                  </p>
                  {!right && answers[i] !== null && <p className="mt-1 text-sm text-danger">Your answer: {q.options[answers[i]!]}</p>}
                  <p className="mt-1 text-sm">
                    Correct: <b className="text-primary">{q.options[q.answer_index]}</b>
                  </p>
                  <p className="mt-1 text-sm text-muted">{q.explanation}</p>
                  {!right && (
                    <button className="mt-2 text-sm font-semibold text-primary" onClick={() => askBuddy(i)}>
                      Ask Buddy to explain 💬
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    );
  }

  // ---------- Playing ----------
  if (quiz) {
    const q = quiz.questions[index];
    const picked = answers[index];
    const answered = picked !== null;
    const correctSoFar = quiz.questions.filter((qq, i) => answers[i] === qq.answer_index).length;
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{quiz.title}</h1>
          <button className="btn btn-ghost text-sm" onClick={() => confirm('Quit this quiz? Your answers won’t be saved.') && reset()}>
            Quit
          </button>
        </div>
        <div className="flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={quiz.questions.length} aria-valuenow={index + 1}>
          {quiz.questions.map((qq, i) => (
            <div
              key={i}
              className={`h-3 flex-1 ${
                answers[i] === null ? (i === index ? 'bg-primary-soft' : 'bg-surface-2') : answers[i] === qq.answer_index ? 'bg-emerald-400' : 'bg-danger'
              }`}
            />
          ))}
        </div>
        <p className="text-sm text-muted">
          Question {index + 1} of {quiz.questions.length} · {correctSoFar} correct so far
        </p>

        <section className="card space-y-4 p-6">
          <p className="font-pixel text-2xl leading-snug" dir="auto">
            {q.question}
          </p>
          <div className="grid gap-2">
            {q.options.map((opt, oi) => {
              const isRight = oi === q.answer_index;
              const isPicked = oi === picked;
              const style = !answered
                ? 'bg-surface-2 hover:bg-primary-soft'
                : isRight
                  ? 'bg-emerald-400 text-black'
                  : isPicked
                    ? 'bg-danger text-black'
                    : 'bg-surface-2 opacity-60';
              return (
                <button
                  key={oi}
                  onClick={() => choose(oi)}
                  disabled={answered}
                  dir="auto"
                  className={`flex items-center gap-3 p-3 text-left transition ${style}`}
                >
                  <span className="font-pixel w-6 shrink-0 text-lg">{LETTERS[oi]}</span>
                  <span className="flex-1">{opt}</span>
                  {answered && isRight && <span aria-label="correct">✓</span>}
                  {answered && isPicked && !isRight && <span aria-label="your answer, wrong">✗</span>}
                </button>
              );
            })}
          </div>

          {answered && (
            <div className="flex flex-wrap items-start gap-3 bg-primary-soft p-3" role="status">
              <Mascot mood={picked === q.answer_index ? 'happy' : 'sad'} className="w-10 shrink-0" />
              <div className="flex-1 text-sm" dir="auto">
                <p className="font-pixel text-lg">{picked === q.answer_index ? 'Correct! 🎉' : 'Not quite!'}</p>
                <p>{q.explanation}</p>
              </div>
              <button className="btn btn-primary self-center" onClick={next} autoFocus>
                {index < quiz.questions.length - 1 ? 'Next →' : 'See my score'}
              </button>
            </div>
          )}
        </section>
      </div>
    );
  }

  // ---------- Setup ----------
  return (
    <div className="space-y-6">
      <PageHeader
        title="Quiz time"
        subtitle="Buddy makes a quiz on anything you’re studying ✨"
        art={<PixelArt rows={QUESTION} palette={QUESTION_PALETTE} className="w-full" />}
      />
      <ErrorBanner message={error} onClose={() => setError(null)} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form onSubmit={start} className="card space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Subject
              <select className="input" value={setup.subjectId} onChange={(e) => setSetup({ ...setup, subjectId: e.target.value })}>
                <option value="">Other (type below)</option>
                {subjects.rows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {!setup.subjectId && (
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Subject name
                <input
                  className="input"
                  placeholder="e.g. Chemistry"
                  value={setup.subject}
                  onChange={(e) => setSetup({ ...setup, subject: e.target.value })}
                  maxLength={60}
                />
              </label>
            )}
          </div>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Topic
            <input
              className="input"
              placeholder="e.g. Chapter 3: Acids and bases (leave empty for a mix)"
              value={setup.topic}
              onChange={(e) => setSetup({ ...setup, topic: e.target.value })}
              maxLength={120}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Your class / grade (optional)
            <input
              className="input"
              placeholder="e.g. Grade 8, O Levels, Matric"
              value={setup.grade}
              onChange={(e) => setSetup({ ...setup, grade: e.target.value })}
              maxLength={40}
            />
          </label>

          <Segmented
            label="Difficulty"
            value={setup.difficulty}
            options={[
              ['easy', 'Easy 🌱'],
              ['medium', 'Medium ⭐'],
              ['hard', 'Hard 🔥'],
            ]}
            onChange={(v) => setSetup({ ...setup, difficulty: v })}
          />
          <Segmented
            label="Questions"
            value={String(setup.count) as '5' | '10'}
            options={[
              ['5', '5 quick'],
              ['10', '10 full'],
            ]}
            onChange={(v) => setSetup({ ...setup, count: Number(v) as 5 | 10 })}
          />
          <Segmented
            label="Language"
            value={setup.language}
            options={Object.entries(LANG_LABEL) as [QuizRequest['language'], string][]}
            onChange={(v) => setSetup({ ...setup, language: v })}
          />

          <button className="btn btn-primary w-full text-lg">Make my quiz ✨</button>
        </form>

        <section className="card p-4">
          <h2 className="mb-3 text-xl font-bold">Recent quizzes</h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted">No quizzes yet. Your scores will show up here!</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {history.map((r) => (
                <li key={r.id} className="flex items-center gap-2 bg-surface-2 p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.title || r.topic || r.subject_name || 'Quiz'}</div>
                    <div className="truncate text-xs text-muted">
                      {[r.subject_name, r.difficulty, new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <span className="font-pixel text-lg">
                    {r.score}/{r.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="text-sm font-semibold">
      <div className="mb-1">{label}</div>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`btn text-sm ${value === v ? 'bg-primary-soft text-primary' : 'bg-surface-2 text-muted'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
