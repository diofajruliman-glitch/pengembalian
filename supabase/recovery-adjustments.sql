-- Additive, private workbook snapshots; no updates to the existing recovery master.
begin;
create schema if not exists recovery_adjustments;
revoke all on schema recovery_adjustments from public, anon, authenticated;

create table if not exists recovery_adjustments.imports (
 id bigint generated always as identity primary key,
 sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
 rule_version text not null,
 manifest jsonb not null,
 expected_rows integer not null check(expected_rows between 1 and 200000),
 imported_by uuid not null references auth.users(id),
 started_at timestamptz not null default now(),
 imported_at timestamptz,
 active boolean not null default false,
 unique(sha256,rule_version)
);
create unique index if not exists adjustments_one_active on recovery_adjustments.imports(active) where active;
create table if not exists recovery_adjustments.records (
 import_id bigint not null references recovery_adjustments.imports(id),
 source_row integer not null,
 data jsonb not null,
 nip text generated always as (data->>'nip') stored,
 primary key(import_id,source_row),
 check(data->>'nip' ~ '^[0-9]{18}$'),
 check(jsonb_typeof(data->'source')='array'),
 check(jsonb_typeof(data->'reasons')='array'),
 check(jsonb_typeof(data->'evidence')='array'),
 check(data->>'month' in ('Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember')),
 check(jsonb_typeof(data->'periodYear')='number'),
 check(jsonb_typeof(data->'initial') in ('number','null')),
 check(jsonb_typeof(data->'final') in ('number','null')),
 check(jsonb_typeof(data->'delta') in ('number','null'))
);
create unique index if not exists adjustments_period_unique on recovery_adjustments.records(import_id,nip,(data->>'periodYear'),(data->>'month'));
alter table recovery_adjustments.imports enable row level security;
alter table recovery_adjustments.records enable row level security;
create index if not exists adjustments_nip on recovery_adjustments.records(nip,import_id);
create index if not exists adjustments_old on recovery_adjustments.records(import_id,(data->>'sp2dOld'));
create index if not exists adjustments_update on recovery_adjustments.records(import_id,(data->>'sp2dUpdated'));
create index if not exists adjustments_bpk on recovery_adjustments.records(import_id,(data->>'bpk'));
revoke all on all tables in schema recovery_adjustments from public,anon,authenticated;
revoke all on all sequences in schema recovery_adjustments from public,anon,authenticated;

create or replace function recovery_adjustments.default_primary_reason(d jsonb)
returns text language plpgsql immutable set search_path=pg_catalog as $$
declare k text;
begin
 if d->>'delta' is null then return 'MISSING'; end if;
 if not coalesce((d->>'changed')::boolean,false) then return 'UNCHANGED'; end if;
 foreach k in array array['TENDIK','MATERNITY','LEAVE','WIT','WITA','ATTENDANCE'] loop
  if exists(select 1 from jsonb_array_elements(d->'evidence') e where e->>'reason'=k and (e->>'origin'='keterangan sumber' or (k='TENDIK' and coalesce(d->>'note','') ~* '(^|[^A-Za-z])TENDIK([^A-Za-z]|$)'))) then return k; end if;
 end loop;
 foreach k in array array['TENDIK','MATERNITY','LEAVE','WIT','WITA','ATTENDANCE'] loop
  if d->'reasons' ? k then return k; end if;
 end loop;
 return 'ATTENDANCE';
end $$;

create or replace function recovery_adjustments.primary_reason(d jsonb)
returns text language plpgsql immutable set search_path=pg_catalog as $$
declare k text; specific text; pattern text;
begin
 if d->>'delta' is null or not coalesce((d->>'changed')::boolean,false) then return recovery_adjustments.default_primary_reason(d); end if;
 specific=coalesce(d->'source'->>40,case when strpos(coalesce(d->>'note',''),' · ')>0 then split_part(d->>'note',' · ',2) else '' end);
 foreach k in array array['TENDIK','MATERNITY','LEAVE','WIT','WITA'] loop
  pattern=case k when 'TENDIK' then '(^|[^A-Za-z])TENDIK([^A-Za-z]|$)' when 'MATERNITY' then 'MELAHIRKAN' when 'LEAVE' then 'CUTI' when 'WIT' then '(^|[^A-Za-z])WIT([^A-Za-z]|$)' when 'WITA' then '(^|[^A-Za-z])WITA([^A-Za-z]|$)' end;
  if specific ~* pattern and d->'reasons' ? k then return k; end if;
 end loop;
 return recovery_adjustments.default_primary_reason(d);
end $$;

