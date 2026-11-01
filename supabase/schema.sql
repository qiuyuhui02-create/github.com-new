-- FRAMEWORK Studio: repeatable setup/upgrade. Run in Supabase SQL Editor.
-- Preserves existing project rows. No service-role key required by the app.
begin;
create table if not exists public.studio_projects (
 user_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null default '{"assets":[],"shots":[],"tasks":[],"prompts":[]}'::jsonb,
 updated_at timestamptz not null default now(),
 version bigint not null default 1
);
alter table public.studio_projects add column if not exists version bigint not null default 1;
alter table public.studio_projects enable row level security;
alter table public.studio_projects force row level security;
revoke all on public.studio_projects from anon;
grant select, insert, update, delete on public.studio_projects to authenticated;

drop policy if exists "Owner reads" on public.studio_projects;
drop policy if exists "Owner inserts" on public.studio_projects;
drop policy if exists "Owner updates" on public.studio_projects;
drop policy if exists "Owner deletes" on public.studio_projects;
drop policy if exists "Owner boundary" on public.studio_projects;
create policy "Owner reads" on public.studio_projects for select to authenticated using ((select auth.uid())=user_id);
create policy "Owner inserts" on public.studio_projects for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Owner updates" on public.studio_projects for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Owner deletes" on public.studio_projects for delete to authenticated using ((select auth.uid())=user_id);
-- Additional permissive policies cannot widen this ownership boundary.
create policy "Owner boundary" on public.studio_projects as restrictive for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create or replace function public.save_studio_project(project_data jsonb, expected_version bigint)
returns table(version bigint, updated_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if expected_version is null or expected_version < 0 then raise exception 'Invalid version' using errcode='22023'; end if;
 if jsonb_typeof(project_data) is distinct from 'object'
   or jsonb_typeof(project_data->'assets') is distinct from 'array'
   or jsonb_typeof(project_data->'shots') is distinct from 'array'
   or jsonb_typeof(project_data->'tasks') is distinct from 'array'
   or jsonb_typeof(project_data->'prompts') is distinct from 'array'
   or octet_length(project_data::text)>20971520 then
   raise exception 'Invalid project data' using errcode='22023';
 end if;
 if expected_version=0 then
  return query insert into public.studio_projects as p(user_id,data,version,updated_at)
   values(owner_id,project_data,1,clock_timestamp()) returning p.version,p.updated_at;
 else
  return query update public.studio_projects as p set data=project_data,version=p.version+1,updated_at=clock_timestamp()
   where p.user_id=owner_id and p.version=expected_version returning p.version,p.updated_at;
  if not found then raise exception 'Project changed; reload before saving' using errcode='40001'; end if;
 end if;
end;
$$;
revoke all on function public.save_studio_project(jsonb,bigint) from public, anon;
grant execute on function public.save_studio_project(jsonb,bigint) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('assets','assets',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Owner uploads" on storage.objects;
drop policy if exists "Owner views" on storage.objects;
drop policy if exists "Owner removes" on storage.objects;
drop policy if exists "Asset owner boundary" on storage.objects;
drop policy if exists "No anonymous assets" on storage.objects;
create policy "Owner uploads" on storage.objects for insert to authenticated with check(bucket_id='assets' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Owner views" on storage.objects for select to authenticated using(bucket_id='assets' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Owner removes" on storage.objects for delete to authenticated using(bucket_id='assets' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Asset owner boundary" on storage.objects as restrictive for all to authenticated
using(bucket_id<>'assets' or (storage.foldername(name))[1]=(select auth.uid())::text)
with check(bucket_id<>'assets' or (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "No anonymous assets" on storage.objects as restrictive for all to anon using(bucket_id<>'assets') with check(bucket_id<>'assets');
commit;
