import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { toISODate, todayISO } from './format';

/** A day counts toward the streak with at least 25 minutes of focus. */
export const STREAK_SECONDS = 25 * 60;

export const userTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export type DayTotal = { d: string; secs: number; pomodoros: number };

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + n));
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return addDays(iso, -dow);
}

export function computeStreaks(byDay: Map<string, number>) {
  const today = todayISO();
  const ok = (iso: string) => (byDay.get(iso) ?? 0) >= STREAK_SECONDS;

  // Current: today counts if done; otherwise the streak is still alive from yesterday.
  let current = 0;
  let day = ok(today) ? today : addDays(today, -1);
  while (ok(day)) {
    current++;
    day = addDays(day, -1);
  }

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...byDay.keys()].filter(ok).sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best: Math.max(best, current), todayDone: ok(today) };
}

export function fmtHours(seconds: number) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
}

/** The current user's per-day focus totals for the last `days` days. */
export function useDailyTotals(days = 366) {
  const [byDay, setByDay] = useState<Map<string, DayTotal>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.rpc('my_daily_totals', { tz: userTimeZone(), num_days: days }).then(({ data, error }) => {
      if (!alive) return;
      if (error) setError(error.message);
      else setByDay(new Map(((data ?? []) as DayTotal[]).map((r) => [r.d.slice(0, 10), r])));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [days]);

  const secsByDay = new Map([...byDay].map(([k, v]) => [k, v.secs]));
  return { byDay, secsByDay, loading, error, streaks: computeStreaks(secsByDay) };
}
