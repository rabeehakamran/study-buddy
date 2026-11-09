import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useRows } from '../lib/useRows';
import type { Subject } from '../lib/types';
import { todayISO } from '../lib/format';
import { addDays, fmtHours, STREAK_SECONDS, useDailyTotals, weekStart, type DayTotal } from '../lib/stats';
import ErrorBanner from '../components/ErrorBanner';
import PageHeader from '../components/PageHeader';
import Mascot from '../pixel/Mascot';
import PixelArt from '../pixel/PixelArt';
import { FLAME, FLAME_OFF_PALETTE, FLAME_PALETTE } from '../pixel/sprites';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HEAT_WEEKS = 26;
// One purple ramp, dark → light on the dark surface (magnitude).
const HEAT = ['var(--color-surface-2)', '#3b2a6b', '#5b3fa8', '#8b5cf6', '#c4b5fd'];
const HEAT_LABELS = ['none', 'under 25m', '25m – 1h', '1 – 2h', '2h +'];

function heatLevel(secs: number) {
  if (secs <= 0) return 0;
  if (secs < STREAK_SECONDS) return 1;
  if (secs < 3600) return 2;
  if (secs < 7200) return 3;
  return 4;
}

function prettyDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function Progress() {
  const { byDay, loading, error, streaks } = useDailyTotals(366);
  const subjects = useRows<Subject>('subjects', 'position');
  const [subjectSecs, setSubjectSecs] = useState<Map<string | null, number>>(new Map());
  const [subjError, setSubjError] = useState<string | null>(null);

  const today = todayISO();
  const monday = weekStart(today);

  // Per-subject time this week.
  useEffect(() => {
    const [y, m, d] = monday.split('-').map(Number);
    supabase
      .from('study_sessions')
      .select('subject_id, focus_seconds')
      .gte('started_at', new Date(y, m - 1, d).toISOString())
      .then(({ data, error }) => {
        if (error) return setSubjError(error.message);
        const map = new Map<string | null, number>();
        for (const r of (data ?? []) as { subject_id: string | null; focus_seconds: number }[]) {
          map.set(r.subject_id, (map.get(r.subject_id) ?? 0) + r.focus_seconds);
        }
        setSubjectSecs(map);
      });
  }, [monday]);

  if (loading) return <p className="text-muted">Loading…</p>;

  const get = (iso: string): DayTotal => byDay.get(iso) ?? { d: iso, secs: 0, pomodoros: 0 };
  const week = DAY_SHORT.map((_, i) => get(addDays(monday, i)));
  const weekSecs = week.reduce((s, d) => s + d.secs, 0);
  const weekDays = week.filter((d) => d.secs >= STREAK_SECONDS).length;
  const yearSecs = [...byDay.values()].reduce((s, d) => s + d.secs, 0);
  const todaySecs = get(today).secs;
  const todayMin = Math.floor(todaySecs / 60);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Progress"
        subtitle="Study at least 25 minutes a day to keep your streak alive 🔥"
        art={<Mascot mood="happy" className="w-full" />}
      />

      <ErrorBanner message={error ?? subjError ?? subjects.error} />

      {/* ---------- Streak hero ---------- */}
      <section className="card flex flex-wrap items-center gap-6 p-6">
        <div className="flex items-center gap-4">
          <PixelArt
            rows={FLAME}
            palette={streaks.current > 0 ? FLAME_PALETTE : FLAME_OFF_PALETTE}
            className={`w-16 sm:w-20 ${streaks.current > 0 ? 'animate-bob' : ''}`}
            label={streaks.current > 0 ? 'Streak flame, lit' : 'Streak flame, out'}
          />
          <div>
            <div className="font-pixel text-6xl font-bold leading-none">{streaks.current}</div>
            <div className="font-pixel text-lg text-primary">day streak</div>
          </div>
        </div>

        <div className="min-w-60 flex-1">
          <p className="mb-2 text-sm">
            {streaks.todayDone ? (
              <b>Streak secured for today ✓</b>
            ) : streaks.current > 0 ? (
              <>
                <b>{25 - todayMin} more minutes</b> today to keep your streak!
              </>
            ) : (
              <>Do 25 minutes today to start a new streak.</>
            )}
          </p>
          <div className="flex gap-[2px]" role="progressbar" aria-valuemin={0} aria-valuemax={25} aria-valuenow={Math.min(25, todayMin)} aria-label="Minutes today toward streak">
            {Array.from({ length: 25 }, (_, i) => (
              <div key={i} className={`h-3 flex-1 ${i < todayMin ? 'bg-accent' : 'bg-surface-2'}`} />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{Math.min(25, todayMin)}/25 min today</p>
        </div>

        {!streaks.todayDone && (
          <Link to="/focus" className="btn btn-primary">
            Study now ▶
          </Link>
        )}
      </section>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="best streak" value={`${streaks.best} 🔥`} />
        <Stat label="this week" value={fmtHours(weekSecs)} />
        <Stat label="streak days this week" value={`${weekDays}/7`} />
        <Stat label="past year" value={fmtHours(yearSecs)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <WeekChart week={week} monday={monday} today={today} />
        <SubjectBreakdown subjects={subjects.rows} secs={subjectSecs} />
      </div>

      <Heatmap get={get} today={today} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4 text-center">
      <div className="font-pixel text-3xl font-bold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

// ---------- This week: hours per day (single series → no legend) ----------
function WeekChart({ week, monday, today }: { week: DayTotal[]; monday: string; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const maxH = Math.max(1, Math.ceil(Math.max(...week.map((d) => d.secs)) / 3600));
  const step = maxH > 6 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(maxH / step) + 1 }, (_, i) => i * step);

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-xl font-bold">This week</h2>
      <p className="mb-4 text-xs text-muted">Hours focused each day · 🔥 = streak day</p>

      <div className="flex gap-2">
        {/* y axis */}
        <div className="relative h-40 w-6 text-right text-[10px] text-muted">
          {ticks.map((h) => (
            <span key={h} className="absolute right-0" style={{ bottom: `${(h / maxH) * 100}%`, transform: 'translateY(50%)' }}>
              {h}h
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {/* recessive gridlines */}
          {ticks.map((h) => (
            <div key={h} className="absolute inset-x-0 border-t border-line/60" style={{ bottom: `${(h / maxH) * 100}%` }} />
          ))}
          <div className="relative flex h-40 items-end gap-2">
            {week.map((d, i) => {
              const iso = addDays(monday, i);
              const future = iso > today;
              const pct = (d.secs / (maxH * 3600)) * 100;
              return (
                <button
                  key={iso}
                  className="relative flex h-full flex-1 items-end justify-center focus:outline-none"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${prettyDate(iso)}: ${fmtHours(d.secs)}, ${d.pomodoros} pomodoros`}
                  disabled={future}
                >
                  <div
                    className={`w-full max-w-10 ${hover === i ? 'bg-primary' : 'bg-accent'}`}
                    style={{ height: d.secs ? `max(${pct}%, 3px)` : 0 }}
                  />
                  {hover === i && (
                    <div className="absolute bottom-full z-10 mb-1 whitespace-nowrap bg-surface-2 px-2 py-1 text-xs shadow-lg" style={{ bottom: `${pct}%` }}>
                      <div className="font-semibold">{prettyDate(iso)}</div>
                      <div>
                        {fmtHours(d.secs)} · {d.pomodoros} 🍅
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ml-8 mt-2 flex gap-2 text-center text-xs">
        {week.map((d, i) => {
          const iso = addDays(monday, i);
          return (
            <div key={iso} className={`flex-1 ${iso === today ? 'font-bold text-ink' : 'text-muted'}`}>
              {DAY_SHORT[i]}
              <div className="h-4">{d.secs >= STREAK_SECONDS ? '🔥' : ''}</div>
            </div>
          );
        })}
      </div>

      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full">
          <tbody>
            {week.map((d, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1">{DAY_SHORT[i]}</td>
                <td className="py-1 text-right">{fmtHours(d.secs)}</td>
                <td className="py-1 text-right">{d.pomodoros} pomodoros</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

// ---------- Subjects this week ----------
function SubjectBreakdown({ subjects, secs }: { subjects: Subject[]; secs: Map<string | null, number> }) {
  const rows = [
    ...subjects.map((s) => ({ key: s.id, name: s.name, color: s.color, secs: secs.get(s.id) ?? 0 })),
    ...(secs.get(null) ? [{ key: 'none', name: 'No subject', color: 'var(--color-line)', secs: secs.get(null)! }] : []),
  ]
    .filter((r) => r.secs > 0)
    .sort((a, b) => b.secs - a.secs);
  const max = Math.max(1, ...rows.map((r) => r.secs));

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-xl font-bold">By subject</h2>
      <p className="mb-4 text-xs text-muted">Focus time this week</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No study time yet this week.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{r.name}</span>
                <span className="font-semibold">{fmtHours(r.secs)}</span>
              </div>
              <div className="h-3 bg-surface-2">
                <div className="h-full" style={{ width: `${(r.secs / max) * 100}%`, background: r.color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Heatmap: which days she studied ----------
function Heatmap({ get, today }: { get: (iso: string) => DayTotal; today: string }) {
  const [hover, setHover] = useState<DayTotal | null>(null);
  const first = addDays(weekStart(today), -7 * (HEAT_WEEKS - 1));
  const weeks = Array.from({ length: HEAT_WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
  const studied = weeks.flat().filter((iso) => iso <= today && get(iso).secs > 0).length;

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">Study days</h2>
        <span className="text-xs text-muted" aria-live="polite">
          {hover ? `${prettyDate(hover.d)} · ${fmtHours(hover.secs)}` : `${studied} days studied in the last ${HEAT_WEEKS} weeks`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-[3px]" role="img" aria-label={`${studied} days studied in the last ${HEAT_WEEKS} weeks`}>
          <div className="mr-1 flex flex-col gap-[3px] text-[10px] text-muted">
            {DAY_SHORT.map((d, i) => (
              <div key={d} className="h-4 leading-4">
                {i % 2 === 0 ? d : ''}
              </div>
            ))}
          </div>
          {weeks.map((days) => (
            <div key={days[0]} className="flex flex-col gap-[3px]">
              {days.map((iso) => {
                const t = get(iso);
                const future = iso > today;
                return (
                  <div
                    key={iso}
                    className={`h-4 w-4 ${iso === today ? 'outline outline-1 outline-ink' : ''}`}
                    style={{ background: future ? 'transparent' : HEAT[heatLevel(t.secs)] }}
                    onMouseEnter={() => !future && setHover(t)}
                    onMouseLeave={() => setHover(null)}
                    title={future ? undefined : `${prettyDate(iso)}: ${fmtHours(t.secs)}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        Less
        {HEAT.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3" style={{ background: c }} />
            {HEAT_LABELS[i]}
          </span>
        ))}
        More
      </div>
    </section>
  );
}
