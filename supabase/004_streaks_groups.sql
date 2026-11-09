-- Study Buddy — Phase 4: streaks, stats, friend groups + leaderboard
-- Run AFTER 003_presence.sql.
-- A "streak day" = at least 25 minutes (1500 s) of focus that day.

-- ---------- My daily totals (for streaks, charts, heatmap) ----------
create function public.my_daily_totals(tz text, num_days int default 366)
returns table (d date, secs int, pomodoros int)
language sql stable security invoker set search_path = ''
as $$
  select (s.started_at at time zone tz)::date as d,
         sum(s.focus_seconds)::int as secs,
         (count(*) filter (where s.completed))::int as pomodoros
  from public.study_sessions s
  where s.user_id = (select auth.uid())
    and s.started_at >= now() - make_interval(days => least(num_days, 800))
  group by 1
  order by 1;
$$;

-- ---------- Friend groups ----------
create table public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

-- Helper (security definer avoids RLS recursion on group_members)
create function public.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = (select auth.uid()));
$$;

alter table public.study_groups enable row level security;
alter table public.group_members enable row level security;

create policy "members see their groups" on public.study_groups
  for select to authenticated using (public.is_group_member(id));
create policy "members see group members" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
create policy "leave a group" on public.group_members
  for delete to authenticated using (user_id = (select auth.uid()));
-- No insert/update policies: creating & joining only happen through the functions below.

create function public.create_group(group_name text)
returns public.study_groups language plpgsql security definer set search_path = ''
as $$
declare
  g public.study_groups;
  code text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if char_length(trim(group_name)) not between 1 and 40 then
    raise exception 'Group name must be 1 to 40 characters';
  end if;
  loop
    -- 6 chars, no look-alikes (0/O, 1/I/L)
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
      into code from generate_series(1, 6);
    exit when not exists (select 1 from public.study_groups where invite_code = code);
  end loop;
  insert into public.study_groups (name, invite_code, created_by)
    values (trim(group_name), code, auth.uid()) returning * into g;
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end;
$$;

create function public.join_group(code text)
returns public.study_groups language plpgsql security definer set search_path = ''
as $$
declare
  g public.study_groups;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into g from public.study_groups where invite_code = upper(trim(code));
  if not found then raise exception 'No group with that code. Check it and try again.'; end if;
  if (select count(*) from public.group_members where group_id = g.id) >= 50 then
    raise exception 'This group is full (50 people max)';
  end if;
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid())
    on conflict do nothing;
  return g;
end;
$$;

-- ---------- Leaderboard: only totals are exposed, never individual sessions ----------
create function public.group_leaderboard(gid uuid, tz text)
returns table (user_id uuid, display_name text, week_seconds int, today_seconds int, streak int, is_me boolean)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_group_member(gid) then raise exception 'You are not in this group'; end if;
  return query
  with members as (
    select m.user_id from public.group_members m where m.group_id = gid
  ),
  t as (select (now() at time zone tz)::date as today),
  days as (
    select s.user_id, (s.started_at at time zone tz)::date as d, sum(s.focus_seconds)::int as secs
    from public.study_sessions s
    join members using (user_id)
    where s.started_at >= now() - interval '400 days'
    group by 1, 2
  ),
  qual as (
    select q.user_id, q.d, q.d - (row_number() over (partition by q.user_id order by q.d))::int as grp
    from days q where q.secs >= 1500
  ),
  runs as (
    select r.user_id, max(r.d) as last_day, count(*)::int as len from qual r group by r.user_id, r.grp
  ),
  streaks as (
    -- the run that reaches today or yesterday is still alive
    select r.user_id, r.len from runs r, t where r.last_day >= t.today - 1
  )
  select m.user_id,
         coalesce(p.display_name, 'Student'),
         coalesce((select sum(x.secs) from days x, t where x.user_id = m.user_id
                   and x.d >= date_trunc('week', t.today)::date), 0)::int,
         coalesce((select sum(x.secs) from days x, t where x.user_id = m.user_id and x.d = t.today), 0)::int,
         coalesce((select st.len from streaks st where st.user_id = m.user_id), 0)::int,
         m.user_id = auth.uid()
  from members m
  left join public.profiles p on p.id = m.user_id;
end;
$$;

revoke execute on function public.my_daily_totals(text, int) from public, anon;
revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.create_group(text) from public, anon;
revoke execute on function public.join_group(text) from public, anon;
revoke execute on function public.group_leaderboard(uuid, text) from public, anon;
grant execute on function public.my_daily_totals(text, int) to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.group_leaderboard(uuid, text) to authenticated;
