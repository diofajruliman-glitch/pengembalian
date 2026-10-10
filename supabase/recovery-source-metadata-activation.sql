-- Optional, private metadata extension. Do not apply until local verification is complete.
begin;
do $$begin
 if to_regclass('recovery_live.recovery_revision') is null then raise exception 'MASTER_REQUIRED';end if;
 if to_regclass('recovery_live.source_metadata_batches') is not null then raise exception 'METADATA_ALREADY_INITIALIZED';end if;
end $$;
create table recovery_live.source_metadata_batches(
 id uuid primary key,actor uuid not null references auth.users(id),source_hash text not null,source_name text not null,
 base_revision bigint not null,payload jsonb not null,review jsonb not null,committed_at timestamptz,reason text
);
create table recovery_live.person_source_metadata(
 nip text primary key references recovery_live.recovery_people(nip),metadata jsonb not null,
 source_hash text not null,batch_id uuid not null references recovery_live.source_metadata_batches(id)
);
create table recovery_live.source_ntpn_references(
 bank text not null,kind text not null,year integer not null,stage integer not null,code text not null,
 source_record jsonb not null,source_hash text not null,batch_id uuid not null references recovery_live.source_metadata_batches(id),
 primary key(bank,kind,year,stage,code)
);
create table recovery_live.source_metadata_changes(
 id bigint generated always as identity primary key,batch_id uuid not null references recovery_live.source_metadata_batches(id),
 item_key text not null,before_value jsonb,after_value jsonb not null,actor uuid not null references auth.users(id),reason text not null,
 created_at timestamptz not null default now(),unique(batch_id,item_key)
);
alter table recovery_live.source_metadata_batches enable row level security;
alter table recovery_live.person_source_metadata enable row level security;
alter table recovery_live.source_ntpn_references enable row level security;
alter table recovery_live.source_metadata_changes enable row level security;
revoke all on recovery_live.source_metadata_batches,recovery_live.person_source_metadata,recovery_live.source_ntpn_references,recovery_live.source_metadata_changes from public,anon,authenticated;
create function recovery_live.source_status(v text) returns text language sql immutable as $$
 select case upper(regexp_replace(btrim(coalesce(v,'')),'\s+',' ','g'))
 when '' then 'Aktif' when 'AKTIF' then 'Aktif' when 'BUP' then 'BUP'
 when 'PENSIUN' then 'Pensiun' when 'SUDAH PENSIUN' then 'Pensiun'
 when 'RESIGN' then 'Mengundurkan Diri' when 'MENGUNDURKAN DIRI' then 'Mengundurkan Diri'
 when 'MENINGGAL DUNIA' then 'Meninggal Dunia' else 'Perlu pemeriksaan' end
$$;
revoke all on function recovery_live.source_status(text) from public,anon,authenticated;

