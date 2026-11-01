-- Apply AFTER schema.sql, using SQL Editor. Does not rewrite or delete existing rows.
-- Enforce lightweight metadata for all NEW project writes, including direct REST writes.
begin;
create or replace function public.validate_studio_metadata()
returns trigger language plpgsql security invoker set search_path='' as $$
declare leaf jsonb; value text;
begin
 if octet_length(new.data::text)>2097152 then raise exception 'Metadata exceeds 2MB; keep media on Mac' using errcode='22023'; end if;
 for leaf in select jsonb_path_query(new.data,'$.** ? (@.type() == "string")') loop
  value := leaf #>> '{}';
  if value like '/%' and value !~* '^/art/[a-z0-9_-]+\.svg$' then raise exception 'Absolute path not allowed' using errcode='22023'; end if;
  if value ~* '(^|[[:space:]])(data:|blob:|file://|[a-z]:[\\/])|/(Users|Volumes|private|home)/|^~[\\/]' then
   raise exception 'Binary payload or absolute path is not allowed in cloud metadata' using errcode='22023';
  end if;
 end loop;
 return new;
end;
$$;
drop trigger if exists studio_metadata_only on public.studio_projects;
create trigger studio_metadata_only before insert or update of data on public.studio_projects for each row execute function public.validate_studio_metadata();
commit;
