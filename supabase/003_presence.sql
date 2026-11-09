-- Study Buddy — Phase 3: desk log (logged in / logged out times from the camera buddy)
-- Run AFTER 002_pomodoro.sql. Only times are stored — never photos, video or face data.

create table public.presence_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  at timestamptz not null default now(),
  reason text check (char_length(reason) <= 40),
  created_at timestamptz not null default now()
);
create index presence_user_at_idx on public.presence_events (user_id, at desc);
alter table public.presence_events enable row level security;

create policy "own presence events" on public.presence_events
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
