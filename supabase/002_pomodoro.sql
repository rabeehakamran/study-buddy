-- Study Buddy — Phase 2: pomodoro sessions
-- Run AFTER 001_phase1.sql (Supabase -> SQL Editor -> New query -> paste -> Run).

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  focus_seconds int not null check (focus_seconds >= 0),   -- time actually focused (pauses excluded)
  planned_minutes int not null check (planned_minutes > 0),
  completed boolean not null default false,                -- true = ran the full pomodoro
  created_at timestamptz not null default now(),
  check (ended_at >= started_at)
);
create index sessions_user_started_idx on public.study_sessions (user_id, started_at desc);
alter table public.study_sessions enable row level security;

create policy "own sessions" on public.study_sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (subject_id is null or exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid())))
    and (task_id is null or exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid())))
  );
