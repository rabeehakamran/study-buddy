-- Study Buddy — Phase 1 schema
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Every table is protected by Row Level Security: each student only sees her own data.

-- ---------- Profiles (display name; used by the leaderboard later) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Student',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid()));

-- Create a profile automatically when someone signs up
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Subjects ----------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null default '#f9a8d4',
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index subjects_user_idx on public.subjects (user_id);
alter table public.subjects enable row level security;

create policy "own subjects" on public.subjects
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- Tasks ----------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index tasks_user_idx on public.tasks (user_id);
create index tasks_subject_idx on public.tasks (subject_id);
alter table public.tasks enable row level security;

create policy "own tasks" on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid()))
  );

-- ---------- Weekly timetable ----------
-- day_of_week: 0 = Monday ... 6 = Sunday
create table public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  note text,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index slots_user_idx on public.timetable_slots (user_id);
alter table public.timetable_slots enable row level security;

create policy "own slots" on public.timetable_slots
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid()))
  );
