import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useRows } from '../lib/useRows';
import { useAuth } from '../auth/AuthProvider';
import type { Mode, Settings } from '../lib/usePomodoro';
import type { PresenceEvent, Subject, Task } from '../lib/types';
import { fmtTime } from '../lib/format';
import { MODE_LABEL, fmtClock, useFocus } from '../focus/FocusProvider';
import { loadProfile } from '../presence/faceStore';
import { statusInfo } from '../presence/statusInfo';
import ErrorBanner from '../components/ErrorBanner';
import Mascot from '../pixel/Mascot';
import PixelArt from '../pixel/PixelArt';
import { HEART, HEART_EMPTY_PALETTE, HEART_PALETTE, HOURGLASS, HOURGLASS_PALETTE, type Mood } from '../pixel/sprites';
import PageHeader from '../components/PageHeader';

const SEGMENTS = 20;

function fmtMinutes(seconds: number) {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

const clockOf = (iso: string | number) => fmtTime(new Date(iso).toTimeString().slice(0, 5));

export default function Focus() {
  const { pomo, today, events, error, clearError, justDone, clearJustDone, camera } = useFocus();
  const { state, settings, remainingMs } = pomo;
  const subjects = useRows<Subject>('subjects', 'position');
  const tasks = useRows<Task>('tasks', 'created_at');
  const [localError, setLocalError] = useState<string | null>(null);

  // Forget a chosen subject/task that has since been deleted.
  useEffect(() => {
    if (subjects.loading || tasks.loading) return;
    const subjectOk = !state.subjectId || subjects.rows.some((s) => s.id === state.subjectId);
    const taskOk = !state.taskId || tasks.rows.some((t) => t.id === state.taskId);
    if (!subjectOk || !taskOk) pomo.setTarget(subjectOk ? state.subjectId : null, null);
  }, [subjects.loading, tasks.loading, subjects.rows, tasks.rows]); // only when data changes

  async function markTaskDone(taskId: string) {
    const { error } = await supabase.from('tasks').update({ done: true }).eq('id', taskId);
    if (error) return setLocalError(error.message);
    tasks.setRows((r) => r.map((t) => (t.id === taskId ? { ...t, done: true } : t)));
    clearJustDone();
  }

  const isFocus = state.mode === 'focus';
  const away = camera.on && camera.status === 'away';
  const mood: Mood =
    state.status === 'paused' || away ? 'sad' : state.status === 'running' ? (isFocus ? 'focus' : 'sleep') : 'happy';
  const caption = away
    ? 'I can’t see you! Look at the camera to carry on.'
    : state.status === 'paused'
      ? 'Paused… come back soon!'
      : state.status === 'running'
        ? isFocus
          ? 'Focus time. You got this!'
          : 'Break! Stretch & drink some water 💧'
        : isFocus
          ? 'Ready when you are!'
          : 'Time for a break?';

  const progress = state.totalMs ? 1 - remainingMs / state.totalMs : 0;
  const filled = Math.floor(progress * SEGMENTS);
  const hearts = state.mode === 'long' ? settings.longEvery : state.cycle % settings.longEvery;

  const subjectById = new Map(subjects.rows.map((s) => [s.id, s]));
  const openTasks = tasks.rows.filter((t) => t.subject_id === state.subjectId && !t.done);
  const doneTask = justDone?.taskId ? tasks.rows.find((t) => t.id === justDone.taskId && !t.done) : undefined;

  const completedToday = today.filter((s) => s.completed).length;
  const secondsToday = today.reduce((sum, s) => sum + s.focus_seconds, 0);
  const locked = state.status !== 'idle';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Focus"
        subtitle="Pick a subject, start the timer, and Buddy will keep you company."
        art={<PixelArt rows={HOURGLASS} palette={HOURGLASS_PALETTE} className="mx-auto w-3/4" />}
      />

      <ErrorBanner
        message={localError ?? error ?? subjects.error ?? tasks.error}
        onClose={() => {
          setLocalError(null);
          clearError();
        }}
      />

      {justDone && (
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <span className="font-pixel text-lg">🎉 Pomodoro done! +{Math.round(justDone.focusSeconds / 60)} min</span>
          {doneTask && (
            <button className="btn btn-primary" onClick={() => markTaskDone(doneTask.id)}>
              Mark “{doneTask.title}” done
            </button>
          )}
          <button className="btn btn-ghost ml-auto" onClick={clearJustDone}>
            Close
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ---------- Timer ---------- */}
        <section className="card flex flex-col items-center gap-5 p-6">
          <div className="flex flex-wrap justify-center gap-1" role="tablist" aria-label="Timer mode">
            {(['focus', 'short', 'long'] as Mode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={state.mode === m}
                disabled={locked && state.mode !== m}
                onClick={() => pomo.setMode(m)}
                className={`btn px-2.5 text-sm sm:px-4 sm:text-base ${state.mode === m ? 'bg-primary-soft text-primary' : 'btn-ghost'}`}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          <Mascot mood={mood} className="w-28 sm:w-32" />
          <p className="text-center text-sm text-muted" aria-live="polite">
            {caption}
          </p>

          <div className="font-pixel text-7xl font-bold tabular-nums sm:text-8xl">{fmtClock(remainingMs)}</div>

          <div
            className="flex w-full max-w-md gap-1"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <div key={i} className={`h-3 flex-1 ${i < filled ? (isFocus ? 'bg-accent' : 'bg-primary') : 'bg-surface-2'}`} />
            ))}
          </div>

          <div className="flex items-center gap-2" aria-label={`${hearts} of ${settings.longEvery} pomodoros until a long break`}>
            {Array.from({ length: settings.longEvery }, (_, i) => (
              <PixelArt key={i} rows={HEART} palette={i < hearts ? HEART_PALETTE : HEART_EMPTY_PALETTE} className="w-6" />
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {state.status === 'running' ? (
              <button className="btn btn-primary min-w-32 text-lg" onClick={() => pomo.pause()}>
                Pause
              </button>
            ) : (
              <button className="btn btn-primary min-w-32 text-lg" onClick={pomo.start}>
                {state.status === 'paused' ? 'Resume' : isFocus ? 'Start focus' : 'Start break'}
              </button>
            )}
            {isFocus && state.status !== 'idle' && (
              <button className="btn btn-ghost" onClick={pomo.stop}>
                End session
              </button>
            )}
            {!isFocus && (
              <button className="btn btn-ghost" onClick={pomo.stop}>
                Skip break
              </button>
            )}
          </div>

          <div className="grid w-full max-w-md gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Subject
              <select
                className="input"
                value={state.subjectId ?? ''}
                disabled={locked}
                onChange={(e) => pomo.setTarget(e.target.value || null, null)}
              >
                <option value="">No subject</option>
                {subjects.rows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Task (optional)
              <select
                className="input"
                value={state.taskId ?? ''}
                disabled={locked || !state.subjectId}
                onChange={(e) => pomo.setTarget(state.subjectId, e.target.value || null)}
              >
                <option value="">No task</option>
                {openTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* ---------- Side column ---------- */}
        <div className="flex flex-col gap-6">
          <CameraCard />

          <section className="card p-4">
            <h2 className="mb-3 text-xl font-bold">Today</h2>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="bg-surface-2 p-3 text-center">
                <div className="font-pixel text-3xl font-bold text-primary">{completedToday}</div>
                <div className="text-xs text-muted">pomodoros</div>
              </div>
              <div className="bg-surface-2 p-3 text-center">
                <div className="font-pixel text-3xl font-bold text-primary">{fmtMinutes(secondsToday)}</div>
                <div className="text-xs text-muted">focused</div>
              </div>
            </div>
            {today.length === 0 ? (
              <p className="text-sm text-muted">No sessions yet today. Your first one is the hardest!</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {today.map((s) => {
                  const subj = s.subject_id ? subjectById.get(s.subject_id) : undefined;
                  return (
                    <li key={s.id} className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0" style={{ background: subj?.color ?? 'var(--color-line)' }} />
                      <span className="w-16 shrink-0 text-muted">{clockOf(s.started_at)}</span>
                      <span className="flex-1 truncate">{subj?.name ?? 'No subject'}</span>
                      <span className="font-semibold">{fmtMinutes(s.focus_seconds)}</span>
                      <span title={s.completed ? 'Completed' : 'Ended early'}>{s.completed ? '✓' : '·'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <DeskLog events={events} />

          <SettingsCard settings={settings} disabled={locked} onChange={pomo.setSettings} />
        </div>
      </div>
    </div>
  );
}

function CameraCard() {
  const { session } = useAuth();
  const { camera } = useFocus();
  const enrolled = loadProfile(session!.user.id) !== null;
  const info = statusInfo(camera.status, camera.graceLeft);

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Camera buddy</h2>
        <button
          role="switch"
          aria-checked={camera.on}
          onClick={() => camera.setOn(!camera.on)}
          className={`btn px-3 py-1 text-sm ${camera.on ? 'btn-primary' : 'bg-surface-2 text-muted'}`}
        >
          {camera.on ? 'On' : 'Off'}
        </button>
      </div>
      <p className="mb-3 text-sm text-muted">
        Logs when you’re at your desk and pauses the timer if you leave for 1 minute. Head down writing still counts. Video never
        leaves your laptop.
      </p>
      {camera.on && (
        <>
          <p className="mb-2 flex items-center gap-2 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 ${info.dot}`} />
            {camera.status === 'error' ? camera.error : info.text}
          </p>
          <WhatBuddySees />
        </>
      )}
      <Link to="/face-setup" className="text-sm font-semibold text-primary">
        {enrolled ? 'Redo face setup' : 'Set up your face (1 min) →'}
      </Link>
    </section>
  );
}

/** Live readout of the last camera check — helps figure out why Buddy isn't recognising you. */
function WhatBuddySees() {
  const { camera } = useFocus();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const c = camera.lastCheck;
  const age = c ? Math.round((Date.now() - c.at) / 1000) : null;
  const stale = age !== null && age > 5;
  const loading = camera.status === 'starting';

  return (
    <div className="mb-3 bg-surface-2 p-2 text-xs text-muted">
      <div className="mb-1 font-semibold text-ink">What Buddy sees</div>
      {loading || !c ? (
        <div>{loading ? 'Starting camera…' : 'Waiting for first check…'}</div>
      ) : (
        <>
          <div>
            Face: {c.face ? `yes, score ${c.score?.toFixed(2)}${c.lookalike ? ' (closer to lookalike)' : ''}` : 'no face found'}
          </div>
          <div>Body: {c.body ? 'yes' : 'no'}</div>
          <div className={stale ? 'font-semibold text-danger' : ''}>
            Last check: {age === 0 ? 'just now' : `${age}s ago`}
            {stale && ' (stuck?)'}
          </div>
        </>
      )}
      <button className="mt-1 font-semibold text-primary" onClick={camera.restart}>
        Restart camera
      </button>
    </div>
  );
}

function DeskLog({ events }: { events: PresenceEvent[] }) {
  // Pair "in" with the next "out".
  const segments: { start: string; end: string | null; reason: string | null }[] = [];
  for (const e of events) {
    const open = segments[segments.length - 1];
    if (e.kind === 'in') {
      if (!open || open.end !== null) segments.push({ start: e.at, end: null, reason: null });
    } else if (open && open.end === null) {
      open.end = e.at;
      open.reason = e.reason;
    }
  }
  const totalMs = segments.reduce((sum, s) => sum + (new Date(s.end ?? Date.now()).getTime() - new Date(s.start).getTime()), 0);

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-bold">Desk log</h2>
        {segments.length > 0 && <span className="text-sm text-muted">{fmtMinutes(totalMs / 1000)} at desk</span>}
      </div>
      {segments.length === 0 ? (
        <p className="text-sm text-muted">Turn on Camera buddy to log when you’re studying.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {segments.map((s) => (
            <li key={s.start} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 bg-emerald-400" />
              <span className="flex-1">
                {clockOf(s.start)} – {s.end ? clockOf(s.end) : 'now'}
              </span>
              {s.reason && <span className="text-xs text-muted">{s.reason}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SettingsCard({ settings, disabled, onChange }: { settings: Settings; disabled: boolean; onChange: (s: Settings) => void }) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  return (
    <section className="card p-4">
      <h2 className="mb-1 text-xl font-bold">Timer settings</h2>
      {disabled && <p className="mb-2 text-xs text-muted">Stop the timer to change these.</p>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <NumberField label="Focus (min)" value={settings.focus} min={1} max={120} disabled={disabled} onChange={(v) => set({ focus: v })} />
        <NumberField label="Short break" value={settings.short} min={1} max={30} disabled={disabled} onChange={(v) => set({ short: v })} />
        <NumberField label="Long break" value={settings.long} min={1} max={60} disabled={disabled} onChange={(v) => set({ long: v })} />
        <NumberField label="Long break every" value={settings.longEvery} min={2} max={8} disabled={disabled} onChange={(v) => set({ longEvery: v })} />
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={settings.autoStartBreaks} disabled={disabled} onChange={(e) => set({ autoStartBreaks: e.target.checked })} />
        Start breaks automatically
      </label>
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  function commit() {
    const n = Math.min(max, Math.max(min, Math.round(Number(text)) || min));
    setText(String(n));
    if (n !== value) onChange(n);
  }

  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
      {label}
      <input
        className="input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  );
}
