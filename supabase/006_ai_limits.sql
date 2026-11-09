-- Study Buddy: daily "Ask Buddy" message limit (enforced by the server, counted here)
-- Run AFTER 005_quizzes.sql.

create table public.ai_usage (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  chats int not null default 0 check (chats >= 0),
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

create policy "read own ai usage" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));
-- No insert/update/delete policies: the count only changes through use_chat_credit(),
-- which can only ever go UP (so nobody can reset their own limit).

create function public.chats_used_today(tz text)
returns int language sql stable security invoker set search_path = ''
as $$
  select coalesce((select u.chats from public.ai_usage u
                   where u.user_id = (select auth.uid()) and u.day = (now() at time zone tz)::date), 0);
$$;

create function public.use_chat_credit(tz text)
returns int language plpgsql security definer set search_path = ''
as $$
declare
  n int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.ai_usage (user_id, day, chats)
    values (auth.uid(), (now() at time zone tz)::date, 1)
    on conflict (user_id, day) do update set chats = public.ai_usage.chats + 1
    returning chats into n;
  return n;
end;
$$;

revoke execute on function public.chats_used_today(text) from public, anon;
revoke execute on function public.use_chat_credit(text) from public, anon;
grant execute on function public.chats_used_today(text) to authenticated;
grant execute on function public.use_chat_credit(text) to authenticated;
