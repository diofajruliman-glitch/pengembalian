-- ISOLATED TEST SCHEMA. No application API access, no changes to public tables.
begin;
create schema recovery_test;
revoke all on schema recovery_test from public,anon,authenticated;
set local search_path=recovery_test,pg_catalog;
-- DRAF TAHAP 1. Belum dijalankan pada database produksi.
-- Preview/staging imports need an atomic validation-and-commit RPC before activation.

create table recovery_test.recovery_people (
 nip text primary key check(nip ~ '^[0-9]{18}$'),
 nama text not null, provinsi text, bank text not null check(bank in ('Mandiri','BRI','BSI')),
 status_sdm text, archived_at timestamptz, created_at timestamptz not null default now()
);
create table recovery_test.recovery_sp2d (
 id bigint generated always as identity primary key,
 nomor text not null, tanggal date not null, tahun integer not null,
 jenis text not null check(jenis in ('TUKIN','UM')),
 unique(nomor,tahun,jenis)
);
create table recovery_test.recovery_imports (
 id uuid primary key default gen_random_uuid(), file_name text not null,
 file_sha256 text not null, source_cutoff date,
 status text not null default 'preview' check(status in ('preview','validated','committed','rejected')),
 actor uuid not null references auth.users(id), created_at timestamptz not null default now(),
 summary jsonb not null default '{}'
);
create table recovery_test.recovery_obligations (
 id bigint generated always as identity primary key,
 nip text not null references recovery_test.recovery_people(nip),
 bank text not null check(bank in ('Mandiri','BRI','BSI')),
 jenis text not null check(jenis in ('TUKIN','UM')), tahun_kewajiban integer not null,
 nominal bigint not null check(nominal>=0),
 source_import uuid not null references recovery_test.recovery_imports(id),
 unique(nip,bank,jenis,tahun_kewajiban)
);
-- SP2D allocations are separate: the workbook does not establish each SP2D yet.
create table recovery_test.recovery_sp2d_allocations (
 obligation_id bigint not null references recovery_test.recovery_obligations(id),
 sp2d_id bigint not null references recovery_test.recovery_sp2d(id),
 nominal bigint not null check(nominal>=0), primary key(obligation_id,sp2d_id)
);
create table recovery_test.recovery_payments (
 id bigint generated always as identity primary key,
 obligation_id bigint not null references recovery_test.recovery_obligations(id),
 tahap integer not null check(tahap>0),
 tanggal_pengembalian date, tahun_pengembalian integer,
 nominal bigint not null check(nominal>=0), bukti text,
 verification text not null default 'pending' check(verification in ('pending','verified','rejected')),
 verified_by uuid references auth.users(id), verified_at timestamptz,
 source_import uuid not null references recovery_test.recovery_imports(id),
 unique(obligation_id,tahap),
 check(verification<>'verified' or (nullif(btrim(bukti),'') is not null and tanggal_pengembalian is not null and verified_by is not null and verified_at is not null))
);
-- Immutable correction log must be written by the future atomic commit RPC.
create table recovery_test.recovery_changes (
 id bigint generated always as identity primary key,
 import_id uuid not null references recovery_test.recovery_imports(id),
 actor uuid not null references auth.users(id), entity text not null, record_key text not null,
 before_data jsonb, after_data jsonb not null, reason text not null,
 created_at timestamptz not null default now()
);
do $$ declare tbl text; begin
 foreach tbl in array array['recovery_people','recovery_sp2d','recovery_imports','recovery_obligations','recovery_sp2d_allocations','recovery_payments','recovery_changes'] loop
  execute format('alter table recovery_test.%I enable row level security',tbl);
  execute format('revoke all on recovery_test.%I from anon, authenticated',tbl);

  execute format('create policy authorized_read on recovery_test.%I for select to authenticated using ((select public.current_app_role()) in (''admin'',''editor'',''viewer''))',tbl);
 end loop;
end $$;
-- No browser write grants at this stage. Never enable writes until the commit RPC
-- validates full batches, locks corrections, checks balances and records audit data.

-- DRAF TAHAP 3. Jalankan hanya setelah foundation, dalam lingkungan uji.

