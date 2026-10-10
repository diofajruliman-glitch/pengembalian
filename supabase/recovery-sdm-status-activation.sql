-- Optional SDM status extension. Review and test before applying to production.
-- Existing master RPC, financial tables, cases and permission scope are preserved.
begin;
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
commit;
