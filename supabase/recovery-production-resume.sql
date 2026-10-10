-- Retry-safe begin; same permissions and same import workflow. Does not alter data.
begin;
create or replace function recovery_live.recovery_begin(p_name text,p_hash text,p_rows integer,p_totals jsonb) returns uuid
language plpgsql security definer set search_path=recovery_live,pg_catalog as $$
declare batch uuid; rev bigint; previous recovery_imports;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') <>'admin' then raise exception 'FORBIDDEN'; end if;
 if p_hash !~ '^[a-f0-9]{64}$' or p_rows<1 or p_rows>500000 or nullif(btrim(p_name),'') is null then raise exception 'INVALID_MANIFEST';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'|'||p_hash,0));
 if exists(select 1 from recovery_imports where file_sha256=p_hash and status='committed') then raise exception 'FILE_ALREADY_COMMITTED';end if;
 select revision into rev from recovery_revision where id=1;
 select * into previous from recovery_imports where actor=auth.uid() and file_sha256=p_hash and status in ('preview','validated') order by created_at desc limit 1 for update;
 if found then
  if previous.base_revision<>rev then raise exception 'STALE_PREVIEW';end if;
  if previous.expected_rows<>p_rows or previous.expected_totals is distinct from p_totals then raise exception 'MANIFEST_REQUIRES_REVIEW';end if;
  return previous.id;
 end if;
 insert into recovery_imports(file_name,file_sha256,actor,expected_rows,base_revision,expected_totals)
 values(p_name,p_hash,auth.uid(),p_rows,rev,p_totals) returning id into batch;
 return batch;
end $$;
commit;
