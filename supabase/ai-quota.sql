-- Optional: apply only before enabling multi-model comparisons. Never changes project rows.
begin;
create table if not exists public.studio_ai_usage(user_id uuid not null references auth.users(id) on delete cascade,day date not null,requests integer not null default 0 check(requests between 0 and 5),primary key(user_id,day));
alter table public.studio_ai_usage enable row level security;
revoke all on public.studio_ai_usage from anon,authenticated;
grant select on public.studio_ai_usage to authenticated;
drop policy if exists "Read own AI quota" on public.studio_ai_usage;
create policy "Read own AI quota" on public.studio_ai_usage for select to authenticated using(user_id=(select auth.uid()));
create or replace function public.consume_studio_ai_quota() returns integer
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); used integer;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 insert into public.studio_ai_usage as q(user_id,day,requests) values(owner_id,(now() at time zone 'Asia/Shanghai')::date,1)
 on conflict(user_id,day) do update set requests=q.requests+1 where q.requests<5 returning requests into used;
 if used is null then raise exception 'Daily quota exhausted'; end if;
 return used;
end;
$$;
revoke all on function public.consume_studio_ai_quota() from public,anon;
grant execute on function public.consume_studio_ai_quota() to authenticated;
commit;
