-- Activate extensions on an existing production master only, in one transaction.
-- Never rerun schema.sql or recovery-production-activation.sql against the live database.
-- No data import, status assignment or followup links are created by this package.
begin;
do $$begin
 if to_regprocedure('public.recovery_master_rpc(text,jsonb)') is null then raise exception 'PRODUCTION_MASTER_REQUIRED';end if;
 if has_schema_privilege('authenticated','recovery_live','usage') or has_schema_privilege('anon','recovery_live','usage') then raise exception 'PRIVATE_SCHEMA_ACCESS_REVIEW_REQUIRED';end if;
 if to_regclass('recovery_live.sdm_status_batches') is not null or to_regclass('recovery_live.followup_links') is not null then raise exception 'INTEGRATION_ALREADY_PRESENT_REVIEW_REQUIRED';end if;
end $$;
-- Source: supabase/recovery-production-resume.sql
-- Retry-safe begin and fresh review after master changes. Existing ledger is preserved.

create or replace function recovery_live.recovery_begin(p_name text,p_hash text,p_rows integer,p_totals jsonb) returns uuid
language plpgsql security definer set search_path=recovery_live,pg_catalog as $$
declare batch uuid; rev bigint; previous recovery_imports;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') <>'admin' then raise exception 'FORBIDDEN'; end if;
 if p_hash !~ '^[a-f0-9]{64}$' or p_rows<1 or p_rows>500000 or nullif(btrim(p_name),'') is null then raise exception 'INVALID_MANIFEST';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'|'||p_hash,0));
 if exists(select 1 from recovery_imports where file_sha256=p_hash and status='committed') then raise exception 'FILE_ALREADY_COMMITTED';end if;
 select revision into rev from recovery_revision where id=1 for share;
 select * into previous from recovery_imports where actor=auth.uid() and file_sha256=p_hash and status in ('preview','validated') order by created_at desc limit 1 for update;
 if found then
  if previous.expected_rows<>p_rows or previous.expected_totals is distinct from p_totals then raise exception 'MANIFEST_REQUIRES_REVIEW';end if;
  if previous.base_revision=rev then return previous.id;end if;
  update recovery_imports set status='rejected',summary=summary||jsonb_build_object('restaged',true,'restaged_at',now(),'restaged_revision',rev) where id=previous.id;
 end if;
 insert into recovery_imports(file_name,file_sha256,actor,expected_rows,base_revision,expected_totals)
 values(p_name,p_hash,auth.uid(),p_rows,rev,p_totals) returning id into batch;
 return batch;
end $$;

-- Source: supabase/recovery-sdm-status-activation.sql
-- Optional SDM status extension. Review and test before applying to production.
-- Existing master RPC, financial tables, cases and permission scope are preserved.

do $$begin
 if to_regclass('recovery_live.recovery_people') is null then raise exception 'MASTER_REQUIRED';end if;
 if to_regclass('recovery_live.sdm_status_batches') is not null then raise exception 'SDM_ALREADY_INITIALIZED';end if;
end $$;
create table recovery_live.sdm_status_batches (
 id uuid primary key default gen_random_uuid(),actor uuid not null references auth.users(id),
 source_hash text not null,source_name text not null,base_revision bigint not null,
 records jsonb not null,review jsonb not null,committed_at timestamptz,superseded_at timestamptz,reason text
);
create unique index sdm_status_active_source on recovery_live.sdm_status_batches(actor,source_hash) where superseded_at is null;
create table recovery_live.sdm_status_changes (
 id bigint generated always as identity primary key,batch_id uuid not null references recovery_live.sdm_status_batches(id),
 nip text not null references recovery_live.recovery_people(nip),before_status text,after_status text not null,
 source_record jsonb not null,actor uuid not null references auth.users(id),reason text not null,
 created_at timestamptz not null default now(),unique(batch_id,nip)
);
alter table recovery_live.sdm_status_batches enable row level security;
alter table recovery_live.sdm_status_changes enable row level security;
revoke all on recovery_live.sdm_status_batches,recovery_live.sdm_status_changes from public,anon,authenticated;

