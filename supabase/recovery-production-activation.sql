-- PRODUCTION MASTER ACTIVATION PACKAGE. Review before applying.
-- Creates a separate empty schema; never copies simulated data or inserts cases.
-- Admin-only wrapper; private tables/functions remain inaccessible to app roles.
begin;
do $$begin
 if to_regprocedure('public.current_app_role()') is null or to_regclass('public.sdm_cases') is null then raise exception 'PRODUCTION_PREREQUISITES_MISSING';end if;
 if exists(select 1 from pg_namespace where nspname='recovery_live') or to_regprocedure('public.recovery_master_rpc(text,jsonb)') is not null then raise exception 'PRODUCTION_ALREADY_INITIALIZED_REVIEW_REQUIRED';end if;
end $$;
create schema recovery_live;
revoke all on schema recovery_live from public,anon,authenticated;
set local search_path=recovery_live,pg_catalog;



create table recovery_live.recovery_people (
 nip text primary key check(nip ~ '^[0-9]{18}$'),
 nama text not null, provinsi text, bank text not null check(bank in ('Mandiri','BRI','BSI')),
 status_sdm text, archived_at timestamptz, created_at timestamptz not null default now()
);
create table recovery_live.recovery_sp2d (
 id bigint generated always as identity primary key,
 nomor text not null, tanggal date not null, tahun integer not null,
 jenis text not null check(jenis in ('TUKIN','UM')),
 unique(nomor,tahun,jenis)
);
create table recovery_live.recovery_imports (
 id uuid primary key default gen_random_uuid(), file_name text not null,
 file_sha256 text not null, source_cutoff date,
 status text not null default 'preview' check(status in ('preview','validated','committed','rejected')),
 actor uuid not null references auth.users(id), created_at timestamptz not null default now(),
 summary jsonb not null default '{}'
);
create table recovery_live.recovery_obligations (
 id bigint generated always as identity primary key,
 nip text not null references recovery_live.recovery_people(nip),
 bank text not null check(bank in ('Mandiri','BRI','BSI')),
 jenis text not null check(jenis in ('TUKIN','UM')), tahun_kewajiban integer not null,
 nominal bigint not null check(nominal>=0),
 source_import uuid not null references recovery_live.recovery_imports(id),
 unique(nip,bank,jenis,tahun_kewajiban)
);

create table recovery_live.recovery_sp2d_allocations (
 obligation_id bigint not null references recovery_live.recovery_obligations(id),
 sp2d_id bigint not null references recovery_live.recovery_sp2d(id),
 nominal bigint not null check(nominal>=0), primary key(obligation_id,sp2d_id)
);
create table recovery_live.recovery_payments (
 id bigint generated always as identity primary key,
 obligation_id bigint not null references recovery_live.recovery_obligations(id),
 tahap integer not null check(tahap>0),
 tanggal_pengembalian date, tahun_pengembalian integer,
 nominal bigint not null check(nominal>=0), bukti text,
 verification text not null default 'pending' check(verification in ('pending','verified','rejected')),
 verified_by uuid references auth.users(id), verified_at timestamptz,
 source_import uuid not null references recovery_live.recovery_imports(id),
 unique(obligation_id,tahap),
 check(verification<>'verified' or (nullif(btrim(bukti),'') is not null and tanggal_pengembalian is not null and verified_by is not null and verified_at is not null))
);

create table recovery_live.recovery_changes (
 id bigint generated always as identity primary key,
 import_id uuid not null references recovery_live.recovery_imports(id),
 actor uuid not null references auth.users(id), entity text not null, record_key text not null,
 before_data jsonb, after_data jsonb not null, reason text not null,
 created_at timestamptz not null default now()
);
do $$ declare tbl text; begin
 foreach tbl in array array['recovery_people','recovery_sp2d','recovery_imports','recovery_obligations','recovery_sp2d_allocations','recovery_payments','recovery_changes'] loop
  execute format('alter table recovery_live.%I enable row level security',tbl);
  execute format('revoke all on recovery_live.%I from anon, authenticated',tbl);

  execute format('create policy authorized_read on recovery_live.%I for select to authenticated using ((select public.current_app_role()) in (''admin'',''editor'',''viewer''))',tbl);
 end loop;
end $$;





