-- Review and test before activating. Does not import personnel or replace the ledger.
begin;
do $$begin
 if to_regclass('recovery_live.recovery_revision') is null then raise exception 'MASTER_REQUIRED';end if;
 if to_regclass('recovery_live.casework_events') is not null then raise exception 'CASEWORK_ALREADY_INITIALIZED';end if;
end $$;
-- Preserve the exact deployed definitions before replacing the two wrappers.
create table recovery_live.casework_activation_backup (
 id smallint primary key check(id=1), master_rpc_definition text not null,
 case_link_definition text not null, baseline jsonb not null,
 created_at timestamptz not null default now()
);
alter table recovery_live.casework_activation_backup enable row level security;
revoke all on recovery_live.casework_activation_backup from public,anon,authenticated;
insert into recovery_live.casework_activation_backup(id,master_rpc_definition,case_link_definition,baseline)
select 1,pg_get_functiondef('public.recovery_master_rpc(text,jsonb)'::regprocedure),
pg_get_functiondef('recovery_live.check_link_case(bigint)'::regprocedure),
jsonb_build_object('revision',(select revision from recovery_live.recovery_revision where id=1),
 'people',(select count(*) from recovery_live.recovery_people),
 'obligation',(select sum(nominal) from recovery_live.recovery_obligations),
 'payment',(select sum(nominal) from recovery_live.recovery_payments),
 'cases',(select count(*) from public.sdm_cases));
create table recovery_live.casework_events (
 id uuid primary key, nip text not null references recovery_live.recovery_people(nip),
 event_type text not null check(event_type in ('note','status_report','status_verified','status_rejected','receipt_submitted','receipt_verified','receipt_rejected','workbook_match')),
 actor uuid not null references auth.users(id), created_at timestamptz not null default now(),
 payload jsonb not null, request_payload jsonb not null
);
create index on recovery_live.casework_events(nip,created_at);
create table recovery_live.direct_receipts (
 id uuid primary key references recovery_live.casework_events(id),
 obligation_id bigint not null references recovery_live.recovery_obligations(id),
 stage integer not null check(stage between 1 and 100), amount bigint not null check(amount>0),
 ntpn text not null check(ntpn ~ '^[A-Z0-9]{16}$'), payment_date date not null,
 evidence_path text not null, submitted_by uuid not null references auth.users(id),
 workbook_amount_at_submission bigint not null,
 verification text not null default 'pending' check(verification in ('pending','verified','rejected')),
 verified_by uuid references auth.users(id), verified_at timestamptz,
 included_import uuid references recovery_live.recovery_imports(id),
 check(verification<>'verified' or (verified_by is not null and verified_at is not null))
);
-- One NTPN may cover Tukin and UM, but not be entered twice for one obligation.
create unique index on recovery_live.direct_receipts(obligation_id,ntpn) where verification<>'rejected';
alter table recovery_live.casework_events enable row level security;
alter table recovery_live.direct_receipts enable row level security;
revoke all on recovery_live.casework_events,recovery_live.direct_receipts from public,anon,authenticated;

