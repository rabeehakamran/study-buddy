export type Subject = {
  id: string;
  name: string;
  color: string;
  position: number;
};

export type Task = {
  id: string;
  subject_id: string;
  title: string;
  notes: string | null;
  due_date: string | null; // YYYY-MM-DD
  done: boolean;
  created_at: string;
};

export type Slot = {
  id: string;
  subject_id: string;
  day_of_week: number; // 0 = Monday ... 6 = Sunday
  start_time: string; // HH:MM:SS
  end_time: string;
  note: string | null;
};

export type StudySession = {
  id: string;
  subject_id: string | null;
  task_id: string | null;
  started_at: string;
  ended_at: string;
  focus_seconds: number;
  planned_minutes: number;
  completed: boolean;
};

export type PresenceEvent = {
  id: string;
  kind: 'in' | 'out';
  at: string;
  reason: string | null;
};

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const SUBJECT_COLORS = [
  '#f9a8d4', // pink
  '#c4b5fd', // lavender
  '#fda4af', // rose
  '#a5b4fc', // periwinkle
  '#fcd34d', // butter
  '#86efac', // mint
  '#7dd3fc', // sky
  '#fdba74', // peach
];
