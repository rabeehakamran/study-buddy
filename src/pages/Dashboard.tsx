import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useRows } from '../lib/useRows';
import { DAYS, type Slot, type Subject, type Task } from '../lib/types';
import { daysFromToday, fmtTime, sortTasks, todayIndex } from '../lib/format';
import { displayName, useAuth } from '../auth/AuthProvider';
import ErrorBanner from '../components/ErrorBanner';
import { TaskRow } from './Subjects';
import Mascot from '../pixel/Mascot';
import PixelScene from '../pixel/PixelScene';
import PixelArt from '../pixel/PixelArt';
import { FLAME, FLAME_OFF_PALETTE, FLAME_PALETTE } from '../pixel/sprites';
import { useDailyTotals } from '../lib/stats';
import { quoteOfTheDay } from '../lib/quotes';

export default function Dashboard() {
  const { session } = useAuth();
  const subjects = useRows<Subject>('subjects', 'position');
  const slots = useRows<Slot>('timetable_slots', 'start_time');
  const tasks = useRows<Task>('tasks', 'created_at');
  const [error, setError] = useState<string | null>(null);
  const [quoteOffset, setQuoteOffset] = useState(0);
  const { streaks } = useDailyTotals(400);

  const today = todayIndex();
  const subjectById = new Map(subjects.rows.map((s) => [s.id, s]));
  const todaysSlots = slots.rows.filter((s) => s.day_of_week === today && subjectById.has(s.subject_id));

  const open = tasks.rows.filter((t) => !t.done && t.due_date);
  const dueNow = sortTasks(open.filter((t) => daysFromToday(t.due_date!) <= 0));
  const upcoming = sortTasks(open.filter((t) => {
    const d = daysFromToday(t.due_date!);
    return d > 0 && d <= 7;
  }));

  async function toggle(t: Task) {
    const { error } = await supabase.from('tasks').update({ done: !t.done }).eq('id', t.id);
    if (error) return setError(error.message);
    tasks.setRows((r) => r.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)));
  }

  if (subjects.loading || slots.loading || tasks.loading) return <p className="text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-6 px-6 pt-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold sm:text-4xl">Hi {displayName(session)}!</h1>
            <p className="text-muted">Happy {DAYS[today]}! Here's your day.</p>
          </div>
          <Link
            to="/progress"
            className="flex items-center gap-2 bg-surface-2 px-3 py-2 hover:bg-primary-soft"
            aria-label={`${streaks.current} day streak. See progress`}
          >
            <PixelArt rows={FLAME} palette={streaks.current > 0 ? FLAME_PALETTE : FLAME_OFF_PALETTE} className="w-6" />
            <span className="font-pixel text-2xl font-bold">{streaks.current}</span>
            <span className="text-xs text-muted">
              day
              <br />
              streak
            </span>
          </Link>
          <Link to="/focus" className="btn btn-primary text-lg">
            Start a pomodoro ▶
          </Link>
        </div>

        {/* Buddy's affirmation of the day */}
        <div className="flex items-end gap-3 px-6 pt-5">
          <Mascot mood="happy" className="w-16 shrink-0 sm:w-20" />
          <figure className="relative mb-6 max-w-xl bg-primary-soft px-4 py-3">
            {/* pixel speech-bubble tail */}
            <span className="absolute -left-2 bottom-3 h-2 w-2 bg-primary-soft" aria-hidden />
            <span className="absolute -left-4 bottom-1 h-2 w-2 bg-primary-soft" aria-hidden />
            <blockquote className="font-pixel text-lg leading-snug">{quoteOfTheDay(quoteOffset)}</blockquote>
            <figcaption className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
              <span>Buddy, {quoteOffset === 0 ? 'today’s note for you' : 'one more for you'}</span>
              <button className="font-semibold text-primary" onClick={() => setQuoteOffset((n) => n + 1)}>
                another one ✨
              </button>
            </figcaption>
          </figure>
        </div>
        <PixelScene />
      </section>

      <ErrorBanner message={error ?? subjects.error ?? slots.error ?? tasks.error} onClose={() => setError(null)} />

      {subjects.rows.length === 0 && (
        <div className="card p-6 text-center">
          <p className="mb-3">Let's get you set up! Start by adding your subjects.</p>
          <Link to="/subjects" className="btn btn-primary">
            Add subjects
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 font-bold">Today's timetable</h2>
          {todaysSlots.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing planned for today.{' '}
              <Link to="/timetable" className="font-semibold text-primary">
                Plan your week
              </Link>
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {todaysSlots.map((slot) => {
                const s = subjectById.get(slot.subject_id)!;
                return (
                  <li key={slot.id} className="flex items-center gap-3 bg-surface-2 p-2">
                    <span className="h-8 w-1.5" style={{ background: s.color }} />
                    <span className="w-36 shrink-0 text-sm font-semibold">
                      {fmtTime(slot.start_time)}–{fmtTime(slot.end_time)}
                    </span>
                    <span className="text-sm">
                      <span className="font-semibold">{s.name}</span>
                      {slot.note && <span className="text-muted"> · {slot.note}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 font-bold">Due today &amp; overdue</h2>
          {dueNow.length === 0 ? (
            <p className="text-sm text-muted">All clear 🎉</p>
          ) : (
            <ul>
              {dueNow.map((t) => (
                <TaskRow key={t.id} task={t} subject={subjectById.get(t.subject_id)} onToggle={() => toggle(t)} />
              ))}
            </ul>
          )}

          <h2 className="mb-3 mt-5 font-bold">Coming up this week</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">Nothing due in the next 7 days.</p>
          ) : (
            <ul>
              {upcoming.map((t) => (
                <TaskRow key={t.id} task={t} subject={subjectById.get(t.subject_id)} onToggle={() => toggle(t)} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