create function recovery_live.casework_import_review(p_batch uuid) returns jsonb
language plpgsql security definer set search_path=recovery_live,pg_catalog as $$
declare result jsonb;
begin
 if auth.uid() is null or public.current_app_role() is distinct from 'admin' then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from recovery_imports where id=p_batch and actor=auth.uid()) then raise exception 'INVALID_BATCH';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'nip',o.nip,'bank',o.bank,'kind',o.jenis,'year',o.tahun_kewajiban,'stage',r.stage,
 'amount',r.amount,'ntpn',r.ntpn,'paymentDate',r.payment_date,'before',coalesce(p.nominal,0),'after',coalesce((s.data->>'amount')::bigint,p.nominal,0),
 'changes',(select jsonb_agg(jsonb_build_object('stage',(x.data->>'stage')::integer,'before',coalesce(old.nominal,0),'after',(x.data->>'amount')::bigint)) from recovery_staging x left join recovery_payments old on old.obligation_id=o.id and old.tahap=(x.data->>'stage')::integer where x.import_id=p_batch and x.record_type='payment' and x.data->>'nip'=o.nip and x.data->>'bank'=o.bank and x.data->>'kind'=o.jenis and (x.data->>'year')::integer=o.tahun_kewajiban and coalesce(old.nominal,0)<>(x.data->>'amount')::bigint)) order by r.id),'[]') into result
 from direct_receipts r join recovery_obligations o on o.id=r.obligation_id
 left join recovery_staging s on s.import_id=p_batch and s.record_type='payment' and s.data->>'nip'=o.nip and s.data->>'bank'=o.bank and s.data->>'kind'=o.jenis and (s.data->>'year')::integer=o.tahun_kewajiban and (s.data->>'stage')::integer=r.stage
 left join recovery_payments p on p.obligation_id=o.id and p.tahap=r.stage
 where r.verification='verified' and r.included_import is null and exists(select 1 from recovery_staging x left join recovery_payments old on old.obligation_id=o.id and old.tahap=(x.data->>'stage')::integer where x.import_id=p_batch and x.record_type='payment' and x.data->>'nip'=o.nip and x.data->>'bank'=o.bank and x.data->>'kind'=o.jenis and (x.data->>'year')::integer=o.tahun_kewajiban and coalesce(old.nominal,0)<>(x.data->>'amount')::bigint);
 return result;
end $$;

create function recovery_live.casework_commit_import(p_batch uuid,p_reason text,p_choices jsonb default '[]') returns jsonb
language plpgsql security definer set search_path=recovery_live,pg_catalog as $$
declare required jsonb; item jsonb; result jsonb;
begin
 if auth.uid() is null or public.current_app_role() is distinct from 'admin' then raise exception 'FORBIDDEN';end if;
 perform 1 from recovery_revision where id=1 for update;
 if exists(select 1 from recovery_imports where id=p_batch and actor=auth.uid() and status='committed') then return recovery_commit(p_batch,p_reason);end if;
 required:=casework_import_review(p_batch);
 if jsonb_typeof(p_choices)<>'array' or jsonb_array_length(p_choices)<>jsonb_array_length(required) then raise exception 'DIRECT_RECEIPTS_REVIEW_REQUIRED';end if;
 for item in select value from jsonb_array_elements(required) loop
  if (select count(*) from jsonb_array_elements(p_choices)x where x->>'id'=item->>'id' and jsonb_typeof(x->'included')='boolean')<>1 then raise exception 'DIRECT_RECEIPTS_REVIEW_REQUIRED';end if;
 end loop;
 -- Explicitly matched receipts must fit the new amount of their exact stage.
 if exists(select 1 from jsonb_array_elements(required)r join jsonb_array_elements(p_choices)c on c->>'id'=r->>'id' where (c->>'included')::boolean
  group by r->>'nip',r->>'bank',r->>'kind',r->>'year',r->>'stage'
  having sum((r->>'amount')::bigint)>max((r->>'after')::bigint-(r->>'before')::bigint)) then raise exception 'MATCH_EXCEEDS_WORKBOOK_INCREASE';end if;
 -- Already matched individual evidence cannot silently survive a reduction.
 if exists(select 1 from direct_receipts r join recovery_obligations o on o.id=r.obligation_id
  join recovery_staging s on s.import_id=p_batch and s.record_type='payment' and s.data->>'nip'=o.nip and s.data->>'bank'=o.bank and s.data->>'kind'=o.jenis and (s.data->>'year')::integer=o.tahun_kewajiban and (s.data->>'stage')::integer=r.stage
  join recovery_payments p on p.obligation_id=o.id and p.tahap=r.stage where r.verification='verified' and r.included_import is not null and (s.data->>'amount')::bigint<p.nominal) then raise exception 'MATCHED_RECEIPT_CORRECTION_REQUIRES_REVIEW';end if;
 result:=recovery_commit(p_batch,p_reason);
 for item in select value from jsonb_array_elements(p_choices) where (value->>'included')::boolean loop
  update direct_receipts set included_import=p_batch where id=(item->>'id')::uuid;
  insert into casework_events(id,nip,event_type,actor,payload,request_payload)
   select gen_random_uuid(),o.nip,'workbook_match',auth.uid(),jsonb_build_object('receipt',r.id,'batch',p_batch,'reason',p_reason),'{}' from direct_receipts r join recovery_obligations o on o.id=r.obligation_id where r.id=(item->>'id')::uuid;
 end loop;
 if exists(select 1 from recovery_obligations o where
  coalesce((select sum(p.nominal) from recovery_payments p where p.obligation_id=o.id),0)+coalesce((select sum(r.amount) from direct_receipts r where r.obligation_id=o.id and r.verification='verified' and r.included_import is null),0)>o.nominal) then raise exception 'DIRECT_RECEIPT_OVERPAYMENT';end if;
 return result;