create function public.recovery_metadata_rpc(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog set statement_timeout='60s' as $$
declare rev bigint;b recovery_live.source_metadata_batches;r jsonb;s jsonb;p recovery_live.recovery_people;
 records jsonb:=p_payload->'records';refs jsonb:=p_payload->'references';items jsonb:='[]';old_value jsonb;
 request_id uuid;v_reason text:=btrim(p_payload->>'reason');lim integer;item_key text;invalid boolean;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 if p_action='meta' then
  return jsonb_build_object('revision',(select revision from recovery_live.recovery_revision where id=1),'people',(select count(*) from recovery_live.person_source_metadata),'references',(select count(*) from recovery_live.source_ntpn_references));
 elsif p_action='page' then
  lim:=least(500,greatest(1,coalesce((p_payload->>'limit')::integer,500)));
  return jsonb_build_object('revision',(select revision from recovery_live.recovery_revision where id=1),'rows',coalesce((select jsonb_agg(to_jsonb(x) order by nip) from (select nip,metadata from recovery_live.person_source_metadata where nip>coalesce(p_payload->>'after','') order by nip limit lim)x),'[]'::jsonb));
 elsif p_action='references' then
  return jsonb_build_object('revision',(select revision from recovery_live.recovery_revision where id=1),'rows',coalesce((select jsonb_agg(source_record order by bank,kind,year,stage,code) from recovery_live.source_ntpn_references),'[]'::jsonb));
 elsif p_action='prepare' then
  if jsonb_typeof(records) is distinct from 'array' or jsonb_typeof(refs) is distinct from 'array' then raise exception 'INVALID_RECORDS';end if;
  if jsonb_array_length(records)>1000 or jsonb_array_length(refs)>500 or jsonb_array_length(records)+jsonb_array_length(refs)<1 or octet_length(p_payload::text)>2097152 then raise exception 'INVALID_RECORDS';end if;
  if coalesce(p_payload->>'sourceHash','')!~'^[a-f0-9]{64}$' or length(coalesce(p_payload->>'sourceName','')) not between 1 and 255 then raise exception 'INVALID_SOURCE';end if;
  request_id:=(p_payload->>'requestId')::uuid;if request_id is null then raise exception 'REQUEST_ID_REQUIRED';end if;
  select revision into rev from recovery_live.recovery_revision where id=1 for share;
  perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
  select * into b from recovery_live.source_metadata_batches where id=request_id;
  if found then
   if b.actor<>auth.uid() or b.payload<>p_payload then raise exception 'REQUEST_CONFLICT';end if;
   if b.committed_at is not null then return jsonb_build_object('id',b.id,'committed',true,'count',jsonb_array_length(records),'references',jsonb_array_length(refs));end if;
   if b.base_revision<>rev then raise exception 'STALE_MASTER';end if;
   return jsonb_build_object('id',b.id,'committed',false,'count',jsonb_array_length(records),'references',jsonb_array_length(refs),'review',b.review);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('metadata-source|'||(p_payload->>'sourceHash'),0));
  select * into b from recovery_live.source_metadata_batches where source_hash=p_payload->>'sourceHash' and committed_at is not null and payload->'records'=records and payload->'references'=refs order by committed_at desc limit 1;
  if found then return jsonb_build_object('id',b.id,'committed',true,'count',jsonb_array_length(records),'references',jsonb_array_length(refs));end if;
  if rev is distinct from (p_payload->>'revision')::bigint then raise exception 'STALE_MASTER';end if;
  if (select count(distinct x->>'nip') from jsonb_array_elements(records)x)<>jsonb_array_length(records) then raise exception 'DUPLICATE_NIP';end if;
  if (select count(distinct concat_ws('|',x->>'bank',x->>'kind',x->>'year',x->>'stage',x->>'code')) from jsonb_array_elements(refs)x)<>jsonb_array_length(refs) then raise exception 'DUPLICATE_REFERENCE';end if;
  for r in select value from jsonb_array_elements(records) loop
   select * into p from recovery_live.recovery_people where nip=r->>'nip' and archived_at is null;
   if not found then raise exception 'UNMATCHED_NIP';end if;
   if p.bank is distinct from r->>'bank' or upper(regexp_replace(btrim(p.nama),'\s+',' ','g'))<>upper(regexp_replace(btrim(coalesce(r->>'nama','')),'\s+',' ','g')) then raise exception 'IDENTITY_REVIEW_REQUIRED';end if;
   if coalesce(r->'metadata'->>'status','') not in ('Aktif','BUP','Pensiun','Mengundurkan Diri','Meninggal Dunia','Perlu pemeriksaan') or jsonb_typeof(r->'metadata'->'needsReview') is distinct from 'boolean' or jsonb_typeof(r->'metadata'->'sources') is distinct from 'array' or jsonb_array_length(r->'metadata'->'sources') not between 1 and 10 then raise exception 'INVALID_METADATA';end if;
   for s in select value from jsonb_array_elements(r->'metadata'->'sources') loop
    if coalesce(s->>'status','') not in ('Aktif','BUP','Pensiun','Mengundurkan Diri','Meninggal Dunia','Perlu pemeriksaan') or length(coalesce(s->>'sheet','')) not between 1 and 255 or length(coalesce(s->>'raw',''))>2000 then raise exception 'INVALID_SOURCE_STATUS';end if;
    if s->>'status'<>'Perlu pemeriksaan' and s->>'status' is distinct from recovery_live.source_status(s->>'raw') then raise exception 'SOURCE_STATUS_MISMATCH';end if;
   end loop;
   select exists(select 1 from jsonb_array_elements(r->'metadata'->'sources')x where x->>'status'='Perlu pemeriksaan') or (select count(distinct case when x->>'status'='BUP' then 'Pensiun' else x->>'status' end) from jsonb_array_elements(r->'metadata'->'sources')x where x->>'status' not in ('Aktif','Perlu pemeriksaan'))>1 into invalid;
   if (r->'metadata'->>'needsReview')::boolean is distinct from invalid then raise exception 'REVIEW_GUARD_REQUIRED';end if;
   if r->'metadata'->>'status'='Aktif' and exists(select 1 from jsonb_array_elements(r->'metadata'->'sources')x where x->>'status' not in ('Aktif','Perlu pemeriksaan')) then raise exception 'INVALID_ACTIVE_STATUS';end if;
   if r->'metadata'->>'status' not in ('Aktif','Perlu pemeriksaan') and not exists(select 1 from jsonb_array_elements(r->'metadata'->'sources')x where x->>'status'=r->'metadata'->>'status') then raise exception 'UNCORROBORATED_STATUS';end if;
   select metadata into old_value from recovery_live.person_source_metadata where nip=p.nip;
   items:=items||jsonb_build_array(jsonb_build_object('key',p.nip,'nip',p.nip,'nama',p.nama,'bank',p.bank,'before',coalesce(old_value,jsonb_build_object('status',p.status_sdm)),'after',r->'metadata'));
  end loop;
  for r in select value from jsonb_array_elements(refs) loop
   if coalesce(r->>'bank','') not in ('Mandiri','BRI','BSI') or coalesce(r->>'kind','') not in ('TUKIN','UM') or coalesce(r->>'code','')!~'^[A-Z0-9]{16}$' or (r->>'year')::integer not between 2000 and 2100 or (r->>'stage')::integer not between 1 and 100 or r->>'year' is null or r->>'stage' is null or r->>'scope' is distinct from 'payment-stage' or r->>'verification' is distinct from 'pending' or length(coalesce(r->>'sheet','')) not between 1 and 255 or coalesce((r->>'row')::integer,0)<1 or coalesce((r->>'column')::integer,0)<1 then raise exception 'INVALID_NTPN_REFERENCE';end if;
   if not exists(select 1 from recovery_live.recovery_payments q join recovery_live.recovery_obligations o on o.id=q.obligation_id where o.bank=r->>'bank' and o.jenis=r->>'kind' and o.tahun_kewajiban=(r->>'year')::integer and q.tahap=(r->>'stage')::integer and q.nominal>0) then raise exception 'NO_STAGE_PAYMENT';end if;
   item_key:=concat_ws('|','NTPN',r->>'bank',r->>'kind',r->>'year',r->>'stage',r->>'code');
   select source_record into old_value from recovery_live.source_ntpn_references where bank=r->>'bank' and kind=r->>'kind' and year=(r->>'year')::integer and stage=(r->>'stage')::integer and code=r->>'code';
   items:=items||jsonb_build_array(jsonb_build_object('key',item_key,'before',old_value,'after',r));
  end loop;
  insert into recovery_live.source_metadata_batches(id,actor,source_hash,source_name,base_revision,payload,review) values(request_id,auth.uid(),p_payload->>'sourceHash',p_payload->>'sourceName',rev,p_payload,items);
  return jsonb_build_object('id',request_id,'committed',false,'count',jsonb_array_length(records),'references',jsonb_array_length(refs),'review',items);
 elsif p_action='commit' then
  if coalesce(length(v_reason),0) not between 3 and 2000 then raise exception 'REASON_REQUIRED';end if;
  select revision into rev from recovery_live.recovery_revision where id=1 for update;
  select * into b from recovery_live.source_metadata_batches where id=(p_payload->>'batch')::uuid and actor=auth.uid() for update;
  if not found then raise exception 'BATCH_NOT_FOUND';end if;
  if b.committed_at is not null then return jsonb_build_object('alreadyCommitted',true,'saved',jsonb_array_length(b.review));end if;
  if rev<>b.base_revision then raise exception 'STALE_MASTER';end if;
  for r in select value from jsonb_array_elements(b.payload->'records') loop
   select * into p from recovery_live.recovery_people where nip=r->>'nip' and archived_at is null for update;
   if not found or p.nama is distinct from (select x->>'nama' from jsonb_array_elements(b.review)x where x->>'nip'=r->>'nip') or p.bank is distinct from r->>'bank' then raise exception 'IDENTITY_REVIEW_REQUIRED';end if;
   insert into recovery_live.person_source_metadata(nip,metadata,source_hash,batch_id) values(p.nip,r->'metadata',b.source_hash,b.id) on conflict(nip) do update set metadata=excluded.metadata,source_hash=excluded.source_hash,batch_id=excluded.batch_id;
   -- Held categories stay separate from existing accepted status.
   if not (r->'metadata'->>'needsReview')::boolean then update recovery_live.recovery_people set status_sdm=r->'metadata'->>'status' where nip=p.nip;end if;
  end loop;
  for r in select value from jsonb_array_elements(b.payload->'references') loop
   insert into recovery_live.source_ntpn_references(bank,kind,year,stage,code,source_record,source_hash,batch_id) values(r->>'bank',r->>'kind',(r->>'year')::integer,(r->>'stage')::integer,r->>'code',r,b.source_hash,b.id) on conflict(bank,kind,year,stage,code) do update set source_record=excluded.source_record,source_hash=excluded.source_hash,batch_id=excluded.batch_id;
  end loop;
  for r in select value from jsonb_array_elements(b.review) loop
   insert into recovery_live.source_metadata_changes(batch_id,item_key,before_value,after_value,actor,reason) values(b.id,r->>'key',r->'before',r->'after',auth.uid(),v_reason);
  end loop;
  update recovery_live.source_metadata_batches set committed_at=now(),reason=v_reason where id=b.id;
  update recovery_live.recovery_revision set revision=revision+1 where id=1;
  return jsonb_build_object('saved',jsonb_array_length(b.review),'revision',rev+1,'alreadyCommitted',false);
 else raise exception 'INVALID_METADATA_ACTION';end if;
end $$;
revoke all on function public.recovery_metadata_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.recovery_metadata_rpc(text,jsonb) to authenticated;
commit;
