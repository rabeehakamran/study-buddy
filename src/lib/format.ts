import type { Task } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** 0 = Monday ... 6 = Sunday */
export function todayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

/** "16:30:00" -> "4:30 pm" */
export function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'pm' : 'am'}`;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole days from today to the date (negative = past). */
export function daysFromToday(iso: string): number {
  const today = parseISO(todayISO());
  return Math.round((parseISO(iso).getTime() - today.getTime()) / 86_400_000);
}

export function fmtDue(iso: string): string {
  const diff = daysFromToday(iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  const label = parseISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return diff < 0 ? `Overdue · ${label}` : label;
}

/** Undone first, then by due date (no date last), then oldest first. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    }
    return a.created_at < b.created_at ? -1 : 1;
  });
}
