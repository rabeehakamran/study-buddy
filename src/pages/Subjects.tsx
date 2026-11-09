import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useRows } from '../lib/useRows';
import { SUBJECT_COLORS, type Subject, type Task } from '../lib/types';
import { daysFromToday, fmtDue, sortTasks } from '../lib/format';
import ErrorBanner from '../components/ErrorBanner';
import ColorPicker from '../components/ColorPicker';

export default function Subjects() {
  const subjects = useRows<Subject>('subjects', 'position');
  const tasks = useRows<Task>('tasks', 'created_at');
  const [error, setError] = useState<string | null>(null);

  async function addSubject(name: string, color: string) {
    const position = subjects.rows.reduce((m, s) => Math.max(m, s.position), -1) + 1;
    const { data, error } = await supabase.from('subjects').insert({ name, color, position }).select().single();
    if (error) return setError(error.message);
    subjects.setRows((r) => [...r, data as Subject]);
  }

  async function updateSubject(id: string, patch: Partial<Pick<Subject, 'name' | 'color'>>) {
    const { error } = await supabase.from('subjects').update(patch).eq('id', id);
    if (error) return setError(error.message);
    subjects.setRows((r) => r.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function deleteSubject(s: Subject) {
    const n = tasks.rows.filter((t) => t.subject_id === s.id).length;
    if (!confirm(`Delete "${s.name}"? This also deletes its ${n} task(s) and its timetable slots.`)) return;
    const { error } = await supabase.from('subjects').delete().eq('id', s.id);
    if (error) return setError(error.message);
    subjects.setRows((r) => r.filter((x) => x.id !== s.id));
    tasks.setRows((r) => r.filter((t) => t.subject_id !== s.id));
  }

  async function addTask(subject_id: string, title: string, due_date: string | null) {
    const { data, error } = await supabase.from('tasks').insert({ subject_id, title, due_date }).select().single();
    if (error) return setError(error.message);
    tasks.setRows((r) => [...r, data as Task]);
  }

  async function toggleTask(t: Task) {
    const { error } = await supabase.from('tasks').update({ done: !t.done }).eq('id', t.id);
    if (error) return setError(error.message);
    tasks.setRows((r) => r.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)));
  }

  async function deleteTask(id: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) return setError(error.message);
    tasks.setRows((r) => r.filter((x) => x.id !== id));
  }

  const loading = subjects.loading || tasks.loading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Subjects</h1>
        <p className="text-sm text-muted">Add your subjects, then the tasks for each one.</p>
      </div>

      <ErrorBanner message={error ?? subjects.error ?? tasks.error} onClose={() => setError(null)} />

      <AddSubjectForm onAdd={addSubject} />

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : subjects.rows.length === 0 ? (
        <p className="card p-8 text-center text-muted">No subjects yet. Add your first one above ✨</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {subjects.rows.map((s) => (
            <SubjectCard
              key={s.id}
              subject={s}
              tasks={tasks.rows.filter((t) => t.subject_id === s.id)}
              onUpdate={(patch) => updateSubject(s.id, patch)}
              onDelete={() => deleteSubject(s)}
              onAddTask={(title, due) => addTask(s.id, title, due)}
              onToggleTask={toggleTask}
              onDeleteTask={deleteTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AddSubjectForm({ onAdd }: { onAdd: (name: string, color: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onAdd(name.trim(), color);
    setName('');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card flex flex-wrap items-center gap-3 p-4">
      <input
        className="input flex-1"
        placeholder="New subject, e.g. Maths"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        aria-label="Subject name"
      />
      <ColorPicker value={color} onChange={setColor} />
      <button className="btn btn-primary" disabled={busy || !name.trim()}>
        Add subject
      </button>
    </form>
  );
}

type CardProps = {
  subject: Subject;
  tasks: Task[];
  onUpdate: (patch: Partial<Pick<Subject, 'name' | 'color'>>) => void;
  onDelete: () => void;
  onAddTask: (title: string, due: string | null) => Promise<void>;
  onToggleTask: (t: Task) => void;
  onDeleteTask: (id: string) => void;
};

function SubjectCard({ subject, tasks, onUpdate, onDelete, onAddTask, onToggleTask, onDeleteTask }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(subject.name);
  const [color, setColor] = useState(subject.color);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  const doneCount = tasks.filter((t) => t.done).length;

  function saveEdit() {
    if (name.trim()) onUpdate({ name: name.trim(), color });
    setEditing(false);
  }

  async function submitTask(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await onAddTask(title.trim(), due || null);
    setTitle('');
    setDue('');
  }

  return (
    <section className="card overflow-hidden">
      <div className="h-2" style={{ background: subject.color }} />
      <div className="p-4">
        {editing ? (
          <div className="mb-3 flex flex-col gap-3">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Subject name" />
            <ColorPicker value={color} onChange={setColor} />
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={saveEdit}>
                Save
              </button>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="btn btn-danger ml-auto" onClick={onDelete}>
                Delete subject
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-bold">{subject.name}</h2>
            <span className="text-xs text-muted">
              {doneCount}/{tasks.length} done
            </span>
            <button className="btn btn-ghost ml-auto px-2 py-1 text-xs" onClick={() => setEditing(true)}>
              Edit
            </button>
          </div>
        )}

        <ul className="flex flex-col">
          {sortTasks(tasks).map((t) => (
            <TaskRow key={t.id} task={t} onToggle={() => onToggleTask(t)} onDelete={() => onDeleteTask(t.id)} />
          ))}
          {tasks.length === 0 && <li className="py-2 text-sm text-muted">No tasks yet.</li>}
        </ul>

        <form onSubmit={submitTask} className="mt-3 flex flex-wrap gap-2">
          <input
            className="input flex-1"
            placeholder="Add a task…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            aria-label="Task title"
          />
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date (optional)" />
          <button className="btn btn-primary" disabled={!title.trim()}>
            Add
          </button>
        </form>
      </div>
    </section>
  );
}

export function TaskRow({ task, onToggle, onDelete, subject }: { task: Task; onToggle: () => void; onDelete?: () => void; subject?: Subject }) {
  const overdue = !task.done && task.due_date !== null && daysFromToday(task.due_date) < 0;
  return (
    <li className="group flex items-center gap-3 border-b border-line py-2 last:border-0">
      <input type="checkbox" checked={task.done} onChange={onToggle} className="h-4 w-4 accent-primary" aria-label={`Mark "${task.title}" done`} />
      <span className={`flex-1 text-sm ${task.done ? 'text-muted line-through' : ''}`}>{task.title}</span>
      {subject && (
        <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: subject.color }}>
          {subject.name}
        </span>
      )}
      {task.due_date && (
        <span className={`text-xs ${overdue ? 'font-semibold text-danger' : 'text-muted'}`}>{fmtDue(task.due_date)}</span>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className="text-muted opacity-60 hover:text-danger group-hover:opacity-100"
          aria-label={`Delete "${task.title}"`}
        >
          ×
        </button>
      )}
    </li>
  );
}
