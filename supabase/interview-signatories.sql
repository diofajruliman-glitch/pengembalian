-- Apply after interview-revisions.sql. No participant data is backfilled.
begin;
create or replace function interview_private.interview_action(p_nik text,p_action text,p_revision integer,p_payload jsonb default '{}'::jsonb)
returns public.interview_cases language plpgsql security definer
set search_path=pg_catalog,public,interview_private as $$
declare c public.interview_cases; old_c public.interview_cases; actor uuid:=auth.uid(); app_role text:=public.current_app_role(); k text; v jsonb;
begin
 if actor is null or coalesce(app_role,'') not in ('admin','editor','interviewer') then raise exception 'INTERVIEW_FORBIDDEN'; end if;
 select * into c from public.interview_cases where nik=p_nik for update;
 if not found then raise exception 'INTERVIEW_NOT_FOUND'; end if;
 if app_role='interviewer' and not exists(select 1 from public.interviewer_assignments a where a.user_id=actor and a.room_id=c.room_id) then raise exception 'INTERVIEW_FORBIDDEN'; end if;
 if p_revision is null or c.revision<>p_revision then raise exception 'INTERVIEW_CONFLICT: Data telah berubah. Muat ulang sebelum melanjutkan.'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>220000 then raise exception 'INTERVIEW_INVALID'; end if;
 old_c:=c;
 if p_action='start' then
  if c.status='Selesai' then raise exception 'INTERVIEW_FINALIZED'; end if;
  if c.locked_by is not null and c.locked_by<>actor then raise exception 'INTERVIEW_LOCKED'; end if;
  c.started_at:=coalesce(c.started_at,clock_timestamp());c.locked_by:=actor;c.status:='Dalam wawancara';
 elsif p_action in ('save','finalize') then
  if c.status='Selesai' then raise exception 'INTERVIEW_FINALIZED'; end if;
  if c.started_at is null or c.locked_by is distinct from actor then raise exception 'INTERVIEW_LOCKED: Mulai atau ambil alih melalui admin dahulu.'; end if;
  if jsonb_typeof(p_payload->'answers') is distinct from 'object' or jsonb_typeof(p_payload->'identity') is distinct from 'object' then raise exception 'INTERVIEW_INVALID'; end if;
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
  -- Drafts preserve partial input so a paused NIP edit does not block autosave
  -- of the answers. Canonical NIP validation is required at finalization only.
  if regexp_replace(coalesce(p_payload->'identity'->>'pewawancaraNip',''),'[[:space:]]','','g')~ '^[0-9]{18}$' then
   p_payload:=jsonb_set(p_payload,'{identity,pewawancaraNip}',to_jsonb(regexp_replace(p_payload->'identity'->>'pewawancaraNip','[[:space:]]','','g')));
  end if;
  c.answers:=p_payload->'answers';c.identity_details:=p_payload->'identity';c.status:='Draf';
  if p_action='finalize' then
   for i in 1..22 loop
    if length(btrim(coalesce(c.answers->>i::text,'')))=0 then raise exception 'INTERVIEW_INCOMPLETE: Jawaban % belum diisi.',i;end if;
   end loop;
   foreach k in array array['pangkat','jabatan','unitKerja','nomorSurat','tanggalSurat','kota','pewawancaraNama','pewawancaraNip'] loop
    if length(btrim(coalesce(c.identity_details->>k,'')))=0 then raise exception 'INTERVIEW_INCOMPLETE: % belum diisi.',k;end if;
   end loop;
   if coalesce(c.person->>'nama','')='' or coalesce(c.person->>'nip','')='' then raise exception 'INTERVIEW_INCOMPLETE_IDENTITY';end if;
   if regexp_replace(coalesce(c.identity_details->>'pewawancaraNama',''),'[[:space:]]','','g')='' then raise exception 'INTERVIEW_INCOMPLETE: Nama pewawancara belum diisi.';end if;
   if coalesce(c.identity_details->>'pewawancaraNip','')!~ '^[0-9]{18}$' then raise exception 'INTERVIEW_INVALID_SIGNATORY_NIP: NIP pewawancara harus terdiri dari 18 digit.';end if;
   c.status:='Selesai';c.finished_at:=clock_timestamp();
  end if;
 elsif p_action='revise' then
  if c.status<>'Selesai' or c.started_at is null then raise exception 'INTERVIEW_NOT_FINALIZED: Revisi ini hanya untuk BAP yang sudah selesai.';end if;
  -- Assigned interviewers may revise their completed room cases, including a
  -- case completed by an administrator. Active interview locks stay protected.
  if app_role<>'admin' and c.locked_by is distinct from actor and app_role<>'interviewer' then raise exception 'INTERVIEW_LOCKED';end if;
  c.status:='Draf';c.finished_at:=null;c.locked_by:=actor;
 elsif p_action='reopen' then
  if app_role<>'admin' or length(btrim(coalesce(p_payload->>'reason','')))<5 then raise exception 'INTERVIEW_ADMIN_REASON_REQUIRED';end if;
  c.status:=case when c.started_at is null then 'Terjadwal' else 'Draf' end;c.finished_at:=null;c.locked_by:=null;
 elsif p_action='schedule' then
  if app_role<>'admin' then raise exception 'INTERVIEW_FORBIDDEN';end if;
  if c.started_at is not null then raise exception 'INTERVIEW_ALREADY_STARTED';end if;
  c.room_id:=coalesce(p_payload->>'roomId',c.room_id);
  c.scheduled_date:=coalesce((p_payload->>'date')::date,c.scheduled_date);
  c.scheduled_time:=coalesce((p_payload->>'time')::time,c.scheduled_time);
 else raise exception 'INTERVIEW_INVALID_ACTION';
 end if;
 c.revision:=c.revision+1;c.updated_at:=clock_timestamp();
 update public.interview_cases set room_id=c.room_id,scheduled_date=c.scheduled_date,scheduled_time=c.scheduled_time,status=c.status,answers=c.answers,identity_details=c.identity_details,started_at=c.started_at,finished_at=c.finished_at,locked_by=c.locked_by,revision=c.revision,updated_at=c.updated_at where nik=c.nik;
 insert into interview_private.audit(nik,actor,action,before_data,after_data) values(c.nik,actor,p_action,to_jsonb(old_c),to_jsonb(c)||jsonb_build_object('reason',p_payload->>'reason'));
 return c;
