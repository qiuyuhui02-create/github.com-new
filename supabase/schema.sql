-- Run once in Supabase SQL Editor. Sign in via email OTP; never use service_role in browser.
create table if not exists public.studio_projects (
 user_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.studio_projects enable row level security;
create policy "Owner reads" on public.studio_projects for select to authenticated using (auth.uid()=user_id);
create policy "Owner inserts" on public.studio_projects for insert to authenticated with check (auth.uid()=user_id);
create policy "Owner updates" on public.studio_projects for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Owner deletes" on public.studio_projects for delete to authenticated using (auth.uid()=user_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('assets','assets',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy "Owner uploads" on storage.objects for insert to authenticated with check(bucket_id='assets' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Owner views" on storage.objects for select to authenticated using(bucket_id='assets' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Owner removes" on storage.objects for delete to authenticated using(bucket_id='assets' and (storage.foldername(name))[1]=auth.uid()::text);
