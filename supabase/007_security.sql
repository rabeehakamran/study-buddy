-- Study Buddy — security & guardrails
-- Run AFTER 006_ai_limits.sql. Safe to run on a database that already has data.

-- =====================================================================
-- 1. Text helpers: tidy names and block offensive ones
-- =====================================================================

-- Trim, collapse spaces, remove invisible/control characters, cut to max length.
create or replace function public.clean_name(t text, maxlen int)
returns text language sql immutable set search_path = ''
as $$
  select left(btrim(regexp_replace(
           regexp_replace(coalesce(t, ''), '[\x01-\x1F\x7F​-‏‪-‮⁠-⁯﻿]', '', 'g'),
           '\s+', ' ', 'g')), maxlen);
$$;

-- false if the text contains rude words (English + Roman Urdu/Hindi), including l33t spellings.
create or replace function public.is_clean_text(t text)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare
  s text := translate(lower(coalesce(t, '')), '0134578@$!|', 'oieastbasii');
  squashed text := regexp_replace(s, '[^a-z]', '', 'g'); -- catches f.u.c.k / f u c k
begin
  if squashed ~ '(fuck|bitch|nigg|fagg|whore|asshole|porn|chutiy|chutia|madarch|maderch|behench|bhench|bhosd|haramz)' then
    return false;
  end if;
  -- stretched spellings: "fuuuck", "biiitch"
  if regexp_replace(squashed, '(.)\1+', '\1', 'g') ~ '(fuck|bitch|whore|ashole|porn|chutiy|chutia|madarch|behench|bhench|bhosd|haramz)' then
    return false;
  end if;
  -- whole words only, so "class", "Sussex", "grape", "Kshitij" are fine
  if s ~ '\m(ass|shit|shitty|cunt|dick|sex|sexy|rape|nude|nudes|lund|gandu|harami|kamina|kameena|randi|kutti|kutta|dalla|tatti|boob|boobs|penis|vagina|slut|gaand|lauda|lavda)\M' then
    return false;
  end if;
  return true;
end;
$$;

-- =====================================================================
-- 2. Display names (shown on leaderboards)
-- =====================================================================
update public.profiles
   set display_name = case
     when public.clean_name(display_name, 30) <> '' and public.is_clean_text(display_name)
       then public.clean_name(display_name, 30)
     else 'Student ' || substr(id::text, 1, 4) end;

alter table public.profiles add constraint display_name_length check (char_length(display_name) between 1 and 30);

create or replace function public.profiles_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.display_name := public.clean_name(new.display_name, 30);
  if new.display_name = '' then raise exception 'Please choose a name'; end if;
  if not public.is_clean_text(new.display_name) then raise exception 'Please choose a kinder name 🎀'; end if;
  if tg_op = 'UPDATE' then new.id := old.id; new.created_at := old.created_at; end if;
  return new;
end;
$$;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.profiles_guard();

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Signup: a rude or empty name silently becomes "Student xxxx" instead of failing the signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  n text := public.clean_name(coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), 30);
begin
  if n = '' or not public.is_clean_text(n) then n := 'Student ' || substr(new.id::text, 1, 4); end if;
  insert into public.profiles (id, display_name) values (new.id, n);
  return new;
end;
$$;

-- =====================================================================
-- 3. Study sessions: the SERVER keeps the clock (no faking hours/streaks)
-- =====================================================================
-- Before: the browser inserted finished sessions directly (start/end times, minutes) — easy to fake.
-- Now: begin_focus() stamps the start with the server's clock, end_focus() stamps the end and
-- caps the minutes at (real time passed) and (planned length). Direct writes are no longer allowed.
alter table public.study_sessions alter column ended_at drop not null; -- NULL = still running
alter table public.study_sessions add constraint planned_max check (planned_minutes <= 120) not valid;
alter table public.study_sessions add constraint focus_max check (focus_seconds <= planned_minutes * 60) not valid;

drop policy if exists "own sessions" on public.study_sessions;
create policy "read own sessions" on public.study_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "delete own sessions" on public.study_sessions
  for delete to authenticated using (user_id = (select auth.uid()));
-- (no insert/update policies)