create or replace function recovery_adjustments.matches(d jsonb, f jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare k text; v text;
begin
 if length(coalesce(f->>'search',''))>100 then return false; end if;
 if coalesce(f->>'search','')<>'' and strpos(lower(coalesce(d->>'nip','')||' '||coalesce(d->>'name','')),lower(trim(f->>'search')))=0 then return false; end if;
 foreach k in array array['sp2dOld','sp2dUpdated','bpk','month','zone','tendik','leave','statusInitial','statusFinal'] loop
  v=f->>k;
  if v='__EMPTY__' then
   if coalesce(d->>k,'')<>'' then return false; end if;
  elsif coalesce(v,'')<>'' and coalesce(d->>k,'')<>v then return false;
  end if;
 end loop;
 if f->>'change'='amount' and not coalesce((d->>'changed')::boolean,false) then return false; end if;
 if f->>'change'='any' and not (coalesce((d->>'changed')::boolean,false) or coalesce((d->>'statusChanged')::boolean,false)) then return false; end if;
 if f->>'change'='unchanged' and (coalesce((d->>'changed')::boolean,false) or coalesce((d->>'statusChanged')::boolean,false)) then return false; end if;
 if f->>'change'='missing' and d->>'delta' is not null then return false; end if;
 if coalesce(f->>'reason','')<>'' and not (d->'reasons' ? (f->>'reason')) then return false; end if;
 if coalesce(f->>'primaryReason','')<>'' and recovery_adjustments.primary_reason(d)<>f->>'primaryReason' then return false; end if;
 if f->>'sourcePriority'='changed' and recovery_adjustments.primary_reason(d)=recovery_adjustments.default_primary_reason(d) then return false; end if;
 return true;
end $$;

create or replace function public.recovery_adjustment_read(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set statement_timeout='30s' as $$
declare current_import recovery_adjustments.imports%rowtype; answer jsonb; requested_page integer; current_page integer; total integer;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') not in ('admin','editor','viewer') then raise exception 'FORBIDDEN'; end if;
 if p_action='history' then
  if coalesce(p_payload->>'nip','') !~ '^[0-9]{18}$' then raise exception 'INVALID_NIP'; end if;
  select jsonb_build_object(
   'rows',coalesce((select jsonb_agg(r.data||jsonb_build_object('importId',i.id,'fileName',i.manifest->>'fileName','headers',i.manifest->'headers','importedAt',i.imported_at) order by i.id,(r.data->>'periodYear')::integer,array_position(array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'],r.data->>'month')) from recovery_adjustments.records r join recovery_adjustments.imports i on i.id=r.import_id where i.imported_at is not null and r.nip=p_payload->>'nip'),'[]'::jsonb),
   'imports',coalesce((select jsonb_agg(jsonb_build_object('importId',id,'fileName',manifest->>'fileName','sha256',sha256,'ruleVersion',rule_version,'importedAt',imported_at) order by id) from recovery_adjustments.imports i where imported_at is not null and exists(select 1 from recovery_adjustments.records r where r.import_id=i.id and r.nip=p_payload->>'nip')),'[]'::jsonb)
  ) into answer;
  return answer;
 end if;
 select * into current_import from recovery_adjustments.imports where active and imported_at is not null;
 if current_import.id is null then raise exception 'Lampiran belum diimpor ke Supabase.'; end if;
 if p_action='manifest' then return current_import.manifest||jsonb_build_object('source','database','importId',current_import.id,'importedAt',current_import.imported_at); end if;
 if p_action<>'query' then raise exception 'UNKNOWN_ACTION'; end if;
 requested_page=greatest(0,least(100000,coalesce((p_payload->>'page')::integer,0)));
 select count(*) into total from recovery_adjustments.records where import_id=current_import.id and recovery_adjustments.matches(data,coalesce(p_payload->'filters','{}'::jsonb));
 current_page=least(requested_page,greatest(0,(total-1)/25));
 with selected as materialized (
  select data from recovery_adjustments.records where import_id=current_import.id and recovery_adjustments.matches(data,coalesce(p_payload->'filters','{}'::jsonb))
 ), groups as (
  select grouping(data->'sp2dOld') old_absent,grouping(data->'sp2dUpdated') update_absent,grouping(data->'bpk') bpk_absent,
   data->'sp2dOld' old_year,data->'sp2dUpdated' updated_year,data->'bpk' bpk,
   jsonb_build_object('rows',count(*),'people',count(distinct data->>'nip'),'changed',count(*) filter(where (data->>'changed')::boolean),'statusChanged',count(*) filter(where (data->>'statusChanged')::boolean),
    'initial',coalesce(sum((data->>'initial')::numeric),0),'final',coalesce(sum((data->>'final')::numeric),0),'delta',coalesce(sum((data->>'delta')::numeric),0),
    'missingInitial',count(*) filter(where data->>'initial' is null),'missingFinal',count(*) filter(where data->>'final' is null),'missingDelta',count(*) filter(where data->>'delta' is null)) stats
  from selected group by grouping sets((),(data->'sp2dOld',data->'bpk'),(data->'sp2dUpdated',data->'bpk'),(data->'sp2dOld',data->'sp2dUpdated',data->'bpk'))
 ) select jsonb_build_object(
  'rows',coalesce((select jsonb_agg(data-'source' order by abs(coalesce((data->>'delta')::numeric,0)) desc,data->>'nip',data->>'month') from (select data from selected order by abs(coalesce((data->>'delta')::numeric,0)) desc,data->>'nip',data->>'month' limit 25 offset current_page*25) page_rows),'[]'::jsonb),
  'summary',(select stats from groups where old_absent=1 and update_absent=1 and bpk_absent=1),
  'page',current_page,'pageSize',25,
  'recaps',jsonb_build_object(
   'sourcePriority',coalesce((select jsonb_agg(x.stats order by x.stats->'values') from (
    select jsonb_build_object('values',jsonb_build_array(data->>'month'),'rows',count(*),'people',count(distinct data->>'nip'),
     'changed',count(*) filter(where (data->>'changed')::boolean),'statusChanged',count(*) filter(where (data->>'statusChanged')::boolean),
     'initial',coalesce(sum((data->>'initial')::numeric),0),'final',coalesce(sum((data->>'final')::numeric),0),'delta',coalesce(sum((data->>'delta')::numeric),0),
     'missingInitial',count(*) filter(where data->>'initial' is null),'missingFinal',count(*) filter(where data->>'final' is null),'missingDelta',count(*) filter(where data->>'delta' is null)) stats
    from selected where recovery_adjustments.primary_reason(data)<>recovery_adjustments.default_primary_reason(data) group by data->>'month'
   ) x),'[]'::jsonb),
   'reasons',coalesce((select jsonb_agg(x.stats order by x.stats->'values') from (
    select jsonb_build_object('values',jsonb_build_array(recovery_adjustments.primary_reason(data),data->>'month'),
     'rows',count(*),'people',count(distinct data->>'nip'),'changed',count(*) filter(where (data->>'changed')::boolean),'statusChanged',count(*) filter(where (data->>'statusChanged')::boolean),
     'initial',coalesce(sum((data->>'initial')::numeric),0),'final',coalesce(sum((data->>'final')::numeric),0),'delta',coalesce(sum((data->>'delta')::numeric),0),
     'reduction',coalesce(sum(greatest(0,-(data->>'delta')::numeric)),0),'increase',coalesce(sum(greatest(0,(data->>'delta')::numeric)),0),
     'automaticRows',count(*) filter(where (data->>'changed')::boolean and not (recovery_adjustments.primary_reason(data)='TENDIK' and coalesce(data->>'note','') ~* '(^|[^A-Za-z])TENDIK([^A-Za-z]|$)') and not exists(select 1 from jsonb_array_elements(data->'evidence') e where e->>'reason'=recovery_adjustments.primary_reason(data) and e->>'origin'='keterangan sumber')),
     'missingInitial',count(*) filter(where data->>'initial' is null),'missingFinal',count(*) filter(where data->>'final' is null),'missingDelta',count(*) filter(where data->>'delta' is null)) stats
    from selected group by recovery_adjustments.primary_reason(data),data->>'month'
   ) x),'[]'::jsonb),
   'old',coalesce((select jsonb_agg(stats||jsonb_build_object('values',jsonb_build_array(old_year,bpk)) order by old_year,bpk) from groups where old_absent=0 and update_absent=1),'[]'::jsonb),
   'updated',coalesce((select jsonb_agg(stats||jsonb_build_object('values',jsonb_build_array(updated_year,bpk)) order by updated_year,bpk) from groups where old_absent=1 and update_absent=0),'[]'::jsonb),
   'transition',coalesce((select jsonb_agg(stats||jsonb_build_object('values',jsonb_build_array(old_year,updated_year,bpk)) order by old_year,updated_year,bpk) from groups where old_absent=0 and update_absent=0),'[]'::jsonb)
  )
 ) into answer;
 return answer;
end $$;

create or replace function public.recovery_adjustment_import(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set statement_timeout='60s' as $$
declare batch recovery_adjustments.imports%rowtype; m jsonb; record jsonb; actual integer; initial_total numeric; final_total numeric; people_total integer;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(418726);
 if p_action='begin' then
  m=p_payload->'manifest';
  if jsonb_typeof(m->'headers')<>'array' or jsonb_array_length(m->'headers')<>42 or coalesce(m->>'sheet','')<>'3 bulan'
   or m->'headers'->>1 is distinct from 'NIP' or m->'headers'->>20 is distinct from 'PENGEMBALIAN AWAL' or m->'headers'->>18 is distinct from 'FINAL PENGEMBALIAN' then raise exception 'INVALID_MANIFEST'; end if;
  insert into recovery_adjustments.imports(sha256,rule_version,manifest,expected_rows,imported_by)
   values(m->>'sha256',m->>'ruleVersion',m,(m->>'expectedRows')::integer,auth.uid()) on conflict(sha256,rule_version) do nothing;
  select * into batch from recovery_adjustments.imports where sha256=m->>'sha256' and rule_version=m->>'ruleVersion';
  if batch.manifest-'preparedAt'<>m-'preparedAt' then raise exception 'MANIFEST_MISMATCH'; end if;
  return jsonb_build_object('id',batch.id,'committed',batch.imported_at is not null);
 end if;
 select * into batch from recovery_adjustments.imports where id=(p_payload->>'id')::bigint for update;
 if batch.id is null then raise exception 'BATCH_NOT_FOUND'; end if;
 if p_action='commit' and batch.imported_at is not null then return jsonb_build_object('id',batch.id,'committed',true); end if;
 if batch.imported_at is not null then raise exception 'IMMUTABLE_IMPORT'; end if;
 if p_action='append' then
  if jsonb_typeof(p_payload->'records')<>'array' or jsonb_array_length(p_payload->'records')>250 then raise exception 'INVALID_CHUNK'; end if;
  for record in select value from jsonb_array_elements(p_payload->'records') loop
   if not(record ?& array['nip','name','sourceRow','month','periodYear','initial','final','delta','changed','statusChanged','source','reasons','evidence']) then raise exception 'INVALID_RECORD'; end if;
   if jsonb_array_length(record->'source')<>42 then raise exception 'INVALID_SOURCE'; end if;
   if record->>'nip' is distinct from record->'source'->>1 then raise exception 'SOURCE_NIP_MISMATCH'; end if;
   if (record->>'sourceRow')::integer<2 then raise exception 'INVALID_SOURCE_ROW'; end if;
   if jsonb_typeof(record->'changed')<>'boolean' or jsonb_typeof(record->'statusChanged')<>'boolean' then raise exception 'INVALID_CHANGE_FLAG'; end if;
   if record->'initial' is distinct from record->'source'->20 or record->'final' is distinct from record->'source'->18 then raise exception 'SOURCE_AMOUNT_MISMATCH'; end if;
   if (record->>'initial') is null or (record->>'final') is null then
    if record->>'delta' is not null or (record->>'changed')::boolean then raise exception 'MISSING_IS_NOT_ZERO'; end if;
   elsif abs((record->>'delta')::numeric-((record->>'final')::numeric-(record->>'initial')::numeric))>0.000001 or (record->>'changed')::boolean<>((record->>'final')::numeric<>(record->>'initial')::numeric) then raise exception 'INVALID_DELTA';
   end if;
   if exists(select 1 from recovery_adjustments.records where import_id=batch.id and source_row=(record->>'sourceRow')::integer and data<>record) then raise exception 'ROW_MISMATCH'; end if;
   insert into recovery_adjustments.records(import_id,source_row,data) values(batch.id,(record->>'sourceRow')::integer,record) on conflict(import_id,source_row) do nothing;
  end loop;
  return jsonb_build_object('id',batch.id,'accepted',jsonb_array_length(p_payload->'records'));
 elsif p_action='commit' then
  select count(*),count(distinct nip),coalesce(sum((data->>'initial')::numeric),0),coalesce(sum((data->>'final')::numeric),0) into actual,people_total,initial_total,final_total from recovery_adjustments.records where import_id=batch.id;
  if actual<>batch.expected_rows then raise exception 'INCOMPLETE_IMPORT'; end if;
  if people_total<>(batch.manifest->'summary'->>'people')::integer or abs(initial_total-(batch.manifest->'summary'->>'initial')::numeric)>0.01 or abs(final_total-(batch.manifest->'summary'->>'final')::numeric)>0.01 then raise exception 'TOTAL_MISMATCH'; end if;
  update recovery_adjustments.imports set active=false where active;
  update recovery_adjustments.imports set imported_at=now(),active=true where id=batch.id;
  return jsonb_build_object('id',batch.id,'committed',true,'rows',actual);
 end if;
 raise exception 'UNKNOWN_ACTION';
end $$;
revoke all on all functions in schema recovery_adjustments from public,anon,authenticated;
revoke all on function public.recovery_adjustment_read(text,jsonb) from public,anon;
revoke all on function public.recovery_adjustment_import(text,jsonb) from public,anon;
grant execute on function public.recovery_adjustment_read(text,jsonb) to authenticated;
grant execute on function public.recovery_adjustment_import(text,jsonb) to authenticated;
commit;
