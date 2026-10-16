-- Isolated additive migration for Kategorisasi Disiplin ASN.
-- Review and run in the existing app's Supabase SQL Editor. No source workbook
-- or raw transaction table is created, and no existing table/policy is modified.
begin;

create table if not exists public.discipline_datasets (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 1 and 200),
 filename text not null check (length(filename) between 1 and 240 and filename !~ E'[/\\\\]'),
 parent_id uuid references public.discipline_datasets(id),
 version integer not null check (version > 0),
 schema_version integer not null default 1 check (schema_version = 1),
 status text not null default 'active' check (status in ('active','archived')),
 result jsonb not null check (jsonb_typeof(result) = 'object'),
 created_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id),
 archived_at timestamptz,
 archived_by uuid references auth.users(id),
 check ((status='active' and archived_at is null and archived_by is null) or
        (status='archived' and archived_at is not null and archived_by is not null))
);

-- A request key belongs to one authenticated actor. Old snapshots and callers
-- without a key retain their previous behavior; only retries carrying a key
-- are deduplicated. The unique index is also the concurrent-insert boundary.
alter table public.discipline_datasets add column if not exists request_id uuid;
create unique index if not exists discipline_datasets_actor_request_idx
 on public.discipline_datasets(created_by,request_id) where request_id is not null;

create table if not exists public.discipline_followups (
 dataset_id uuid not null references public.discipline_datasets(id),
 nik text not null check (nik ~ '^[0-9]{16}$'),
 status text not null default 'Belum ditindaklanjuti' check (status in ('Belum ditindaklanjuti','Dalam pemeriksaan','Menunggu dokumen','Selesai')),
 pic text not null default '' check (length(pic) <= 200),
 notes text not null default '' check (length(notes) <= 10000),
 document_reference text not null default '' check (length(document_reference) <= 2000),
 decision_note text not null default '' check (length(decision_note) <= 10000),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id),
 primary key(dataset_id,nik)
);

create table if not exists public.discipline_audit (
 id bigint generated always as identity primary key,
 dataset_id uuid not null references public.discipline_datasets(id),
 nik text,
 action text not null check (action in ('import','new_version','archive','followup')),
 actor uuid not null references auth.users(id),
 occurred_at timestamptz not null default now(),
 before_data jsonb,
 after_data jsonb not null
);
create index if not exists discipline_audit_dataset_idx on public.discipline_audit(dataset_id,id);
create index if not exists discipline_datasets_created_idx on public.discipline_datasets(created_at desc,id);

-- Only the RPC may write. RLS is a second boundary for direct reads.
alter table public.discipline_datasets enable row level security;
alter table public.discipline_followups enable row level security;
alter table public.discipline_audit enable row level security;
revoke all on public.discipline_datasets,public.discipline_followups,public.discipline_audit from public,anon,authenticated;
revoke all on sequence public.discipline_audit_id_seq from public,anon,authenticated;

-- This helper rejects raw transaction rows, duplicate/rounded NIK, bad JSON
-- shapes and out-of-range numeric values before committing the whole snapshot.
create or replace function public.discipline_validate_result(p_result jsonb) returns void
language plpgsql set search_path = pg_catalog,public as $$
declare r jsonb; period jsonb; k text; field text; item jsonb; v jsonb; row_count integer; bad boolean;
 missing_details boolean; historical_positive boolean; category_reference boolean; reference_eligible boolean;