create or replace function public.begin_focus(p_subject uuid default null, p_task uuid default null, p_planned int default 25)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  sid uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_planned is null or p_planned not between 1 and 120 then raise exception 'Focus length must be 1 to 120 minutes'; end if;
  if p_subject is not null and not exists (select 1 from public.subjects where id = p_subject and user_id = uid) then p_subject := null; end if;
  if p_task is not null and not exists (select 1 from public.tasks where id = p_task and user_id = uid) then p_task := null; end if;
  if (select count(*) from public.study_sessions where user_id = uid and started_at > now() - interval '1 day') >= 80 then
    raise exception 'That''s a LOT of sessions today. Take a break! 🐱';
  end if;
  delete from public.study_sessions where user_id = uid and ended_at is null; -- only one running session
  insert into public.study_sessions (user_id, subject_id, task_id, started_at, ended_at, focus_seconds, planned_minutes, completed)
    values (uid, p_subject, p_task, now(), null, 0, p_planned, false)
    returning id into sid;
  return sid;
end;
$$;

create or replace function public.end_focus(p_id uuid, p_focus_seconds int, p_completed boolean)
returns public.study_sessions language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s public.study_sessions;
  elapsed int;
  secs int;
begin
  select * into s from public.study_sessions where id = p_id and user_id = uid and ended_at is null for update;
  if not found then raise exception 'This focus session was already saved or has expired'; end if;
  elapsed := floor(extract(epoch from now() - s.started_at))::int;
  secs := greatest(0, least(coalesce(p_focus_seconds, 0), elapsed + 5, s.planned_minutes * 60));
  if secs < 60 then
    delete from public.study_sessions where id = p_id; -- under a minute: doesn't count
    return null;
  end if;
  update public.study_sessions
     set ended_at = now(),
         focus_seconds = secs,
         completed = coalesce(p_completed, false) and secs >= s.planned_minutes * 60 - 30
   where id = p_id
   returning * into s;
  return s;
end;
$$;

-- =====================================================================
-- 4. Friend groups: owner controls, longer codes, limits
-- =====================================================================
drop policy if exists "leave a group" on public.group_members; -- leaving now goes through leave_group()