end $$;

create function public.recovery_casework_rpc(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=recovery_live,pg_catalog as $$
declare role_name text:=public.current_app_role(); rev bigint; n text:=p_payload->>'nip'; req uuid; old_event casework_events; v_receipt direct_receipts; oid bigint; kind text; event jsonb; evidence text; result jsonb;
begin
 if auth.uid() is null or coalesce(role_name,'') not in ('admin','editor','viewer') then raise exception 'FORBIDDEN';end if;
 if p_action='summary' then
  select revision into rev from recovery_revision where id=1;
  select coalesce(jsonb_agg(jsonb_build_object('nip',p.nip,'status',(select payload->>'status' from casework_events where nip=p.nip and event_type='status_verified' order by created_at desc,id desc limit 1),
   'needsReview',exists(select 1 from casework_events a where a.nip=p.nip and a.event_type='status_report' and not exists(select 1 from casework_events b where b.nip=a.nip and b.event_type in ('status_verified','status_rejected') and b.payload->>'report'=a.id::text)),
   'lastNote',(select payload from casework_events where nip=p.nip and event_type='note' order by created_at desc,id desc limit 1),
   'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'bank',o.bank,'kind',o.jenis,'year',o.tahun_kewajiban,'stage',r.stage,'amount',r.amount,'ntpn',r.ntpn,'paymentDate',r.payment_date,'verification',r.verification,'included',r.included_import is not null)) from direct_receipts r join recovery_obligations o on o.id=r.obligation_id where o.nip=p.nip),'[]')) order by p.nip),'[]') into result
  from (select * from recovery_people p where p.nip>coalesce(p_payload->>'after','') and exists(select 1 from casework_events where nip=p.nip) order by p.nip limit 500)p;
  return jsonb_build_object('revision',rev,'rows',result);
 end if;
 if p_action='import_review' then return casework_import_review((p_payload->>'batch')::uuid);end if;
 if p_action='commit_import' then return casework_commit_import((p_payload->>'batch')::uuid,p_payload->>'reason',coalesce(p_payload->'choices','[]'));end if;
 if not exists(select 1 from recovery_people where nip=n and archived_at is null) then raise exception 'UNKNOWN_PERSON';end if;
 if p_action='detail' then
  return jsonb_build_object('events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc) from casework_events e where nip=n),'[]'),
   'receipts',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('bank',o.bank,'kind',o.jenis,'year',o.tahun_kewajiban)) from direct_receipts r join recovery_obligations o on o.id=r.obligation_id where o.nip=n),'[]'));
 end if;
 if octet_length(p_payload::text)>65536 then raise exception 'PAYLOAD_TOO_LARGE';end if;
 if p_action<>'record' or role_name not in ('admin','editor') then raise exception 'FORBIDDEN';end if;
 perform 1 from recovery_revision where id=1 for update;
 req:=(p_payload->>'requestId')::uuid;
 select * into old_event from casework_events where id=req;
 if found then
  if old_event.actor<>auth.uid() or old_event.request_payload is distinct from p_payload then raise exception 'REQUEST_CHANGED';end if;
  return jsonb_build_object('saved',true,'id',req,'alreadySaved',true);
 end if;
 kind:=p_payload->>'type';event:=coalesce(p_payload->'data','{}');evidence:=nullif(event->>'evidencePath','');
 if char_length(coalesce(event->>'note','')) not between 3 and 4000 then raise exception 'NOTE_REQUIRED';end if;
 if evidence is not null and not exists(select 1 from storage.objects where bucket_id='recovery-evidence' and name=evidence and split_part(name,'/',1)=n and split_part(name,'/',2)=auth.uid()::text) then raise exception 'EVIDENCE_NOT_FOUND';end if;
 if kind='note' then
  if coalesce(event->>'status','') not in ('Belum Ditindaklanjuti','Proses Penagihan','Menunggu Respons','Perlu Telaah','Bukti Diterima','Selesai Penanganan') or nullif(btrim(event->>'pic'),'') is null or nullif(event->>'deadline','') is null then raise exception 'FOLLOWUP_FIELDS_REQUIRED';end if;
  perform (event->>'deadline')::date;
 elsif kind='status_report' then
  if evidence is null or event->>'status' not in ('Mengundurkan Diri','Meninggal Dunia','BUP','Pensiun') then raise exception 'STATUS_EVIDENCE_REQUIRED';end if;
 elsif kind in ('status_verified','status_rejected') then
  if role_name<>'admin' then raise exception 'ADMIN_REQUIRED';end if;
  select * into old_event from casework_events where id=(event->>'report')::uuid and nip=n and event_type='status_report';
  if not found or (kind='status_verified' and old_event.payload->>'status' is distinct from event->>'status') or exists(select 1 from casework_events where event_type in ('status_verified','status_rejected') and payload->>'report'=event->>'report') then raise exception 'INVALID_STATUS_REPORT';end if;
 elsif kind='receipt_submitted' then
  if evidence is null or event->>'notInWorkbook' is distinct from 'true' or coalesce(event->>'ntpn','')!~'^[A-Z0-9]{16}$' or (event->>'amount')::bigint<=0 or (event->>'stage')::integer not between 1 and 100 or (event->>'paymentDate')::date>(now() at time zone 'Asia/Jakarta')::date then raise exception 'INVALID_RECEIPT';end if;
  select id into oid from recovery_obligations where nip=n and bank=event->>'bank' and jenis=event->>'kind' and tahun_kewajiban=(event->>'year')::integer and nominal>0;
  if oid is null then raise exception 'INVALID_OBLIGATION';end if;
 elsif kind in ('receipt_verified','receipt_rejected') then
  if role_name<>'admin' then raise exception 'ADMIN_REQUIRED';end if;
  select q.* into v_receipt from direct_receipts q join recovery_obligations o on o.id=q.obligation_id where q.id=(event->>'receipt')::uuid and o.nip=n for update of q;
  if not found or v_receipt.verification<>'pending' then raise exception 'RECEIPT_ALREADY_REVIEWED';end if;
  if kind='receipt_verified' then
   if v_receipt.submitted_by=auth.uid() then raise exception 'SECOND_REVIEWER_REQUIRED';end if;
   if not exists(select 1 from storage.objects where bucket_id='recovery-evidence' and name=v_receipt.evidence_path) then raise exception 'EVIDENCE_NOT_FOUND';end if;
   if event->>'includedExisting'='true' then
    if coalesce((select nominal from recovery_payments where obligation_id=v_receipt.obligation_id and tahap=v_receipt.stage),0)<v_receipt.amount+coalesce((select sum(amount) from direct_receipts where obligation_id=v_receipt.obligation_id and stage=v_receipt.stage and verification='verified' and included_import is not null),0) then raise exception 'MATCH_EXCEEDS_WORKBOOK_AMOUNT';end if;
   else
    if coalesce((select nominal from recovery_payments where obligation_id=v_receipt.obligation_id and tahap=v_receipt.stage),0)<>v_receipt.workbook_amount_at_submission then raise exception 'WORKBOOK_CHANGED_RECHECK_RECEIPT';end if;
    if (select nominal from recovery_obligations where id=v_receipt.obligation_id)<v_receipt.amount+coalesce((select sum(nominal) from recovery_payments where obligation_id=v_receipt.obligation_id),0)+coalesce((select sum(amount) from direct_receipts where obligation_id=v_receipt.obligation_id and verification='verified' and included_import is null),0) then raise exception 'DIRECT_RECEIPT_OVERPAYMENT';end if;
   end if;
  end if;
 else raise exception 'INVALID_EVENT';end if;
 insert into casework_events(id,nip,event_type,actor,payload,request_payload)values(req,n,kind,auth.uid(),event,p_payload);
 if kind='receipt_submitted' then insert into direct_receipts(id,obligation_id,stage,amount,ntpn,payment_date,evidence_path,submitted_by,workbook_amount_at_submission)values(req,oid,(event->>'stage')::integer,(event->>'amount')::bigint,event->>'ntpn',(event->>'paymentDate')::date,evidence,auth.uid(),coalesce((select nominal from recovery_payments where obligation_id=oid and tahap=(event->>'stage')::integer),0));end if;
 if kind in ('receipt_verified','receipt_rejected') then update direct_receipts set verification=case when kind='receipt_verified' then 'verified' else 'rejected' end,verified_by=auth.uid(),verified_at=now(),included_import=case when kind='receipt_verified' and event->>'includedExisting'='true' then (select source_import from recovery_payments where obligation_id=v_receipt.obligation_id and tahap=v_receipt.stage) else null end where id=v_receipt.id;end if;
 update recovery_revision set revision=revision+1 where id=1;
 return jsonb_build_object('saved',true,'id',req,'alreadySaved',false);
end $$;
revoke all on function recovery_live.casework_import_review(uuid),recovery_live.casework_commit_import(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.recovery_casework_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.recovery_casework_rpc(text,jsonb) to authenticated;
-- Guard the existing import path, including older frontend versions.
create function recovery_live.casework_finance(p_nip text) returns jsonb
language sql stable security definer set search_path=recovery_live,pg_catalog as $$
 with balances as(select coalesce(sum(o.nominal),0) obligation,
 coalesce(sum(coalesce((select sum(p.nominal) from recovery_payments p where p.obligation_id=o.id),0)+coalesce((select sum(r.amount) from direct_receipts r where r.obligation_id=o.id and r.verification='verified' and r.included_import is null),0)),0) payment,
 coalesce(sum(coalesce((select sum(p.nominal) from recovery_payments p where p.obligation_id=o.id and p.verification='verified'),0)+coalesce((select sum(r.amount) from direct_receipts r where r.obligation_id=o.id and r.verification='verified' and (r.included_import is null or not exists(select 1 from recovery_payments p where p.obligation_id=o.id and p.tahap=r.stage and p.verification='verified'))),0)),0) verified
 from recovery_obligations o where o.nip=p_nip and o.nominal>0)
 select jsonb_build_object('obligation',obligation,'payment',payment,'remaining',obligation-payment,'verified',verified) from balances
$$;
revoke all on function recovery_live.casework_finance(text) from public,anon,authenticated;
create or replace function recovery_live.check_link_case(p_case bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare c public.sdm_cases; p recovery_live.recovery_people; f jsonb;
begin
 if auth.uid() is null or public.current_app_role() is distinct from 'admin' then raise exception 'FORBIDDEN';end if;
 select * into c from public.sdm_cases where id=p_case for share;
 if not found then raise exception 'CASE_NOT_FOUND';end if;
 if c.deleted_at is not null then raise exception 'CASE_ARCHIVED';end if;
 select * into p from recovery_live.recovery_people where nip=c.nip and archived_at is null;
 if not found then raise exception 'MASTER_PERSON_NOT_FOUND';end if;
 if upper(regexp_replace(btrim(c.nama),'\s+',' ','g'))<>upper(regexp_replace(btrim(p.nama),'\s+',' ','g')) then raise exception 'CASE_NAME_MISMATCH';end if;
 if c.bank<>p.bank then raise exception 'CASE_BANK_MISMATCH';end if;
 f:=recovery_live.casework_finance(c.nip);
 if (f->>'obligation')::bigint<=0 then raise exception 'MASTER_OBLIGATION_NOT_FOUND';end if;
 if c.status='Lunas Terverifikasi' and ((f->>'remaining')::bigint>0 or (f->>'verified')::bigint<(f->>'obligation')::bigint) then raise exception 'CASE_VERIFICATION_REQUIRES_REVIEW';end if;
 return to_jsonb(c);
end $$;
revoke all on function recovery_live.check_link_case(bigint) from public,anon,authenticated;
alter function public.recovery_master_rpc(text,jsonb) rename to recovery_master_rpc_before_casework;
revoke all on function public.recovery_master_rpc_before_casework(text,jsonb) from public,anon,authenticated;
create function public.recovery_master_rpc(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=recovery_live,pg_catalog set statement_timeout='60s' as $$
declare result jsonb; row_value jsonb; rows_value jsonb:='[]'; financial jsonb;
begin
 if p_action='recovery_commit' then return recovery_live.casework_commit_import((p_payload->>'p_batch')::uuid,p_payload->>'p_reason',coalesce(p_payload->'receiptChoices','[]'));end if;
 result:=public.recovery_master_rpc_before_casework(p_action,p_payload);
 if p_action='recovery_linked_cases' then
  for row_value in select value from jsonb_array_elements(result->'rows') loop
   if row_value->>'source'='Master tersimpan' then
    financial:=casework_finance(row_value->'manual'->>'nip');
    row_value:=jsonb_set(row_value,'{finance}',financial);
    row_value:=jsonb_set(row_value,'{warnings}',case when row_value->'manual'->>'status'='Lunas Terverifikasi' and ((financial->>'remaining')::bigint>0 or (financial->>'verified')::bigint<(financial->>'obligation')::bigint) then '["Status lunas manual belum didukung nominal/verifikasi master"]'::jsonb else '[]'::jsonb end);
   end if;
   rows_value:=rows_value||jsonb_build_array(row_value);
  end loop;
  result:=jsonb_set(result,'{rows}',rows_value);
 end if;
 return result;
end $$;
revoke all on function public.recovery_master_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.recovery_master_rpc(text,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('recovery-evidence','recovery-evidence',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do nothing;
do $$begin if exists(select 1 from storage.buckets where id='recovery-evidence' and public) then raise exception 'EVIDENCE_BUCKET_MUST_BE_PRIVATE';end if;end $$;
create policy recovery_evidence_read on storage.objects for select to authenticated using(bucket_id='recovery-evidence' and public.current_app_role() in ('admin','editor','viewer'));
create policy recovery_evidence_upload on storage.objects for insert to authenticated with check(bucket_id='recovery-evidence' and public.current_app_role() in ('admin','editor') and split_part(name,'/',2)=auth.uid()::text and exists(select 1 from recovery_live.recovery_people where nip=split_part(name,'/',1)));
-- The private schema is not granted to authenticated: policy calls a narrow checker instead.
create function public.recovery_evidence_person(p_nip text) returns boolean language sql stable security definer set search_path=recovery_live,pg_catalog as $$select auth.uid() is not null and public.current_app_role() in ('admin','editor') and exists(select 1 from recovery_people where nip=p_nip and archived_at is null)$$;
revoke all on function public.recovery_evidence_person(text) from public,anon,authenticated;
grant execute on function public.recovery_evidence_person(text) to authenticated;
alter policy recovery_evidence_upload on storage.objects with check(bucket_id='recovery-evidence' and public.current_app_role() in ('admin','editor') and split_part(name,'/',2)=auth.uid()::text and public.recovery_evidence_person(split_part(name,'/',1)));
commit;