begin
 if p_result is null or jsonb_typeof(p_result) <> 'object' or octet_length(p_result::text)>12582912 then
  raise exception 'DISCIPLINE_INVALID_RESULT';
 end if;
 if exists(select 1 from jsonb_object_keys(p_result) key where key not in ('rows','audits','stats','rules','metadata','provenance','source')) or
    jsonb_typeof(p_result->'rows') is distinct from 'array' or
    jsonb_typeof(p_result->'rules') is distinct from 'object' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
 -- Optional for compatibility with snapshots saved before this policy existed.
 if (p_result->'rules')?'missingTimePolicy' then
  if jsonb_typeof(p_result->'rules'->'missingTimePolicy') is distinct from 'string' or
     p_result->'rules'->>'missingTimePolicy' not in ('pairing','validate') then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
 end if;
 row_count := jsonb_array_length(p_result->'rows');
 if row_count < 1 or row_count > 5000 then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
 if p_result?'audits' and jsonb_typeof(p_result->'audits')<>'array' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
 if p_result?'stats' and jsonb_typeof(p_result->'stats')<>'object' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
 if p_result?'metadata' and jsonb_typeof(p_result->'metadata')<>'object' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
 if p_result?'source' then
  if jsonb_typeof(p_result->'source')<>'object' or exists(select 1 from jsonb_object_keys(p_result->'source') key where key not in ('filename','sha256','reference')) then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
  for item in select value from jsonb_each(p_result->'source') loop
   if jsonb_typeof(item)<>'string' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
  end loop;
 end if;
 if exists(select 1 from jsonb_array_elements(p_result->'rows') x where jsonb_typeof(x) <> 'object') then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
 if (select count(distinct x->>'nik') from jsonb_array_elements(p_result->'rows') x) <> row_count then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
 for r in select value from jsonb_array_elements(p_result->'rows') loop
  if jsonb_typeof(r->'nik') is distinct from 'string' or (r->>'nik') !~ '^[0-9]{16}$' or
     jsonb_typeof(r->'nama') is distinct from 'string' or length(btrim(r->>'nama')) not between 1 and 400 or
     r->>'hasilPenilaian' is null or r->>'hasilPenilaian' not in ('Terbukti','Tidak Terbukti','Belum ditetapkan','Tidak ditemukan di Data Olah') then
   raise exception 'DISCIPLINE_INVALID_RESULT';
  end if;
  if exists(select 1 from jsonb_object_keys(r) key where key not in ('nik','nama','nip','hasilPenilaian','hasilAsli','keterangan','baris','historical','before','after','audits','missingTransactionDetails','sourceTransactionCount','categoryFromPairing')) or
     jsonb_typeof(r->'before') is distinct from 'object' or jsonb_typeof(r->'after') is distinct from 'object' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
  if r?'audits' and jsonb_typeof(r->'audits')<>'array' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
  -- These paired row fields are optional for earlier snapshot versions.
  -- New rows must distinguish missing raw details from a genuine zero result.
  missing_details := false;
  if r ?| array['missingTransactionDetails','sourceTransactionCount'] then
   if jsonb_typeof(r->'missingTransactionDetails') is distinct from 'boolean' or
      jsonb_typeof(r->'sourceTransactionCount') is distinct from 'number' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
   if (r->>'sourceTransactionCount')::numeric<0 or trunc((r->>'sourceTransactionCount')::numeric)<>(r->>'sourceTransactionCount')::numeric then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
   historical_positive :=
    (case when jsonb_typeof(r->'historical'->'frekuensi')='number' then (r->'historical'->>'frekuensi')::numeric>0 else false end) or
    (case when jsonb_typeof(r->'historical'->'nominal')='number' then (r->'historical'->>'nominal')::numeric>0 else false end);
   missing_details := (r->>'missingTransactionDetails')::boolean;
   if missing_details is distinct from ((r->>'sourceTransactionCount')::numeric=0 and historical_positive) then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
  end if;
  -- Optional for older gap snapshots that used only the missing-detail label.
  -- A reference category never supplies a fabricated period score or count.
  category_reference := false;
  if r?'categoryFromPairing' then
   if jsonb_typeof(r->'categoryFromPairing') is distinct from 'boolean' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
   reference_eligible := missing_details and coalesce(r->'historical'->>'kategori' in ('Ringan','Sedang','Berat'),false) and coalesce(r->'historical'->>'status','')<>'Perlu validasi';
   category_reference := (r->>'categoryFromPairing')::boolean;
   if category_reference is distinct from reference_eligible then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
  end if;
  foreach k in array array['historical','before','after'] loop
   period := r->k;
   if period is null or period='null'::jsonb then continue; end if;
   if jsonb_typeof(period) <> 'object' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
   if exists(select 1 from jsonb_object_keys(period) key where key not in ('frekuensi','nominal','dalam','luar','unknown','timeFromPairing','timeFromPairingInside','timeFromPairingOutside','total','kategori','scoreFrequency','scoreDeposit','scoreTime','categoryFrequency','categoryDeposit','categoryTime','status','invalidDates','invalidAmounts','invalidDuplicates','identityConflicts','sourceRow','weightFrequency','weightDeposit','weightTime')) then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
   if missing_details and k in ('before','after') then
    if category_reference then
     if period->>'kategori' is distinct from r->'historical'->>'kategori' or period->>'status' is distinct from 'Kategori acuan Hasil pairing; rincian periode belum tersedia' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
    elsif period->>'kategori' is distinct from 'Rincian transaksi belum tersedia' or period->>'status' is distinct from 'Rincian transaksi belum tersedia' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
    foreach field in array array['frekuensi','nominal','dalam','luar','unknown','timeFromPairing','timeFromPairingInside','timeFromPairingOutside','total','scoreFrequency','scoreDeposit','scoreTime','invalidDates','invalidAmounts','invalidDuplicates','identityConflicts'] loop
     if period->field is distinct from 'null'::jsonb then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
    end loop;
    foreach field in array array['categoryFrequency','categoryDeposit','categoryTime'] loop
     if period->>field is distinct from '' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
    end loop;
    -- Even optional numeric fields may not introduce a false zero or score.
    if exists(select 1 from jsonb_each(period) e where e.key not in ('kategori','status','categoryFrequency','categoryDeposit','categoryTime') and e.value<>'null'::jsonb) then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
    continue;
   end if;
   if period->>'kategori'='Rincian transaksi belum tersedia' or period->>'status' in ('Rincian transaksi belum tersedia','Kategori acuan Hasil pairing; rincian periode belum tersedia') then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
   foreach field in array array['frekuensi','nominal','dalam','luar','unknown'] loop
    if jsonb_typeof(period->field) is distinct from 'number' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
   end loop;
   -- The provenance triplet is optional as a whole, never partially present.
   -- Effective dalam/luar include the assumptions, while unknown stays unresolved.
   if period ?| array['timeFromPairing','timeFromPairingInside','timeFromPairingOutside'] then
    foreach field in array array['timeFromPairing','timeFromPairingInside','timeFromPairingOutside'] loop
     if jsonb_typeof(period->field) is distinct from 'number' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
    end loop;
   end if;
   for item in select jsonb_build_object('key',key,'value',value) from jsonb_each(period) loop
    v := item->'value';
    if item->>'key' in ('kategori','categoryFrequency','categoryDeposit','categoryTime','status') then
     if v <> 'null'::jsonb and (jsonb_typeof(v)<>'string' or length(v#>>'{}')>200) then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
    elsif v <> 'null'::jsonb then
     if jsonb_typeof(v)<>'number' then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
     if (v#>>'{}')::numeric<0 then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
     if item->>'key' in ('frekuensi','dalam','luar','unknown','timeFromPairing','timeFromPairingInside','timeFromPairingOutside','invalidDates','invalidAmounts','invalidDuplicates','identityConflicts','sourceRow') and trunc((v#>>'{}')::numeric)<>(v#>>'{}')::numeric then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
    end if;
   end loop;
   if period?'timeFromPairing' then
    if (period->>'timeFromPairing')::numeric <> (period->>'timeFromPairingInside')::numeric+(period->>'timeFromPairingOutside')::numeric or
       (period->>'timeFromPairing')::numeric > (period->>'frekuensi')::numeric or
       (period->>'timeFromPairingInside')::numeric > (period->>'dalam')::numeric or
       (period->>'timeFromPairingOutside')::numeric > (period->>'luar')::numeric or
       (period->>'timeFromPairing')::numeric+(period->>'unknown')::numeric > (period->>'frekuensi')::numeric then
     raise exception 'DISCIPLINE_INVALID_RESULT';
    end if;
   end if;
  end loop;
 end loop;
 -- Recursive walk is bounded by JSON size and catches NaN replacements/nulls,
 -- numeric overflow, oversized strings, and raw transaction arrays anywhere.
 with recursive nodes(value) as (
  select p_result
  union all
  select child.value from nodes n cross join lateral (
   select e.value from jsonb_each(case when jsonb_typeof(n.value)='object' then n.value else '{}'::jsonb end) e
   union all
   select a.value from jsonb_array_elements(case when jsonb_typeof(n.value)='array' then n.value else '[]'::jsonb end) a
  ) child
 ) select exists(select 1 from nodes where
  (case when jsonb_typeof(value)='number' then abs((value#>>'{}')::numeric)>9007199254740991 else false end) or
  (jsonb_typeof(value)='string' and length(value#>>'{}')>20000) or
  (exists(select 1 from jsonb_each(case when jsonb_typeof(value)='object' then value else '{}'::jsonb end) e where e.key in ('transactions','transactionRows','rawTransactions','rawRows','sourceRows') and jsonb_typeof(e.value) in ('object','array')))
 ) into bad;
 if bad then raise exception 'DISCIPLINE_INVALID_RESULT'; end if;
end $$;
revoke all on function public.discipline_validate_result(jsonb) from public,anon,authenticated;

create or replace function public.discipline_dataset_meta(p_row public.discipline_datasets) returns jsonb
language sql immutable set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p_row.id,'name',p_row.name,'filename',p_row.filename,
  'parentId',p_row.parent_id,'version',p_row.version,'schemaVersion',p_row.schema_version,
  'status',p_row.status,'createdAt',p_row.created_at,'createdBy',p_row.created_by,
  'archivedAt',p_row.archived_at,'rowCount',jsonb_array_length(p_row.result->'rows'))
$$;
revoke all on function public.discipline_dataset_meta(public.discipline_datasets) from public,anon,authenticated;

create or replace function public.discipline_followup_json(p_row public.discipline_followups) returns jsonb
language sql immutable set search_path=pg_catalog,public as $$
 select jsonb_build_object('datasetId',p_row.dataset_id,'nik',p_row.nik,'status',p_row.status,
  'pic',p_row.pic,'notes',p_row.notes,'documentReference',p_row.document_reference,
  'decisionNote',p_row.decision_note,'updatedAt',p_row.updated_at,'updatedBy',p_row.updated_by)
$$;
revoke all on function public.discipline_followup_json(public.discipline_followups) from public,anon,authenticated;

create or replace function public.discipline_rpc(p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 app_role text; actor uuid; d public.discipline_datasets; parent public.discipline_datasets;
 followup public.discipline_followups; old_followup jsonb; patch jsonb;
 target_dataset_id uuid; target_parent_id uuid; target_nik text; result jsonb; output jsonb; key text;
 target_request_id uuid; expected_updated_at timestamptz; existing_followup boolean;
begin
 actor := auth.uid(); app_role := public.current_app_role();
 if actor is null or app_role is null or app_role not in ('admin','editor','viewer') then raise exception 'DISCIPLINE_FORBIDDEN'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
 if p_action in ('save_version','archive','delete') and app_role<>'admin' then raise exception 'DISCIPLINE_FORBIDDEN'; end if;
 if p_action='save_followup' and app_role not in ('admin','editor') then raise exception 'DISCIPLINE_FORBIDDEN'; end if;

 if p_action='list' then
  select coalesce(jsonb_agg(public.discipline_dataset_meta(x) order by x.created_at desc,x.id),'[]'::jsonb) into output from public.discipline_datasets x;
  return output;
 elsif p_action='save_version' then
  if jsonb_typeof(p_payload->'name') is distinct from 'string' or length(btrim(p_payload->>'name')) not between 1 and 200 or
     jsonb_typeof(p_payload->'filename') is distinct from 'string' or length(p_payload->>'filename') not between 1 and 240 or (p_payload->>'filename') ~ E'[/\\\\]' then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
  result := p_payload->'result';
  perform public.discipline_validate_result(result);
  if p_payload?'requestId' then
   if jsonb_typeof(p_payload->'requestId') is distinct from 'string' then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
   begin target_request_id := (p_payload->>'requestId')::uuid;
   exception when invalid_text_representation then raise exception 'DISCIPLINE_INVALID_INPUT'; end;
  end if;
  if coalesce(p_payload->>'parentId','') <> '' then
   begin target_parent_id := (p_payload->>'parentId')::uuid; exception when invalid_text_representation then raise exception 'DISCIPLINE_INVALID_INPUT'; end;
  end if;
  -- A successful write can outlive its HTTP response. Replay is a read of the
  -- committed version, including when that version/parent was later archived.
  if target_request_id is not null then
   select * into d from public.discipline_datasets x where x.created_by=actor and x.request_id=target_request_id;
   if found then
    if d.name is distinct from btrim(p_payload->>'name') or d.filename is distinct from p_payload->>'filename' or
       d.parent_id is distinct from target_parent_id or d.result is distinct from result then raise exception 'DISCIPLINE_REQUEST_CONFLICT'; end if;
    return public.discipline_dataset_meta(d)||jsonb_build_object('result',d.result);
   end if;
  end if;
  if target_parent_id is not null then
   select * into parent from public.discipline_datasets x where x.id=target_parent_id for update;
   if not found then raise exception 'DISCIPLINE_NOT_FOUND'; end if;
   -- A matching first request may have committed while this call waited for
   -- the parent lock. Resolve its replay before checking later archival.
   if target_request_id is not null then
    select * into d from public.discipline_datasets x where x.created_by=actor and x.request_id=target_request_id;
    if found then
     if d.name is distinct from btrim(p_payload->>'name') or d.filename is distinct from p_payload->>'filename' or
        d.parent_id is distinct from target_parent_id or d.result is distinct from result then raise exception 'DISCIPLINE_REQUEST_CONFLICT'; end if;
     return public.discipline_dataset_meta(d)||jsonb_build_object('result',d.result);
    end if;
   end if;
   if parent.status='archived' then raise exception 'DISCIPLINE_ARCHIVED'; end if;
  end if;
  insert into public.discipline_datasets(name,filename,parent_id,version,result,created_by,request_id)
   values(btrim(p_payload->>'name'),p_payload->>'filename',target_parent_id,coalesce(parent.version,0)+1,result,actor,target_request_id)
   on conflict(created_by,request_id) where request_id is not null do nothing returning * into d;
  if not found then
   -- Another request with this actor/key may have committed while this call
   -- waited on a parent or the unique index. Never create its audit twice.
   select * into d from public.discipline_datasets x where x.created_by=actor and x.request_id=target_request_id;
   if not found or d.name is distinct from btrim(p_payload->>'name') or d.filename is distinct from p_payload->>'filename' or
      d.parent_id is distinct from target_parent_id or d.result is distinct from result then raise exception 'DISCIPLINE_REQUEST_CONFLICT'; end if;
   return public.discipline_dataset_meta(d)||jsonb_build_object('result',d.result);
  end if;
  insert into public.discipline_audit(dataset_id,action,actor,after_data)
   values(d.id,case when target_parent_id is null then 'import' else 'new_version' end,actor,public.discipline_dataset_meta(d)||jsonb_build_object('rules',result->'rules'));
  return public.discipline_dataset_meta(d)||jsonb_build_object('result',d.result);
 end if;

 if p_action not in ('load','archive','followups','save_followup','delete') then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
 begin target_dataset_id := coalesce(p_payload->>'datasetId',p_payload->>'id')::uuid;
 exception when invalid_text_representation then raise exception 'DISCIPLINE_INVALID_INPUT'; end;
 -- All mutation operations lock the dataset: archival and writes serialize.
 select * into d from public.discipline_datasets x where x.id=target_dataset_id for update;
 if not found then raise exception 'DISCIPLINE_NOT_FOUND'; end if;
 if p_action='load' then
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'nik',x.nik,'action',x.action,'actor',x.actor,'occurredAt',x.occurred_at,'before',x.before_data,'after',x.after_data) order by x.id),'[]'::jsonb)
   into output from public.discipline_audit x where x.dataset_id=d.id;
  return public.discipline_dataset_meta(d)||jsonb_build_object('result',d.result,'auditEvents',output);
 elsif p_action='followups' then
  select coalesce(jsonb_agg(public.discipline_followup_json(x) order by x.nik),'[]'::jsonb) into output from public.discipline_followups x where x.dataset_id=d.id;
  return output;
 elsif p_action='delete' then
  update public.discipline_datasets set parent_id=d.parent_id where parent_id=d.id;
  delete from public.discipline_followups where dataset_id=d.id;
  delete from public.discipline_audit where dataset_id=d.id;
  delete from public.discipline_datasets where id=d.id;
  return jsonb_build_object('deleted',true,'id',d.id);
 end if;
 if d.status='archived' then raise exception 'DISCIPLINE_ARCHIVED'; end if;
 if p_action='archive' then
  update public.discipline_datasets x set status='archived',archived_at=now(),archived_by=actor where x.id=d.id returning * into d;
  insert into public.discipline_audit(dataset_id,action,actor,after_data) values(d.id,'archive',actor,public.discipline_dataset_meta(d));
  return public.discipline_dataset_meta(d);
 end if;

 target_nik := p_payload->>'nik'; patch := p_payload->'patch';
 if jsonb_typeof(p_payload->'nik') is distinct from 'string' or target_nik !~ '^[0-9]{16}$' or jsonb_typeof(patch) is distinct from 'object' then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
 if not exists(select 1 from jsonb_array_elements(d.result->'rows') r where r->>'nik'=target_nik) then raise exception 'DISCIPLINE_UNKNOWN_NIK'; end if;
 if not exists(select 1 from jsonb_object_keys(patch)) or exists(select 1 from jsonb_object_keys(patch) k where k not in ('status','pic','notes','documentReference','decisionNote')) then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
 for key in select jsonb_object_keys(patch) loop
  if jsonb_typeof(patch->key) <> 'string' or length(patch->>key)>(case key when 'pic' then 200 when 'documentReference' then 2000 else 10000 end) then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
 end loop;
 if patch?'status' and patch->>'status' not in ('Belum ditindaklanjuti','Dalam pemeriksaan','Menunggu dokumen','Selesai') then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
 select * into followup from public.discipline_followups x where x.dataset_id=d.id and x.nik=target_nik for update;
 existing_followup := found;
 old_followup := case when existing_followup then public.discipline_followup_json(followup) else null end;
 -- Omitting this field preserves legacy callers. Explicit null means the
 -- editor started from an empty record; a timestamp must match the saved row.
 if p_payload?'expectedUpdatedAt' then
  if p_payload->'expectedUpdatedAt'='null'::jsonb then
   if existing_followup then raise exception 'DISCIPLINE_FOLLOWUP_CONFLICT'; end if;
  else
   if jsonb_typeof(p_payload->'expectedUpdatedAt') is distinct from 'string' or
      (p_payload->>'expectedUpdatedAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
   begin expected_updated_at := (p_payload->>'expectedUpdatedAt')::timestamptz;
   exception when invalid_datetime_format or datetime_field_overflow or invalid_time_zone_displacement_value then raise exception 'DISCIPLINE_INVALID_INPUT'; end;
   if not isfinite(expected_updated_at) then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
   if not existing_followup or followup.updated_at is distinct from expected_updated_at then raise exception 'DISCIPLINE_FOLLOWUP_CONFLICT'; end if;
  end if;
 end if;
 insert into public.discipline_followups(dataset_id,nik,status,pic,notes,document_reference,decision_note,updated_at,updated_by)
 values(d.id,target_nik,coalesce(patch->>'status','Belum ditindaklanjuti'),coalesce(patch->>'pic',''),coalesce(patch->>'notes',''),coalesce(patch->>'documentReference',''),coalesce(patch->>'decisionNote',''),clock_timestamp(),actor)
 on conflict(dataset_id,nik) do update set
  status=coalesce(patch->>'status',discipline_followups.status),pic=coalesce(patch->>'pic',discipline_followups.pic),
  notes=coalesce(patch->>'notes',discipline_followups.notes),document_reference=coalesce(patch->>'documentReference',discipline_followups.document_reference),
  decision_note=coalesce(patch->>'decisionNote',discipline_followups.decision_note),
  updated_at=greatest(clock_timestamp(),discipline_followups.updated_at+interval '1 microsecond'),updated_by=actor
 returning * into followup;
 output := public.discipline_followup_json(followup);
 insert into public.discipline_audit(dataset_id,nik,action,actor,before_data,after_data) values(d.id,target_nik,'followup',actor,old_followup,output);
 return output;
end $$;
revoke all on function public.discipline_rpc(text,jsonb) from public,anon;
grant execute on function public.discipline_rpc(text,jsonb) to authenticated;

commit;
