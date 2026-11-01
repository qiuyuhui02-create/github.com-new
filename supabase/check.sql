-- Read-only audit; run BEFORE and AFTER schema.sql in Supabase SQL Editor.
-- If table is absent, catalog queries still return normally.
select table_schema,table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public' and table_name='studio_projects' order by ordinal_position;
select n.nspname,c.relname,c.relrowsecurity as rls_enabled,c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='studio_projects';
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where (schemaname='public' and tablename='studio_projects') or (schemaname='storage' and tablename='objects') order by schemaname,policyname;
select routine_schema,routine_name,security_type from information_schema.routines where routine_schema='public' and routine_name='save_studio_project';
select grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='studio_projects';
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='assets';
-- Do not use SQL Editor's postgres role to validate user isolation: it bypasses RLS.
select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid=to_regclass('public.studio_projects');