create function public.recovery_sdm_rpc(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog set statement_timeout='60s' as $$
declare rev bigint; b recovery_live.sdm_status_batches; r jsonb; p recovery_live.recovery_people;
 items jsonb:='[]'; records jsonb:=p_payload->'records'; v_reason text:=btrim(p_payload->>'reason');
 batch_id uuid; n integer;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 if p_action='prepare' then
  if jsonb_typeof(records) is distinct from 'array' then raise exception 'INVALID_RECORDS';end if;
  n:=jsonb_array_length(records);
  if n<1 or n>500 or octet_length(records::text)>1048576 then raise exception 'INVALID_RECORDS';end if;
  if coalesce(p_payload->>'sourceHash','')!~'^[a-f0-9]{64}$' or length(coalesce(p_payload->>'sourceName','')) not between 1 and 255 then raise exception 'INVALID_SOURCE';end if;
  if (select count(distinct x->>'nip') from jsonb_array_elements(records) x)<>n then raise exception 'DUPLICATE_NIP';end if;
  select revision into rev from recovery_live.recovery_revision where id=1 for share;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||(p_payload->>'sourceHash'),0));
  select * into b from recovery_live.sdm_status_batches where actor=auth.uid() and source_hash=p_payload->>'sourceHash' and superseded_at is null;
  if found then
   if b.records<>records then raise exception 'SOURCE_REVIEW_CHANGED';end if;
   if b.committed_at is not null then return jsonb_build_object('id',b.id,'committed',true,'count',n);end if;
  end if;
  if rev is distinct from (p_payload->>'revision')::bigint then raise exception 'STALE_MASTER';end if;
  for r in select value from jsonb_array_elements(records) loop
   if coalesce(r->>'nip','')!~'^[0-9]{18}$' or coalesce(r->>'category','') not in ('SP3','Mengundurkan Diri','Meninggal Dunia','BUP') then raise exception 'INVALID_STATUS';end if;
   select * into p from recovery_live.recovery_people where nip=r->>'nip' and archived_at is null;
   if not found then raise exception 'UNMATCHED_NIP';end if;
   if upper(regexp_replace(btrim(p.nama),'\s+',' ','g'))<>upper(regexp_replace(btrim(coalesce(r->>'nama','')),'\s+',' ','g')) or p.bank is distinct from r->>'bank' then raise exception 'IDENTITY_REVIEW_REQUIRED';end if;
   items:=items||jsonb_build_array(jsonb_build_object('nip',p.nip,'nama',p.nama,'bank',p.bank,'before',p.status_sdm,'after',r->>'category','endDateRaw',r->'endDateRaw','reasonRaw',r->'reasonRaw'));
  end loop;
  if b.id is not null then
   if b.base_revision=rev then
    return jsonb_build_object('id',b.id,'count',n,'review',b.review,'committed',false);
   end if;
   update recovery_live.sdm_status_batches set superseded_at=now() where id=b.id;
  end if;
  insert into recovery_live.sdm_status_batches(actor,source_hash,source_name,base_revision,records,review)
  values(auth.uid(),p_payload->>'sourceHash',p_payload->>'sourceName',rev,records,items) returning id into batch_id;
  return jsonb_build_object('id',batch_id,'count',n,'review',items,'committed',false);
 elsif p_action='commit' then
  if coalesce(length(v_reason),0) not between 3 and 2000 then raise exception 'REASON_REQUIRED';end if;
  -- Same lock order as master commits: revision first, then batch.
  select revision into rev from recovery_live.recovery_revision where id=1 for update;
  select * into b from recovery_live.sdm_status_batches where id=(p_payload->>'batch')::uuid and actor=auth.uid() for update;
  if not found then raise exception 'BATCH_NOT_FOUND';end if;
  if b.superseded_at is not null then raise exception 'STALE_MASTER';end if;
  if b.committed_at is not null then return jsonb_build_object('saved',jsonb_array_length(b.records),'alreadyCommitted',true);end if;
  if rev<>b.base_revision then raise exception 'STALE_MASTER';end if;
  for r in select value from jsonb_array_elements(b.records) loop
   select * into p from recovery_live.recovery_people where nip=r->>'nip' and archived_at is null for update;
   if not found or p.nama is distinct from (select x->>'nama' from jsonb_array_elements(b.review) x where x->>'nip'=r->>'nip') then raise exception 'IDENTITY_REVIEW_REQUIRED';end if;
   insert into recovery_live.sdm_status_changes(batch_id,nip,before_status,after_status,source_record,actor,reason)
   values(b.id,p.nip,p.status_sdm,r->>'category',r,auth.uid(),v_reason);
   update recovery_live.recovery_people set status_sdm=r->>'category' where nip=p.nip;
  end loop;
  update recovery_live.sdm_status_batches set committed_at=now(),reason=v_reason where id=b.id;
  update recovery_live.recovery_revision set revision=revision+1 where id=1;
  return jsonb_build_object('saved',jsonb_array_length(b.records),'alreadyCommitted',false,'revision',rev+1);
 else raise exception 'INVALID_SDM_ACTION';end if;