create table recovery_live.recovery_revision(id integer primary key check(id=1), revision bigint not null);
insert into recovery_live.recovery_revision values(1,0);
alter table recovery_live.recovery_revision enable row level security;
revoke all on recovery_live.recovery_revision from anon,authenticated;
alter table recovery_live.recovery_imports add column expected_rows integer not null default 0;
alter table recovery_live.recovery_imports add column base_revision bigint not null default 0;
alter table recovery_live.recovery_imports add column expected_totals jsonb not null default '{}';
create unique index recovery_file_committed on recovery_live.recovery_imports(file_sha256) where status='committed';
create table recovery_live.recovery_staging (
 import_id uuid not null references recovery_live.recovery_imports(id),
 record_type text not null check(record_type in ('person','obligation','payment')),
 record_key text not null, data jsonb not null,
 obligation_key text generated always as ((data->>'nip')||'|'||(data->>'bank')||'|'||(data->>'kind')||'|'||(data->>'year')) stored,
 primary key(import_id,record_type,record_key)
);
create index recovery_staging_obligation on recovery_live.recovery_staging(import_id,record_type,obligation_key);
alter table recovery_live.recovery_staging enable row level security;
revoke all on recovery_live.recovery_staging from anon,authenticated;

create function recovery_live.recovery_begin(p_name text,p_hash text,p_rows integer,p_totals jsonb) returns uuid
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

create function recovery_live.recovery_record_key(t text,d jsonb) returns text language sql immutable strict as $$select (d->>'nip')||case when t='person' then '' else '|'||(d->>'bank')||'|'||(d->>'kind')||'|'||(d->>'year')||case when t='payment' then '|'||(d->>'stage') else '' end end$$;
revoke all on function recovery_live.recovery_record_key(text,jsonb) from public,anon,authenticated;

create function recovery_live.recovery_append(p_batch uuid,p_records jsonb) returns integer
language plpgsql security definer set search_path=recovery_live,pg_catalog as $$
declare b recovery_imports; r jsonb; d jsonb; k text; t text; added integer:=0;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') <>'admin' then raise exception 'FORBIDDEN';end if;
 select * into b from recovery_imports where id=p_batch for update;
 if not found or b.actor<>auth.uid() or b.status<>'preview' then raise exception 'BATCH_NOT_WRITABLE';end if;
 if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)>1000 then raise exception 'INVALID_CHUNK';end if;
 for r in select value from jsonb_array_elements(p_records) loop
  t:=r->>'type';d:=r->'data';
  if t not in ('person','obligation','payment') or jsonb_typeof(d)<>'object' or coalesce(d->>'nip','') !~ '^[0-9]{18}$' then raise exception 'INVALID_RECORD';end if;
  if coalesce(d->>'bank','') not in ('Mandiri','BRI','BSI') then raise exception 'INVALID_BANK';end if;
  k:=d->>'nip';
  if t='person' then if nullif(btrim(d->>'nama'),'') is null then raise exception 'MISSING_NAME';end if;
  else
   if coalesce(d->>'kind','') not in ('TUKIN','UM') or (d->>'year')::integer not between 2000 and 2100 or (d->>'amount')::numeric<0 or (d->>'amount')::numeric<>trunc((d->>'amount')::numeric) or d->>'amount' is null or d->>'year' is null then raise exception 'INVALID_MEASURE';end if;
   k:=concat_ws('|',k,d->>'bank',d->>'kind',d->>'year');
   if t='payment' then if d->>'stage' is null or (d->>'stage')::integer<1 then raise exception 'INVALID_STAGE';end if;k:=concat_ws('|',k,d->>'stage');end if;
  end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_records) item(value) group by item.value->>'type',recovery_live.recovery_record_key(item.value->>'type',item.value->'data') having count(distinct item.value->'data')>1) then raise exception 'CONFLICTING_RETRY';end if;
 if exists(select 1 from jsonb_array_elements(p_records) item(value) join recovery_staging s on s.import_id=p_batch and s.record_type=item.value->>'type' and s.record_key=recovery_live.recovery_record_key(item.value->>'type',item.value->'data') where s.data<>item.value->'data') then raise exception 'CONFLICTING_RETRY';end if;
 insert into recovery_staging(import_id,record_type,record_key,data)
 select distinct p_batch,item.value->>'type',recovery_live.recovery_record_key(item.value->>'type',item.value->'data'),item.value->'data' from jsonb_array_elements(p_records) item(value) on conflict do nothing;
 get diagnostics added=row_count;
 if (select count(*) from recovery_staging where import_id=p_batch)>b.expected_rows then raise exception 'TOO_MANY_ROWS';end if;
 return added;