create table recovery_test.recovery_revision(id integer primary key check(id=1), revision bigint not null);
insert into recovery_test.recovery_revision values(1,0);
alter table recovery_test.recovery_revision enable row level security;
revoke all on recovery_test.recovery_revision from anon,authenticated;
alter table recovery_test.recovery_imports add column expected_rows integer not null default 0;
alter table recovery_test.recovery_imports add column base_revision bigint not null default 0;
alter table recovery_test.recovery_imports add column expected_totals jsonb not null default '{}';
create unique index recovery_file_committed on recovery_test.recovery_imports(file_sha256) where status='committed';
create table recovery_test.recovery_staging (
 import_id uuid not null references recovery_test.recovery_imports(id),
 record_type text not null check(record_type in ('person','obligation','payment')),
 record_key text not null, data jsonb not null,
 obligation_key text generated always as ((data->>'nip')||'|'||(data->>'bank')||'|'||(data->>'kind')||'|'||(data->>'year')) stored,
 primary key(import_id,record_type,record_key)
);
create index recovery_staging_obligation on recovery_test.recovery_staging(import_id,record_type,obligation_key);
alter table recovery_test.recovery_staging enable row level security;
revoke all on recovery_test.recovery_staging from anon,authenticated;

create function recovery_test.recovery_begin(p_name text,p_hash text,p_rows integer,p_totals jsonb) returns uuid
language plpgsql security definer set search_path=recovery_test,pg_catalog as $$
declare batch uuid; rev bigint;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') not in ('admin','editor') then raise exception 'FORBIDDEN'; end if;
 if p_hash !~ '^[a-f0-9]{64}$' or p_rows<1 or p_rows>500000 or nullif(btrim(p_name),'') is null then raise exception 'INVALID_MANIFEST';end if;
 if exists(select 1 from recovery_imports where file_sha256=p_hash and status='committed') then raise exception 'FILE_ALREADY_COMMITTED';end if;
 select revision into rev from recovery_revision where id=1;
 insert into recovery_imports(file_name,file_sha256,actor,expected_rows,base_revision,expected_totals)
 values(p_name,p_hash,auth.uid(),p_rows,rev,p_totals) returning id into batch;
 return batch;
end $$;

create function recovery_test.recovery_record_key(t text,d jsonb) returns text language sql immutable strict as $$select (d->>'nip')||case when t='person' then '' else '|'||(d->>'bank')||'|'||(d->>'kind')||'|'||(d->>'year')||case when t='payment' then '|'||(d->>'stage') else '' end end$$;
revoke all on function recovery_test.recovery_record_key(text,jsonb) from public,anon,authenticated;

create function recovery_test.recovery_append(p_batch uuid,p_records jsonb) returns integer
language plpgsql security definer set search_path=recovery_test,pg_catalog as $$
declare b recovery_imports; r jsonb; d jsonb; k text; t text; added integer:=0;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') not in ('admin','editor') then raise exception 'FORBIDDEN';end if;
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
 if exists(select 1 from jsonb_array_elements(p_records) item(value) group by item.value->>'type',recovery_test.recovery_record_key(item.value->>'type',item.value->'data') having count(distinct item.value->'data')>1) then raise exception 'CONFLICTING_RETRY';end if;
 if exists(select 1 from jsonb_array_elements(p_records) item(value) join recovery_staging s on s.import_id=p_batch and s.record_type=item.value->>'type' and s.record_key=recovery_test.recovery_record_key(item.value->>'type',item.value->'data') where s.data<>item.value->'data') then raise exception 'CONFLICTING_RETRY';end if;
 insert into recovery_staging(import_id,record_type,record_key,data)
 select distinct p_batch,item.value->>'type',recovery_test.recovery_record_key(item.value->>'type',item.value->'data'),item.value->'data' from jsonb_array_elements(p_records) item(value) on conflict do nothing;
 get diagnostics added=row_count;
 if (select count(*) from recovery_staging where import_id=p_batch)>b.expected_rows then raise exception 'TOO_MANY_ROWS';end if;
 return added;
end $$;