create or replace function public.new_invite_code()
returns text language plpgsql volatile set search_path = ''
as $$
declare code text;
begin
  loop
    -- 8 chars from 31 (no 0/O/1/I/L) = ~850 billion combinations: not guessable
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
      into code from generate_series(1, 8);
    exit when not exists (select 1 from public.study_groups where invite_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.create_group(group_name text)
returns public.study_groups language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n text := public.clean_name(group_name, 40);
  g public.study_groups;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if n = '' then raise exception 'Give your group a name'; end if;
  if not public.is_clean_text(n) then raise exception 'Please choose a kinder group name 🎀'; end if;
  if (select count(*) from public.study_groups where created_by = uid) >= 5 then raise exception 'You can create up to 5 groups'; end if;
  if (select count(*) from public.group_members where user_id = uid) >= 15 then raise exception 'You''re already in 15 groups (the max)'; end if;
  insert into public.study_groups (name, invite_code, created_by) values (n, public.new_invite_code(), uid) returning * into g;
  insert into public.group_members (group_id, user_id) values (g.id, uid);
  return g;
end;
$$;

create or replace function public.join_group(code text)
returns public.study_groups language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.study_groups;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into g from public.study_groups where invite_code = upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found then raise exception 'No group with that code. Check it and try again.'; end if;
  if exists (select 1 from public.group_members where group_id = g.id and user_id = uid) then return g; end if;
  if (select count(*) from public.group_members where user_id = uid) >= 15 then raise exception 'You''re already in 15 groups (the max)'; end if;
  if (select count(*) from public.group_members where group_id = g.id) >= 50 then raise exception 'This group is full (50 people max)'; end if;
  insert into public.group_members (group_id, user_id) values (g.id, uid);
  return g;
end;
$$;

create or replace function public.leave_group(gid uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  heir uuid;
begin
  delete from public.group_members where group_id = gid and user_id = uid;
  if not found then return; end if;
  if (select created_by from public.study_groups where id = gid) = uid then
    select user_id into heir from public.group_members where group_id = gid order by joined_at limit 1;
    if heir is null then
      delete from public.study_groups where id = gid; -- last one out
    else
      update public.study_groups set created_by = heir where id = gid; -- oldest member becomes owner
    end if;
  end if;
end;
$$;

create or replace function public.remove_member(gid uuid, member uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if (select created_by from public.study_groups where id = gid) is distinct from auth.uid() then
    raise exception 'Only the group owner can remove people';
  end if;
  if member = auth.uid() then raise exception 'Use "Leave group" to leave your own group'; end if;
  delete from public.group_members where group_id = gid and user_id = member;
end;
$$;

create or replace function public.regenerate_invite_code(gid uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare code text;
begin
  if (select created_by from public.study_groups where id = gid) is distinct from auth.uid() then
    raise exception 'Only the group owner can change the code';
  end if;
  code := public.new_invite_code();
  update public.study_groups set invite_code = code where id = gid;
  return code;
end;
$$;

-- =====================================================================
-- 5. Anti-spam: per-student row limits and text limits
-- =====================================================================
create or replace function public.enforce_row_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  lim int := tg_argv[0]::int;
  n int;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name) into n using new.user_id;
  if n >= lim then raise exception 'Limit reached: you can have at most % of these', lim; end if;
  return new;
end;
$$;

create trigger subjects_limit before insert on public.subjects for each row execute function public.enforce_row_limit('30');
create trigger tasks_limit before insert on public.tasks for each row execute function public.enforce_row_limit('1000');
create trigger slots_limit before insert on public.timetable_slots for each row execute function public.enforce_row_limit('300');
create trigger presence_limit before insert on public.presence_events for each row execute function public.enforce_row_limit('20000');
create trigger quiz_results_limit before insert on public.quiz_results for each row execute function public.enforce_row_limit('5000');

alter table public.tasks add constraint notes_length check (notes is null or char_length(notes) <= 1000) not valid;
alter table public.timetable_slots add constraint note_length check (note is null or char_length(note) <= 100) not valid;
alter table public.subjects add constraint color_hex check (color ~ '^#[0-9a-fA-F]{6}$') not valid;

-- =====================================================================
-- 6. AI usage: quizzes counted too, plus app-wide totals (protects the free Groq quota)
-- =====================================================================
alter table public.ai_usage add column if not exists quizzes int not null default 0 check (quizzes >= 0);

create or replace function public.quizzes_used_today(tz text)
returns int language sql stable security invoker set search_path = ''
as $$
  select coalesce((select u.quizzes from public.ai_usage u
                   where u.user_id = (select auth.uid()) and u.day = (now() at time zone tz)::date), 0);
$$;

create or replace function public.use_quiz_credit(tz text)
returns int language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.ai_usage (user_id, day, quizzes)
    values (auth.uid(), (now() at time zone tz)::date, 1)
    on conflict (user_id, day) do update set quizzes = public.ai_usage.quizzes + 1
    returning quizzes into n;
  return n;
end;
$$;

-- Atomic "take one if any are left": many requests sent at the same moment can't sneak past the limit.
-- Returns the new count, or NULL if the limit was already reached.
create or replace function public.claim_ai_credit(kind text, tz text, lim int)
returns int language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d date := (now() at time zone tz)::date;
  n int;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if kind not in ('chats', 'quizzes') then raise exception 'Unknown kind'; end if;
  insert into public.ai_usage (user_id, day) values (uid, d) on conflict do nothing;
  if kind = 'chats' then
    update public.ai_usage set chats = chats + 1 where user_id = uid and day = d and chats < lim returning chats into n;
  else
    update public.ai_usage set quizzes = quizzes + 1 where user_id = uid and day = d and quizzes < lim returning quizzes into n;
  end if;
  return n;
end;
$$;

-- Everyone's usage today added up (just two numbers, no names).
create or replace function public.ai_totals_today(tz text)
returns table (chats bigint, quizzes bigint) language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(u.chats), 0), coalesce(sum(u.quizzes), 0)
  from public.ai_usage u where u.day = (now() at time zone tz)::date;
$$;

-- =====================================================================
-- 7. Permissions for the new functions
-- =====================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.begin_focus(uuid, uuid, int)', 'public.end_focus(uuid, int, boolean)',
    'public.leave_group(uuid)', 'public.remove_member(uuid, uuid)', 'public.regenerate_invite_code(uuid)',
    'public.quizzes_used_today(text)', 'public.use_quiz_credit(text)', 'public.ai_totals_today(text)',
    'public.claim_ai_credit(text, text, int)',
    'public.create_group(text)', 'public.join_group(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- internal helpers: not callable from the API at all
  foreach f in array array['public.new_invite_code()', 'public.enforce_row_limit()', 'public.profiles_guard()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;