end $$;

create function recovery_live.recovery_validate(p_batch uuid) returns jsonb
language plpgsql security definer set search_path=recovery_live,pg_catalog as $$
declare b recovery_imports; actual jsonb; corrections bigint;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') <>'admin' then raise exception 'FORBIDDEN';end if;
 select * into b from recovery_imports where id=p_batch for update;
 if not found or b.actor<>auth.uid() or b.status not in ('preview','validated') then raise exception 'INVALID_BATCH';end if;
 if (select count(*) from recovery_staging where import_id=p_batch)<>b.expected_rows then raise exception 'INCOMPLETE_BATCH';end if;
 if b.base_revision<>(select revision from recovery_revision where id=1) then raise exception 'STALE_PREVIEW';end if;
 analyze recovery_live.recovery_staging;
 if exists(select 1 from recovery_staging s join recovery_people p on p.nip=s.data->>'nip'
  where s.import_id=p_batch and s.record_type='person' and
   upper(regexp_replace(btrim(p.nama),'\s+',' ','g'))<>upper(regexp_replace(btrim(s.data->>'nama'),'\s+',' ','g')))
 then raise exception 'PERSON_CHANGE_REQUIRES_REVIEW';end if;

 if exists(select 1 from recovery_staging s where s.import_id=p_batch and s.record_type<>'person' and not exists(select 1 from recovery_staging p where p.import_id=p_batch and p.record_type='person' and p.record_key=s.data->>'nip' and p.data->>'bank'=s.data->>'bank')) then raise exception 'MISSING_PERSON';end if;
 if exists(select 1 from recovery_staging s where s.import_id=p_batch and s.record_type='person' and exists(select 1 from recovery_people p where p.nip=s.data->>'nip' and p.bank<>s.data->>'bank')) then raise exception 'BANK_CHANGE_REQUIRES_REVIEW';end if;
 if exists(select 1 from recovery_staging s where s.import_id=p_batch and s.record_type='payment' and not exists(select 1 from recovery_staging o where o.import_id=p_batch and o.record_type='obligation' and o.record_key=concat_ws('|',s.data->>'nip',s.data->>'bank',s.data->>'kind',s.data->>'year'))) then raise exception 'MISSING_OBLIGATION';end if;
 if exists(select 1 from recovery_staging o join (
  select obligation_key,sum((data->>'amount')::bigint) nominal from recovery_staging where import_id=p_batch and record_type='payment' group by obligation_key
 ) p on p.obligation_key=o.record_key where o.import_id=p_batch and o.record_type='obligation' and p.nominal>(o.data->>'amount')::bigint) then raise exception 'OVERPAYMENT';end if;
 select jsonb_object_agg(bank,totals) into actual from (
  select data->>'bank' bank,jsonb_build_object('obligation',coalesce(sum((data->>'amount')::bigint) filter(where record_type='obligation'),0),'payment',coalesce(sum((data->>'amount')::bigint) filter(where record_type='payment'),0)) totals
  from recovery_staging where import_id=p_batch and record_type<>'person' group by data->>'bank') q;
 if actual is distinct from b.expected_totals then raise exception 'RECAP_MISMATCH';end if;


 if exists(select 1 from recovery_payments p join recovery_obligations o on o.id=p.obligation_id
  where p.nominal>0 and b.expected_totals ? o.bank and not exists(
   select 1 from recovery_staging s where s.import_id=p_batch and s.record_type='payment'
    and s.record_key=concat_ws('|',o.nip,o.bank,o.jenis,o.tahun_kewajiban,p.tahap)
  )) then raise exception 'MISSING_HISTORY_REQUIRES_REVIEW';end if;
 select count(*) into corrections from recovery_staging s join recovery_obligations o on o.nip=s.data->>'nip' and o.bank=s.data->>'bank' and o.jenis=s.data->>'kind' and o.tahun_kewajiban=(s.data->>'year')::integer
 where s.import_id=p_batch and s.record_type='obligation' and o.nominal<>(s.data->>'amount')::bigint;
 update recovery_imports set status='validated',summary=jsonb_build_object('totals',actual,'obligationCorrections',corrections,
 'initialImport',not exists(select 1 from recovery_people) and not exists(select 1 from recovery_obligations) and not exists(select 1 from recovery_payments),
 'people',(select count(*) from recovery_staging where import_id=p_batch and record_type='person'),
 'obligations',(select count(*) from recovery_staging where import_id=p_batch and record_type='obligation'),
 'payments',(select count(*) from recovery_staging where import_id=p_batch and record_type='payment')) where id=p_batch;
 return jsonb_build_object('totals',actual,'obligationCorrections',corrections,
 'initialImport',not exists(select 1 from recovery_people) and not exists(select 1 from recovery_obligations) and not exists(select 1 from recovery_payments),
 'people',(select count(*) from recovery_staging where import_id=p_batch and record_type='person'),
 'obligations',(select count(*) from recovery_staging where import_id=p_batch and record_type='obligation'),
 'payments',(select count(*) from recovery_staging where import_id=p_batch and record_type='payment'));
