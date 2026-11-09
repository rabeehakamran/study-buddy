-- Study Buddy — Phase 5: quiz results
-- Run AFTER 004_streaks_groups.sql.

create table public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  subject_name text check (char_length(subject_name) <= 60),
  topic text check (char_length(topic) <= 120),
  title text check (char_length(title) <= 120),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  score int not null check (score >= 0),
  total int not null check (total > 0 and score <= total),
  created_at timestamptz not null default now()
);
create index quiz_results_user_idx on public.quiz_results (user_id, created_at desc);
alter table public.quiz_results enable row level security;

create policy "own quiz results" on public.quiz_results
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (subject_id is null or exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid())))
  );
