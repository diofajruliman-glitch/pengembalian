-- Apply after interview-signatories.sql and interview-monitoring-activation.sql.
-- This additive activation preserves existing cases, answers, locks and audits.
begin;

alter table public.interview_cases
 add column if not exists deferred_reason text not null default '',
 add column if not exists deferred_at timestamptz,
 add column if not exists deferred_by uuid references auth.users(id);
alter table public.interview_cases drop constraint if exists interview_cases_status_check;
alter table public.interview_cases add constraint interview_cases_status_check
 check (status in ('Terjadwal','Dalam wawancara','Draf','Tertunda','Selesai'));
alter table public.interview_cases drop constraint if exists interview_cases_deferred_reason_check;
alter table public.interview_cases add constraint interview_cases_deferred_reason_check
 check (length(deferred_reason)<=2000 and
  (status<>'Tertunda' or (length(btrim(deferred_reason))>=5 and deferred_at is not null and deferred_by is not null)));

create or replace function interview_private.interview_action(p_nik text,p_action text,p_revision integer,p_payload jsonb default '{}'::jsonb)
returns public.interview_cases language plpgsql security definer
set search_path=pg_catalog,public,interview_private as $$
declare
 c public.interview_cases; old_c public.interview_cases;
 actor uuid:=auth.uid(); app_role text:=public.current_app_role();
 k text; v jsonb; reason text; write_draft boolean:=false;