end $$;

create function recovery_live.recovery_commit(p_batch uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=recovery_live,pg_catalog as $$
declare b recovery_imports; s record; d jsonb; old_o recovery_obligations; old_p recovery_payments; oid bigint; rev bigint; result jsonb; live_totals jsonb;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') <>'admin' then raise exception 'FORBIDDEN';end if;
 select revision into rev from recovery_revision where id=1 for update;
 select * into b from recovery_imports where id=p_batch for update;
 if not found or b.actor<>auth.uid() then raise exception 'INVALID_BATCH';end if;
 if b.status='committed' then return b.summary;end if;
 if b.status<>'validated' then raise exception 'NOT_VALIDATED';end if;
 result:=recovery_validate(p_batch);
 if nullif(btrim(p_reason),'') is null then raise exception 'REASON_REQUIRED';end if;
 for s in select data from recovery_staging where import_id=p_batch and record_type='person' loop
  d:=s.data;insert into recovery_people(nip,nama,provinsi,bank) values(d->>'nip',d->>'nama',d->>'provinsi',d->>'bank') on conflict(nip) do nothing;
 end loop;
 for s in select data,record_key from recovery_staging where import_id=p_batch and record_type='obligation' loop
  d:=s.data;select * into old_o from recovery_obligations where nip=d->>'nip' and bank=d->>'bank' and jenis=d->>'kind' and tahun_kewajiban=(d->>'year')::integer;
  if old_o.id is null or old_o.nominal<>(d->>'amount')::bigint then
   insert into recovery_changes(import_id,actor,entity,record_key,before_data,after_data,reason) values(p_batch,auth.uid(),'obligation',s.record_key,case when old_o.id is null then null else to_jsonb(old_o) end,d,p_reason);
   insert into recovery_obligations(nip,bank,jenis,tahun_kewajiban,nominal,source_import) values(d->>'nip',d->>'bank',d->>'kind',(d->>'year')::integer,(d->>'amount')::bigint,p_batch) on conflict(nip,bank,jenis,tahun_kewajiban) do update set nominal=excluded.nominal,source_import=excluded.source_import;
  end if;
 end loop;
 for s in select data,record_key from recovery_staging where import_id=p_batch and record_type='payment' loop
  d:=s.data;select id into oid from recovery_obligations where nip=d->>'nip' and bank=d->>'bank' and jenis=d->>'kind' and tahun_kewajiban=(d->>'year')::integer;
  select * into old_p from recovery_payments where obligation_id=oid and tahap=(d->>'stage')::integer;
  if old_p.id is null or old_p.nominal<>(d->>'amount')::bigint then
   insert into recovery_changes(import_id,actor,entity,record_key,before_data,after_data,reason) values(p_batch,auth.uid(),'payment',s.record_key,case when old_p.id is null then null else to_jsonb(old_p) end,d,p_reason);
   insert into recovery_payments(obligation_id,tahap,nominal,source_import) values(oid,(d->>'stage')::integer,(d->>'amount')::bigint,p_batch) on conflict(obligation_id,tahap) do update set nominal=excluded.nominal,source_import=excluded.source_import,verification='pending',verified_by=null,verified_at=null;
  end if;
 end loop;

 if exists(select 1 from recovery_obligations o where (select coalesce(sum(p.nominal),0) from recovery_payments p where p.obligation_id=o.id)>o.nominal) then raise exception 'LEDGER_OVERPAYMENT';end if;
 if exists(select 1 from recovery_obligations o where (select coalesce(sum(a.nominal),0) from recovery_sp2d_allocations a where a.obligation_id=o.id)>o.nominal) then raise exception 'SP2D_ALLOCATION_EXCEEDS_OBLIGATION';end if;
 select jsonb_object_agg(bank,totals) into live_totals from (
  select o.bank,jsonb_build_object('obligation',sum(o.nominal),'payment',sum((select coalesce(sum(p.nominal),0) from recovery_payments p where p.obligation_id=o.id))) totals
  from recovery_obligations o where b.expected_totals ? o.bank group by o.bank
 ) q;
 if live_totals is distinct from b.expected_totals then raise exception 'LIVE_RECAP_MISMATCH_MISSING_HISTORY_REQUIRES_REVIEW';end if;
 update recovery_imports set status='committed' where id=p_batch;
 update recovery_revision set revision=revision+1 where id=1;
 return result;
end $$;
create function recovery_live.recovery_diff(p_batch uuid,p_offset integer default 0,p_limit integer default 50) returns table(record_type text,record_key text,nip text,bank text,kind text,year integer,stage integer,before_amount bigint,after_amount bigint)
language plpgsql security definer set search_path=recovery_live,pg_catalog as $$
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') <>'admin' or not exists(select 1 from recovery_imports where id=p_batch and actor=auth.uid()) then raise exception 'FORBIDDEN';end if;
 if p_offset<0 or p_limit<1 or p_limit>100 then raise exception 'INVALID_PAGE';end if;
 return query select s.record_type,s.record_key,s.data->>'nip',s.data->>'bank',s.data->>'kind',(s.data->>'year')::integer,case when s.record_type='payment' then (s.data->>'stage')::integer else null end,
 case when s.record_type='obligation' then o.nominal else p.nominal end,(s.data->>'amount')::bigint
 from recovery_staging s left join recovery_obligations o on o.nip=s.data->>'nip' and o.bank=s.data->>'bank' and o.jenis=s.data->>'kind' and o.tahun_kewajiban=(s.data->>'year')::integer
 left join recovery_payments p on p.obligation_id=o.id and p.tahap=(s.data->>'stage')::integer
 where s.import_id=p_batch and s.record_type in ('obligation','payment') and (case when s.record_type='obligation' then o.nominal else p.nominal end) is distinct from (s.data->>'amount')::bigint
 order by s.record_type,s.record_key offset p_offset limit p_limit;
end $$;
revoke all on function recovery_live.recovery_diff(uuid,integer,integer) from public,anon;

revoke all on function recovery_live.recovery_begin(text,text,integer,jsonb),recovery_live.recovery_append(uuid,jsonb),recovery_live.recovery_validate(uuid),recovery_live.recovery_commit(uuid,text) from public,anon;





create table recovery_live.case_link_batches(
 id uuid primary key default gen_random_uuid(),actor uuid not null references auth.users(id),
 master_revision bigint not null,status text not null default 'preview' check(status in ('preview','committed')),
 reason text,summary jsonb,created_at timestamptz not null default now()
);
create table recovery_live.case_link_items(
 batch_id uuid not null references recovery_live.case_link_batches(id),case_id bigint not null,
 nip text not null,expected_case jsonb not null,primary key(batch_id,case_id)
);
create table recovery_live.case_master_links(
 case_id bigint primary key,nip text not null references recovery_live.recovery_people(nip),
 approved_by uuid not null references auth.users(id),master_revision bigint not null,
 batch_id uuid not null references recovery_live.case_link_batches(id),reason text not null,
 approved_at timestamptz not null default now()
);
create table recovery_live.case_link_audit(
 id bigint generated always as identity primary key,batch_id uuid not null references recovery_live.case_link_batches(id),
 case_id bigint not null,nip text not null,actor uuid not null references auth.users(id),
 case_at_approval jsonb not null,reason text not null,created_at timestamptz not null default now()
);
alter table recovery_live.case_link_batches enable row level security;
alter table recovery_live.case_link_items enable row level security;
alter table recovery_live.case_master_links enable row level security;
alter table recovery_live.case_link_audit enable row level security;
revoke all on all tables in schema recovery_live from public,anon,authenticated;
revoke all on all sequences in schema recovery_live from public,anon,authenticated;

create function recovery_live.check_link_case(p_case bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare c public.sdm_cases; p recovery_live.recovery_people; total bigint; paid bigint; verified bigint;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 select * into c from public.sdm_cases where id=p_case for share;
 if not found then raise exception 'CASE_NOT_FOUND';end if;
 if c.deleted_at is not null then raise exception 'CASE_ARCHIVED';end if;
 select * into p from recovery_live.recovery_people where nip=c.nip and archived_at is null;
 if not found then raise exception 'MASTER_PERSON_NOT_FOUND';end if;
 if upper(regexp_replace(btrim(c.nama),'\s+',' ','g'))<>upper(regexp_replace(btrim(p.nama),'\s+',' ','g')) then raise exception 'CASE_NAME_MISMATCH';end if;
 if c.bank<>p.bank then raise exception 'CASE_BANK_MISMATCH';end if;
 select sum(nominal) into total from recovery_live.recovery_obligations where nip=c.nip;
 if total is null or total<=0 then raise exception 'MASTER_OBLIGATION_NOT_FOUND';end if;
 select coalesce(sum(q.nominal),0),coalesce(sum(q.nominal) filter(where q.verification='verified'),0) into paid,verified
 from recovery_live.recovery_payments q join recovery_live.recovery_obligations o on o.id=q.obligation_id where o.nip=c.nip;
 if c.status='Lunas Terverifikasi' and (total<=0 or paid<total or verified<total) then raise exception 'CASE_VERIFICATION_REQUIRES_REVIEW';end if;
 return to_jsonb(c);
end $$;
create function recovery_live.prepare_case_links(p_revision bigint,p_cases jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare revision bigint; batch uuid; item jsonb; image jsonb; n integer;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 if jsonb_typeof(p_cases) is distinct from 'array' then raise exception 'INVALID_CASE_SELECTION';end if;
 n:=jsonb_array_length(p_cases);if n<1 or n>500 then raise exception 'INVALID_CASE_SELECTION';end if;
 if (select count(distinct value->>'caseId') from jsonb_array_elements(p_cases))<>n then raise exception 'DUPLICATE_CASE_SELECTION';end if;
 select r.revision into revision from recovery_live.recovery_revision r where id=1 for share;
 if p_revision is distinct from revision then raise exception 'STALE_MASTER';end if;
 insert into recovery_live.case_link_batches(actor,master_revision) values(auth.uid(),revision) returning id into batch;
 for item in select value from jsonb_array_elements(p_cases) order by (value->>'caseId')::bigint loop
  if nullif(item->>'expectedUpdatedAt','') is null then raise exception 'CASE_SNAPSHOT_REQUIRED';end if;
  image:=recovery_live.check_link_case((item->>'caseId')::bigint);
  if (image->>'updated_at')::timestamptz<>(item->>'expectedUpdatedAt')::timestamptz then raise exception 'STALE_CASE';end if;
  insert into recovery_live.case_link_items values(batch,(item->>'caseId')::bigint,image->>'nip',image);
 end loop;
 return batch;
end $$;
create function recovery_live.commit_case_links(p_batch uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare b recovery_live.case_link_batches; item record; image jsonb; revision bigint; old_nip text; linked integer:=0; existing integer:=0; result jsonb;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 select * into b from recovery_live.case_link_batches where id=p_batch for update;
 if not found or b.actor<>auth.uid() then raise exception 'FORBIDDEN';end if;
 if b.status='committed' then return b.summary;end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'REASON_REQUIRED';end if;
 select r.revision into revision from recovery_live.recovery_revision r where id=1 for share;
 if revision<>b.master_revision then raise exception 'STALE_MASTER';end if;
 for item in select * from recovery_live.case_link_items where batch_id=p_batch order by case_id loop
  image:=recovery_live.check_link_case(item.case_id);
  if image is distinct from item.expected_case then raise exception 'STALE_CASE';end if;
  select nip into old_nip from recovery_live.case_master_links where case_id=item.case_id for update;
  if found then
   if old_nip<>item.nip then raise exception 'EXISTING_LINK_CONFLICT';end if;
   existing:=existing+1;continue;
  end if;
  insert into recovery_live.case_master_links values(item.case_id,item.nip,auth.uid(),revision,p_batch,p_reason,now()) on conflict(case_id) do nothing returning nip into old_nip;
  if not found then
   select nip into old_nip from recovery_live.case_master_links where case_id=item.case_id;
   if old_nip<>item.nip then raise exception 'EXISTING_LINK_CONFLICT';end if;
   existing:=existing+1;continue;
  end if;
  insert into recovery_live.case_link_audit(batch_id,case_id,nip,actor,case_at_approval,reason) values(p_batch,item.case_id,item.nip,auth.uid(),image,p_reason);
  linked:=linked+1;
 end loop;
 result:=jsonb_build_object('linked',linked,'alreadyLinked',existing,'masterRevision',revision);
 update recovery_live.case_link_batches set status='committed',reason=p_reason,summary=result where id=p_batch;
 return result;
end $$;
revoke all on function recovery_live.check_link_case(bigint),recovery_live.prepare_case_links(bigint,jsonb),recovery_live.commit_case_links(uuid,text) from public,anon,authenticated;




create function recovery_live.linked_case_meta() returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 return jsonb_build_object('revision',(select revision from recovery_live.recovery_revision where id=1),
  'caseToken',md5(coalesce((select jsonb_agg(to_jsonb(c) order by c.id)::text from public.sdm_cases c),'[]')),
  'linkToken',md5(coalesce((select jsonb_agg(to_jsonb(l) order by l.case_id)::text from recovery_live.case_master_links l),'[]')),
  'cases',(select count(*) from public.sdm_cases where deleted_at is null));
end $$;
create function recovery_live.read_linked_cases(p_after bigint default 0,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 if p_after<0 or p_limit<1 or p_limit>100 then raise exception 'INVALID_PAGE';end if;
 return (
  with cases as materialized (select * from public.sdm_cases where deleted_at is null and id>p_after order by id limit p_limit),
  joined as (select c,to_jsonb(c)||jsonb_build_object('id',c.id::text) manual,to_jsonb(l) reference,
   l.case_id,l.nip link_nip,p.nip master_nip,p.nama master_name,p.bank master_bank,
   f.obligation,f.payment,f.verified
   from cases c left join recovery_live.case_master_links l on l.case_id=c.id
   left join recovery_live.recovery_people p on p.nip=l.nip and p.archived_at is null
   left join lateral (select sum(o.nominal) obligation,sum(coalesce(q.payment,0)) payment,sum(coalesce(q.verified,0)) verified
    from recovery_live.recovery_obligations o left join lateral (select sum(r.nominal) payment,sum(r.nominal) filter(where r.verification='verified') verified from recovery_live.recovery_payments r where r.obligation_id=o.id) q on true where o.nip=p.nip and o.nominal>0) f on true),
  checked as (select *,case_id is not null and link_nip=(c).nip and master_nip is not null and obligation is not null
    and master_bank=(c).bank and upper(regexp_replace(btrim(master_name),'\s+',' ','g'))=upper(regexp_replace(btrim((c).nama),'\s+',' ','g')) valid_reference from joined)
  select jsonb_build_object('revision',(select revision from recovery_live.recovery_revision where id=1),'rows',coalesce(jsonb_agg(
   jsonb_build_object('manual',manual,'reference',case when case_id is null then null else reference end,
    'source',case when case_id is null then 'Manual' when valid_reference then 'Master tersimpan' else 'Referensi perlu ditinjau' end,
    'finance',case when case_id is null then jsonb_build_object('obligation',(c).kewajiban_total,'payment',(c).realisasi_total,'remaining',(c).kewajiban_total-(c).realisasi_total,'verified',null)
      when valid_reference then jsonb_build_object('obligation',obligation,'payment',payment,'remaining',obligation-payment,'verified',verified) else null end,
    'warnings',case when case_id is not null and not coalesce(valid_reference,false) then jsonb_build_array('Referensi master berubah atau belum tersedia; periksa kembali')
      when valid_reference and (c).status='Lunas Terverifikasi' and (obligation>payment or verified<obligation) then jsonb_build_array('Status lunas manual belum didukung nominal/verifikasi master') else '[]'::jsonb end)
   order by (c).id),'[]'::jsonb)) from checked
 );
end $$;
revoke all on function recovery_live.linked_case_meta(),recovery_live.read_linked_cases(bigint,integer) from public,anon,authenticated;

revoke all on all tables in schema recovery_live from public,anon,authenticated;
revoke all on all sequences in schema recovery_live from public,anon,authenticated;
revoke all on all functions in schema recovery_live from public,anon,authenticated;



create function public.recovery_master_rpc(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog set statement_timeout='60s' as $$
declare page_limit integer;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then
  raise exception 'FORBIDDEN';
 end if;
 case p_action
 when 'recovery_read_meta' then
  return jsonb_build_object('revision',(select revision from recovery_live.recovery_revision where id=1),'people',(select count(*) from recovery_live.recovery_people where archived_at is null));
 when 'recovery_read_page' then
  page_limit:=coalesce((p_payload->>'p_limit')::integer,500);
  if page_limit<1 or page_limit>500 then raise exception 'INVALID_PAGE';end if;
  return (
   with persons as materialized (select nip,nama,provinsi,bank,status_sdm from recovery_live.recovery_people where archived_at is null and (nullif(p_payload->>'p_after','') is null or nip>p_payload->>'p_after') order by nip limit page_limit),
   obligations as materialized (select o.* from recovery_live.recovery_obligations o join persons p on p.nip=o.nip)
   select jsonb_build_object(
    'revision',(select revision from recovery_live.recovery_revision where id=1),
    'people',coalesce((select jsonb_agg(to_jsonb(p) order by nip) from persons p),'[]'::jsonb),
    'obligations',coalesce((select jsonb_agg(jsonb_build_object('nip',nip,'bank',bank,'kind',jenis,'year',tahun_kewajiban,'amount',nominal) order by id) from obligations),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(jsonb_build_object('nip',o.nip,'bank',o.bank,'kind',o.jenis,'year',o.tahun_kewajiban,'stage',p.tahap,'amount',p.nominal,'verification',p.verification,'paymentDate',p.tanggal_pengembalian) order by p.id) from recovery_live.recovery_payments p join obligations o on o.id=p.obligation_id),'[]'::jsonb)
   )
  );
 when 'recovery_begin' then
  return to_jsonb(recovery_live.recovery_begin(p_payload->>'p_name',p_payload->>'p_hash',(p_payload->>'p_rows')::integer,p_payload->'p_totals'));
 when 'recovery_append' then
  return to_jsonb(recovery_live.recovery_append((p_payload->>'p_batch')::uuid,p_payload->'p_records'));
 when 'recovery_validate' then
  return recovery_live.recovery_validate((p_payload->>'p_batch')::uuid);
 when 'recovery_diff' then
  return (select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from recovery_live.recovery_diff((p_payload->>'p_batch')::uuid,coalesce((p_payload->>'p_offset')::integer,0),coalesce((p_payload->>'p_limit')::integer,50)) d);
 when 'recovery_commit' then
  return recovery_live.recovery_commit((p_payload->>'p_batch')::uuid,p_payload->>'p_reason');
 when 'case_prepare' then return to_jsonb(recovery_live.prepare_case_links((p_payload->>'p_revision')::bigint,p_payload->'p_cases'));
 when 'case_commit' then return recovery_live.commit_case_links((p_payload->>'p_batch')::uuid,p_payload->>'p_reason');
 when 'recovery_linked_meta' then return recovery_live.linked_case_meta();
 when 'recovery_linked_cases' then return recovery_live.read_linked_cases(coalesce((p_payload->>'p_after')::bigint,0),coalesce((p_payload->>'p_limit')::integer,100));
 else raise exception 'INVALID_MASTER_ACTION';
 end case;
end $$;
revoke all on function public.recovery_master_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.recovery_master_rpc(text,jsonb) to authenticated;

commit;