create function recovery_test.recovery_validate(p_batch uuid) returns jsonb
language plpgsql security definer set search_path=recovery_test,pg_catalog as $$
declare b recovery_imports; actual jsonb; corrections bigint;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') not in ('admin','editor') then raise exception 'FORBIDDEN';end if;
 select * into b from recovery_imports where id=p_batch for update;
 if not found or b.actor<>auth.uid() or b.status not in ('preview','validated') then raise exception 'INVALID_BATCH';end if;
 if (select count(*) from recovery_staging where import_id=p_batch)<>b.expected_rows then raise exception 'INCOMPLETE_BATCH';end if;
 if b.base_revision<>(select revision from recovery_revision where id=1) then raise exception 'STALE_PREVIEW';end if;
 analyze recovery_test.recovery_staging;
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
 -- Retaining an omitted positive payment would increase the ledger beyond the
 -- snapshot recap. Reject before review/commit instead of waiting for rollback.
 if exists(select 1 from recovery_payments p join recovery_obligations o on o.id=p.obligation_id
  where p.nominal>0 and b.expected_totals ? o.bank and not exists(
   select 1 from recovery_staging s where s.import_id=p_batch and s.record_type='payment'
    and s.record_key=concat_ws('|',o.nip,o.bank,o.jenis,o.tahun_kewajiban,p.tahap)
  )) then raise exception 'MISSING_HISTORY_REQUIRES_REVIEW';end if;
 select count(*) into corrections from recovery_staging s join recovery_obligations o on o.nip=s.data->>'nip' and o.bank=s.data->>'bank' and o.jenis=s.data->>'kind' and o.tahun_kewajiban=(s.data->>'year')::integer
 where s.import_id=p_batch and s.record_type='obligation' and o.nominal<>(s.data->>'amount')::bigint;
 update recovery_imports set status='validated',summary=jsonb_build_object('totals',actual,'obligationCorrections',corrections) where id=p_batch;
 return jsonb_build_object('totals',actual,'obligationCorrections',corrections);
end $$;

create function recovery_test.recovery_commit(p_batch uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=recovery_test,pg_catalog as $$
declare b recovery_imports; s record; d jsonb; old_o recovery_obligations; old_p recovery_payments; oid bigint; rev bigint; result jsonb; live_totals jsonb;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') not in ('admin','editor') then raise exception 'FORBIDDEN';end if;
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
 -- Include payments absent from this snapshot; missing/blank cells never delete history.
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
create function recovery_test.recovery_diff(p_batch uuid,p_offset integer default 0,p_limit integer default 50) returns table(record_type text,record_key text,nip text,bank text,kind text,year integer,stage integer,before_amount bigint,after_amount bigint)
language plpgsql security definer set search_path=recovery_test,pg_catalog as $$
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') not in ('admin','editor') or not exists(select 1 from recovery_imports where id=p_batch and actor=auth.uid()) then raise exception 'FORBIDDEN';end if;
 if p_offset<0 or p_limit<1 or p_limit>100 then raise exception 'INVALID_PAGE';end if;
 return query select s.record_type,s.record_key,s.data->>'nip',s.data->>'bank',s.data->>'kind',(s.data->>'year')::integer,case when s.record_type='payment' then (s.data->>'stage')::integer else null end,
 case when s.record_type='obligation' then o.nominal else p.nominal end,(s.data->>'amount')::bigint
 from recovery_staging s left join recovery_obligations o on o.nip=s.data->>'nip' and o.bank=s.data->>'bank' and o.jenis=s.data->>'kind' and o.tahun_kewajiban=(s.data->>'year')::integer
 left join recovery_payments p on p.obligation_id=o.id and p.tahap=(s.data->>'stage')::integer
 where s.import_id=p_batch and s.record_type in ('obligation','payment') and (case when s.record_type='obligation' then o.nominal else p.nominal end) is distinct from (s.data->>'amount')::bigint
 order by s.record_type,s.record_key offset p_offset limit p_limit;
end $$;
revoke all on function recovery_test.recovery_diff(uuid,integer,integer) from public,anon;

revoke all on function recovery_test.recovery_begin(text,text,integer,jsonb),recovery_test.recovery_append(uuid,jsonb),recovery_test.recovery_validate(uuid),recovery_test.recovery_commit(uuid,text) from public,anon;


revoke all on all tables in schema recovery_test from public,anon,authenticated;
revoke all on all sequences in schema recovery_test from public,anon,authenticated;
revoke all on all functions in schema recovery_test from public,anon,authenticated;
commit;