begin
 if actor is null or coalesce(app_role,'') not in ('admin','editor','interviewer') then raise exception 'INTERVIEW_FORBIDDEN';end if;
 select * into c from public.interview_cases where nik=p_nik for update;
 if not found then raise exception 'INTERVIEW_NOT_FOUND';end if;
 if app_role='interviewer' and not exists(select 1 from public.interviewer_assignments a where a.user_id=actor and a.room_id=c.room_id) then raise exception 'INTERVIEW_FORBIDDEN';end if;
 if p_revision is null or c.revision<>p_revision then raise exception 'INTERVIEW_CONFLICT: Data telah berubah. Muat ulang sebelum melanjutkan.';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>220000 then raise exception 'INTERVIEW_INVALID';end if;
 old_c:=c;
 if p_action='start' then
  if c.status='Selesai' then raise exception 'INTERVIEW_FINALIZED';end if;
  if c.locked_by is not null and c.locked_by<>actor then raise exception 'INTERVIEW_LOCKED';end if;
  -- Resume keeps the first actual start and the last deferral as audit context.
  c.started_at:=coalesce(c.started_at,clock_timestamp());c.locked_by:=actor;c.status:='Dalam wawancara';
 elsif p_action in ('save','finalize','defer') then
  if c.status='Selesai' then raise exception 'INTERVIEW_FINALIZED';end if;
  if p_action='defer' then
   if c.status='Tertunda' then raise exception 'INTERVIEW_DEFERRED: Lanjutkan wawancara sebelum memperbarui penundaan atau isian BAP.';end if;
   if c.locked_by is not null and c.locked_by<>actor then raise exception 'INTERVIEW_LOCKED';end if;
   if jsonb_typeof(p_payload->'reason') is distinct from 'string' then raise exception 'INTERVIEW_DEFER_REASON_REQUIRED: Jelaskan alasan penundaan 5–2000 karakter.';end if;
   reason:=regexp_replace(p_payload->>'reason','^[[:space:]]+|[[:space:]]+$','','g');
   if length(reason)<5 or length(reason)>2000 then raise exception 'INTERVIEW_DEFER_REASON_REQUIRED: Jelaskan alasan penundaan 5–2000 karakter.';end if;
   write_draft:=p_payload ? 'answers' or p_payload ? 'identity';
   -- Before Mulai, an absent participant can be deferred without inventing a
   -- start or writing BAP answers. Started drafts may be saved atomically.
   if write_draft and (c.started_at is null or c.locked_by is distinct from actor) then raise exception 'INTERVIEW_LOCKED: Mulai wawancara dahulu sebelum menyimpan isian BAP.';end if;
  else
   if c.status='Tertunda' then raise exception 'INTERVIEW_DEFERRED: Lanjutkan wawancara sebelum menyimpan atau menyelesaikan BAP.';end if;
   if c.started_at is null or c.locked_by is distinct from actor then raise exception 'INTERVIEW_LOCKED: Mulai atau ambil alih melalui admin dahulu.';end if;
   write_draft:=true;
  end if;
  if write_draft then
   if jsonb_typeof(p_payload->'answers') is distinct from 'object' or jsonb_typeof(p_payload->'identity') is distinct from 'object' then raise exception 'INTERVIEW_INVALID';end if;
   for k,v in select * from jsonb_each(p_payload->'answers') loop
    if k!~ '^([1-9]|1[0-9]|2[0-2])$' or jsonb_typeof(v)<>'string' or length(v#>>'{}')>8000 then raise exception 'INTERVIEW_INVALID_ANSWER';end if;
   end loop;
   for k,v in select * from jsonb_each(p_payload->'identity') loop
    if k not in ('pangkat','jabatan','unitKerja','nomorSurat','tanggalSurat','kota','pewawancaraNama','pewawancaraNip') or jsonb_typeof(v)<>'string' or length(v#>>'{}')>500 then raise exception 'INTERVIEW_INVALID_IDENTITY';end if;
   end loop;
   if coalesce(p_payload->'identity'->>'tanggalSurat','')<>'' then
    if (p_payload->'identity'->>'tanggalSurat')!~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INTERVIEW_INVALID_DATE';end if;
    perform (p_payload->'identity'->>'tanggalSurat')::date;
   end if;
   -- Preserve partial signatory edits in drafts, normalize a complete NIP,
   -- and require canonical signatory identity only at finalization.
   if regexp_replace(coalesce(p_payload->'identity'->>'pewawancaraNip',''),'[[:space:]]','','g')~ '^[0-9]{18}$' then
    p_payload:=jsonb_set(p_payload,'{identity,pewawancaraNip}',to_jsonb(regexp_replace(p_payload->'identity'->>'pewawancaraNip','[[:space:]]','','g')));
   end if;
   c.answers:=p_payload->'answers';c.identity_details:=p_payload->'identity';
  end if;
  if p_action='defer' then
   c.status:='Tertunda';c.finished_at:=null;c.locked_by:=actor;
   c.deferred_reason:=reason;c.deferred_at:=clock_timestamp();c.deferred_by:=actor;
  else
   c.status:='Draf';
   if p_action='finalize' then
    for i in 1..22 loop
     if regexp_replace(coalesce(c.answers->>i::text,''),'[[:space:]]','','g')='' then raise exception 'INTERVIEW_INCOMPLETE: Jawaban % belum diisi.',i;end if;
    end loop;
    foreach k in array array['pangkat','jabatan','unitKerja','nomorSurat','tanggalSurat','kota','pewawancaraNama','pewawancaraNip'] loop
     if regexp_replace(coalesce(c.identity_details->>k,''),'[[:space:]]','','g')='' then raise exception 'INTERVIEW_INCOMPLETE: % belum diisi.',k;end if;
    end loop;
    if regexp_replace(coalesce(c.person->>'nama',''),'[[:space:]]','','g')='' or regexp_replace(coalesce(c.person->>'nip',''),'[[:space:]]','','g')='' then raise exception 'INTERVIEW_INCOMPLETE_IDENTITY';end if;
    if regexp_replace(coalesce(c.identity_details->>'pewawancaraNama',''),'[[:space:]]','','g')='' then raise exception 'INTERVIEW_INCOMPLETE: Nama pewawancara belum diisi.';end if;
    if coalesce(c.identity_details->>'pewawancaraNip','')!~ '^[0-9]{18}$' then raise exception 'INTERVIEW_INVALID_SIGNATORY_NIP: NIP pewawancara harus terdiri dari 18 digit.';end if;
    c.status:='Selesai';c.finished_at:=clock_timestamp();
   end if;
  end if;
 elsif p_action='revise' then
  if c.status<>'Selesai' or c.started_at is null then raise exception 'INTERVIEW_NOT_FINALIZED: Revisi ini hanya untuk BAP yang sudah selesai.';end if;
  if app_role<>'admin' and c.locked_by is distinct from actor and app_role<>'interviewer' then raise exception 'INTERVIEW_LOCKED';end if;
  c.status:='Draf';c.finished_at:=null;c.locked_by:=actor;
 elsif p_action='reopen' then
  if app_role<>'admin' or length(btrim(coalesce(p_payload->>'reason','')))<5 then raise exception 'INTERVIEW_ADMIN_REASON_REQUIRED';end if;
  c.status:=case when c.started_at is null then 'Terjadwal' else 'Draf' end;c.finished_at:=null;c.locked_by:=null;
 elsif p_action='schedule' then
  if app_role<>'admin' then raise exception 'INTERVIEW_FORBIDDEN';end if;
  if c.status='Tertunda' then raise exception 'INTERVIEW_DEFERRED: Buka kembali penundaan dengan alasan sebelum mengubah jadwal.';end if;
  if c.started_at is not null then raise exception 'INTERVIEW_ALREADY_STARTED';end if;
  c.room_id:=coalesce(p_payload->>'roomId',c.room_id);
  c.scheduled_date:=coalesce((p_payload->>'date')::date,c.scheduled_date);
  c.scheduled_time:=coalesce((p_payload->>'time')::time,c.scheduled_time);
 else raise exception 'INTERVIEW_INVALID_ACTION';
 end if;
 c.revision:=c.revision+1;c.updated_at:=clock_timestamp();
 update public.interview_cases set room_id=c.room_id,scheduled_date=c.scheduled_date,scheduled_time=c.scheduled_time,status=c.status,answers=c.answers,identity_details=c.identity_details,started_at=c.started_at,finished_at=c.finished_at,locked_by=c.locked_by,revision=c.revision,updated_at=c.updated_at,deferred_reason=c.deferred_reason,deferred_at=c.deferred_at,deferred_by=c.deferred_by where nik=c.nik;
 insert into interview_private.audit(nik,actor,action,before_data,after_data) values(c.nik,actor,p_action,to_jsonb(old_c),to_jsonb(c)||jsonb_build_object('reason',case when p_action='defer' then reason else p_payload->>'reason' end));
 return c;
end $$;
revoke all on function interview_private.interview_action(text,text,integer,jsonb) from public,anon;
grant execute on function interview_private.interview_action(text,text,integer,jsonb) to authenticated;

create or replace function interview_private.interview_activity_action(
 p_nik text,p_action text,p_revision integer default null,p_payload jsonb default '{}'::jsonb
) returns public.interview_activity language plpgsql security definer
set search_path=pg_catalog,public,interview_private as $$
declare
 c public.interview_cases; a public.interview_activity; old_a public.interview_activity;
 actor uuid:=auth.uid(); app_role text:=public.current_app_role();
 moment timestamptz:=clock_timestamp(); note text; first_open boolean:=false;
begin
 if actor is null or coalesce(app_role,'') not in ('admin','editor','interviewer') then raise exception 'INTERVIEW_ACTIVITY_FORBIDDEN';end if;
 select * into c from public.interview_cases where nik=p_nik for share;
 if not found then raise exception 'INTERVIEW_ACTIVITY_NOT_FOUND';end if;
 if app_role='interviewer' and not exists(select 1 from public.interviewer_assignments r where r.user_id=actor and r.room_id=c.room_id) then raise exception 'INTERVIEW_ACTIVITY_FORBIDDEN';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>12000 then raise exception 'INTERVIEW_ACTIVITY_INVALID';end if;
 if p_action not in ('open','report','resolve') or p_action is null then raise exception 'INTERVIEW_ACTIVITY_INVALID_ACTION';end if;
 if p_action='open' then
  if c.status='Selesai' then raise exception 'INTERVIEW_ACTIVITY_FINALIZED';end if;
  if c.status='Tertunda' then raise exception 'INTERVIEW_ACTIVITY_DEFERRED';end if;
  if c.locked_by is not null and c.locked_by<>actor then raise exception 'INTERVIEW_ACTIVITY_LOCKED';end if;
 elsif p_action='report' then
  if c.status='Selesai' then raise exception 'INTERVIEW_ACTIVITY_FINALIZED';end if;
  if jsonb_typeof(p_payload->'note') is distinct from 'string' then raise exception 'INTERVIEW_ACTIVITY_INVALID_NOTE';end if;
 elsif p_payload ? 'note' and jsonb_typeof(p_payload->'note') is distinct from 'string' then raise exception 'INTERVIEW_ACTIVITY_INVALID_NOTE';
 end if;
 if p_action in ('report','resolve') then
  note:=regexp_replace(coalesce(p_payload->>'note',''),'^[[:space:]]+|[[:space:]]+$','','g');
  if length(note)>2000 or (p_action='report' and length(note)<5) then raise exception 'INTERVIEW_ACTIVITY_INVALID_NOTE: Catatan kendala harus 5–2000 karakter.';end if;
 end if;
 insert into public.interview_activity(nik) values(p_nik) on conflict(nik) do nothing;
 select * into a from public.interview_activity where nik=p_nik for update;
 moment:=clock_timestamp();old_a:=a;
 if p_action='open' then
  first_open:=a.opened_at is null;
  a.opened_at:=coalesce(a.opened_at,moment);a.opened_by:=coalesce(a.opened_by,actor);
  a.last_seen_at:=moment;a.last_seen_by:=actor;
 else
  if p_revision is null or a.revision<>p_revision then raise exception 'INTERVIEW_ACTIVITY_CONFLICT: Kendala telah berubah. Muat ulang sebelum melanjutkan.';end if;
  if p_action='report' then
   a.obstacle_status:='open';a.obstacle_note:=note;a.obstacle_reported_at:=moment;a.obstacle_reported_by:=actor;
   a.obstacle_resolved_at:=null;a.obstacle_resolved_by:=null;a.obstacle_resolution_note:='';
  else
   if a.obstacle_status<>'open' then raise exception 'INTERVIEW_ACTIVITY_NO_OPEN_OBSTACLE';end if;
   a.obstacle_status:='resolved';a.obstacle_resolved_at:=moment;a.obstacle_resolved_by:=actor;a.obstacle_resolution_note:=note;
  end if;
  a.revision:=a.revision+1;
 end if;
 a.updated_at:=moment;
 update public.interview_activity set opened_at=a.opened_at,opened_by=a.opened_by,last_seen_at=a.last_seen_at,last_seen_by=a.last_seen_by,obstacle_status=a.obstacle_status,obstacle_note=a.obstacle_note,obstacle_reported_at=a.obstacle_reported_at,obstacle_reported_by=a.obstacle_reported_by,obstacle_resolved_at=a.obstacle_resolved_at,obstacle_resolved_by=a.obstacle_resolved_by,obstacle_resolution_note=a.obstacle_resolution_note,revision=a.revision,updated_at=a.updated_at where nik=a.nik;
 if first_open or p_action<>'open' then insert into interview_private.activity_audit(nik,actor,action,before_data,after_data) values(a.nik,actor,p_action,to_jsonb(old_a),to_jsonb(a));end if;
 return a;
end $$;
revoke all on function interview_private.interview_activity_action(text,text,integer,jsonb) from public,anon;
grant execute on function interview_private.interview_activity_action(text,text,integer,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