end $$;
revoke all on function public.recovery_sdm_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.recovery_sdm_rpc(text,jsonb) to authenticated;

-- Source: supabase/recovery-followup-activation.sql
-- Optional extension: links only. Review before activating in production.

do $$begin
 if to_regclass('recovery_live.recovery_people') is null or to_regclass('public.action_plans') is null or to_regclass('public.bottlenecks') is null then raise exception 'FOLLOWUP_PREREQUISITES_MISSING';end if;
 if to_regclass('recovery_live.followup_links') is not null then raise exception 'FOLLOWUP_ALREADY_INITIALIZED';end if;
end $$;
create table recovery_live.followup_links (
 target_type text not null check(target_type in ('action','bottleneck')),target_no integer not null,
 nip text not null references recovery_live.recovery_people(nip),actor uuid not null references auth.users(id),
 created_at timestamptz not null default now(),removed_at timestamptz,
 primary key(target_type,target_no,nip)
);
create table recovery_live.followup_revision(id integer primary key check(id=1),revision bigint not null);
insert into recovery_live.followup_revision values(1,0);
create table recovery_live.followup_requests (
 id uuid primary key,actor uuid not null references auth.users(id),payload jsonb not null,result jsonb not null,
 created_at timestamptz not null default now()
);
create table recovery_live.followup_changes (
 id bigint generated always as identity primary key,request_id uuid not null references recovery_live.followup_requests(id),
 target_type text not null,target_no integer not null,nip text not null references recovery_live.recovery_people(nip),
 operation text not null check(operation in ('add','remove')),actor uuid not null references auth.users(id),
 reason text not null,created_at timestamptz not null default now(),unique(request_id,nip)
);
alter table recovery_live.followup_links enable row level security;
alter table recovery_live.followup_revision enable row level security;
alter table recovery_live.followup_requests enable row level security;
alter table recovery_live.followup_changes enable row level security;
revoke all on recovery_live.followup_links,recovery_live.followup_revision,recovery_live.followup_requests,recovery_live.followup_changes from public,anon,authenticated;

