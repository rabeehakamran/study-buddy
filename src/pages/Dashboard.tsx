import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useRows } from '../lib/useRows';
import { DAYS, type Slot, type Subject, type Task } from '../lib/types';
import { daysFromToday, fmtTime, sortTasks, todayIndex } from '../lib/format';
import { displayName, useAuth } from '../auth/AuthProvider';
import ErrorBanner from '../components/ErrorBanner';
import { TaskRow } from './Subjects';

export default function Dashboard() {
  const { session } = useAuth();
  const subjects = useRows<Subject>('subjects', 'position');
  const slots = useRows<Slot>('timetable_slots', 'start_time');
  const tasks = useRows<Task>('tasks', 'created_at');
  const [error, setError] = useState<string | null>(null);

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
      <div>
        <h1 className="text-2xl font-bold">Hi {displayName(session)} 👋</h1>
        <p className="text-sm text-muted">Happy {DAYS[today]}! Here's your day.</p>
      </div>

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
                  <li key={slot.id} className="flex items-center gap-3 rounded-xl p-2" style={{ background: `${s.color}55` }}>
                    <span className="h-8 w-1.5 rounded-full" style={{ background: s.color }} />
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