end $$;
revoke all on function interview_private.interview_action(text,text,integer,jsonb) from public,anon;
grant execute on function interview_private.interview_action(text,text,integer,jsonb) to authenticated;

create function interview_private.signatory_source(p_nik text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,interview_private as $$
declare c public.interview_cases;actor uuid:=auth.uid();app_role text:=public.current_app_role();source_user uuid;source_name text;
begin
 if actor is null or coalesce(app_role,'') not in ('admin','editor','viewer','interviewer') then raise exception 'INTERVIEW_SIGNATORY_FORBIDDEN';end if;
 select * into c from public.interview_cases where nik=p_nik;
 if not found then raise exception 'INTERVIEW_SIGNATORY_NOT_FOUND';end if;
 if app_role='interviewer' and not exists(select 1 from public.interviewer_assignments a where a.user_id=actor and a.room_id=c.room_id) then raise exception 'INTERVIEW_SIGNATORY_FORBIDDEN';end if;
 source_user:=c.locked_by;
 if source_user is null then select a.user_id into source_user from public.interviewer_assignments a where a.room_id=c.room_id;end if;
 select p.nama into source_name from public.profiles p where p.id=source_user;
 -- Profiles currently do not contain NIP. Never substitute the participant's
 -- NIP or the NIP of a viewer/administrator who merely opens this case.
 return jsonb_build_object('user_id',source_user,'nama',coalesce(nullif(btrim(c.identity_details->>'pewawancaraNama'),''),source_name,''),
  'nip',regexp_replace(coalesce(c.identity_details->>'pewawancaraNip',''),'[[:space:]]','','g'));
end$$;
revoke all on function interview_private.signatory_source(text) from public,anon;
grant execute on function interview_private.signatory_source(text) to authenticated;
create function public.interview_signatory_source(p_nik text) returns jsonb
language sql security invoker set search_path=pg_catalog,public,interview_private as $$select interview_private.signatory_source(p_nik)$$;
revoke all on function public.interview_signatory_source(text) from public,anon;
grant execute on function public.interview_signatory_source(text) to authenticated;
commit;