create function public.recovery_followup_rpc(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog set statement_timeout='60s' as $$
declare typ text:=p_payload->>'type'; target integer;
 mr bigint; lr bigint; target_time timestamptz; lim integer; request_id uuid;
 old_request recovery_live.followup_requests; nips jsonb:=p_payload->'nips'; person_nip text;
 v_reason text:=btrim(p_payload->>'reason'); op text:=p_payload->>'operation'; changed integer:=0; result jsonb;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 target:=(p_payload->>'target')::integer;
 if p_action is null or p_action not in ('meta','page','save') then raise exception 'INVALID_FOLLOWUP_ACTION';end if;
 if typ is null or typ not in ('action','bottleneck') or target is null or target<1 then raise exception 'INVALID_TARGET';end if;
 if p_action='save' then
  request_id:=(p_payload->>'requestId')::uuid;
  if request_id is null then raise exception 'REQUEST_REQUIRED';end if;
  -- Serializes retries without changing the money/master revision.
  select revision into lr from recovery_live.followup_revision where id=1 for update;
  select * into old_request from recovery_live.followup_requests where id=request_id;
  if found then
   if old_request.actor<>auth.uid() or old_request.payload<>p_payload then raise exception 'REQUEST_CONFLICT';end if;
   return old_request.result||jsonb_build_object('alreadySaved',true);
  end if;
  select revision into mr from recovery_live.recovery_revision where id=1 for share;
 else
  select revision into lr from recovery_live.followup_revision where id=1;
  select revision into mr from recovery_live.recovery_revision where id=1;
 end if;
 if typ='action' then
  select updated_at into target_time from public.action_plans where no=target and deleted_at is null for share;
 else
  select updated_at into target_time from public.bottlenecks where no=target and deleted_at is null for share;
 end if;
 if target_time is null then raise exception 'TARGET_UNAVAILABLE';end if;
 if p_action='meta' then
  return jsonb_build_object('revision',lr,'masterRevision',mr,'targetUpdatedAt',target_time,'count',(select count(*) from recovery_live.followup_links where target_type=typ and target_no=target and removed_at is null));
 elsif p_action='page' then
  lim:=coalesce((p_payload->>'limit')::integer,500);
  if lim<1 or lim>500 then raise exception 'INVALID_PAGE';end if;
  return jsonb_build_object('revision',lr,'masterRevision',mr,'rows',coalesce((select jsonb_agg(to_jsonb(x) order by nip) from
   (select l.nip,p.archived_at is null as available from recovery_live.followup_links l join recovery_live.recovery_people p on p.nip=l.nip
    where l.target_type=typ and l.target_no=target and l.removed_at is null and (coalesce(p_payload->>'after','')='' or l.nip>p_payload->>'after') order by l.nip limit lim) x),'[]'::jsonb));
 end if;
 if mr is distinct from (p_payload->>'masterRevision')::bigint or lr is distinct from (p_payload->>'revision')::bigint or target_time is distinct from (p_payload->>'targetUpdatedAt')::timestamptz then raise exception 'STALE_FOLLOWUP';end if;
 if op is null or op not in ('add','remove') or coalesce(length(v_reason),0) not between 3 and 2000 then raise exception 'INVALID_CHANGE';end if;
 if jsonb_typeof(nips) is distinct from 'array' then raise exception 'INVALID_NIPS';end if;
 if jsonb_array_length(nips) not between 1 and 500 or octet_length(nips::text)>20000 then raise exception 'INVALID_NIPS';end if;
 if (select count(distinct x) from jsonb_array_elements_text(nips) x)<>jsonb_array_length(nips) then raise exception 'DUPLICATE_NIP';end if;
 for person_nip in select value from jsonb_array_elements_text(nips) loop
  if person_nip!~'^[0-9]{18}$' then raise exception 'INVALID_NIP';end if;
  if op='add' then
   if not exists(select 1 from recovery_live.recovery_people where nip=person_nip and archived_at is null) then raise exception 'MASTER_PERSON_UNAVAILABLE';end if;
   if not exists(select 1 from recovery_live.recovery_obligations where nip=person_nip and nominal>0) then raise exception 'NO_POSITIVE_OBLIGATION';end if;
   if exists(select 1 from recovery_live.followup_links where target_type=typ and target_no=target and nip=person_nip and removed_at is null) then continue;end if;
  elsif not exists(select 1 from recovery_live.followup_links where target_type=typ and target_no=target and nip=person_nip and removed_at is null) then
   raise exception 'LINK_NOT_FOUND';
  end if;
  changed:=changed+1;
 end loop;
 result:=jsonb_build_object('changed',changed,'revision',lr+case when changed>0 then 1 else 0 end,'alreadySaved',false);
 insert into recovery_live.followup_requests(id,actor,payload,result) values(request_id,auth.uid(),p_payload,result);
 for person_nip in select value from jsonb_array_elements_text(nips) loop
  if op='add' then
   if exists(select 1 from recovery_live.followup_links where target_type=typ and target_no=target and nip=person_nip and removed_at is null) then continue;end if;
   insert into recovery_live.followup_links(target_type,target_no,nip,actor) values(typ,target,person_nip,auth.uid())
   on conflict(target_type,target_no,nip) do update set removed_at=null,actor=excluded.actor,created_at=now();
  else
   update recovery_live.followup_links set removed_at=now() where target_type=typ and target_no=target and nip=person_nip;
  end if;
  insert into recovery_live.followup_changes(request_id,target_type,target_no,nip,operation,actor,reason) values(request_id,typ,target,person_nip,op,auth.uid(),v_reason);
 end loop;
 if changed>0 then update recovery_live.followup_revision set revision=revision+1 where id=1;end if;
 return result;
end $$;
revoke all on function public.recovery_followup_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.recovery_followup_rpc(text,jsonb) to authenticated;

commit;
