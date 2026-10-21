begin;
create schema if not exists interview_private;
revoke all on schema interview_private from public, anon, authenticated;

create table if not exists public.interview_cases (
 nik text primary key check (nik ~ '^[0-9]{16}$'),
 dataset_id uuid references public.discipline_datasets(id),
 person jsonb not null,
 room_id text not null references public.interviewer_assignments(room_id),
 scheduled_date date not null,
 scheduled_time time not null,
 status text not null default 'Terjadwal' check(status in ('Terjadwal','Dalam wawancara','Draf','Selesai')),
 answers jsonb not null default '{}'::jsonb,
 identity_details jsonb not null default '{}'::jsonb,
 started_at timestamptz,
 finished_at timestamptz,
 locked_by uuid references auth.users(id),
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
create index if not exists interview_cases_room_idx on public.interview_cases(room_id,scheduled_date,scheduled_time);
do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'interview_schedule_slot') then
  alter table public.interview_cases add constraint interview_schedule_slot unique(room_id,scheduled_date,scheduled_time) deferrable initially deferred;
 end if;
end $$;
create table if not exists interview_private.audit (
 id bigint generated always as identity primary key,
 nik text not null, actor uuid not null, action text not null,
 occurred_at timestamptz not null default now(), before_data jsonb, after_data jsonb
);
alter table public.interview_cases enable row level security;
alter table interview_private.audit enable row level security;
revoke all on public.interview_cases from public,anon,authenticated;
grant select on public.interview_cases to authenticated;
grant all on public.interview_cases to service_role;
drop policy if exists interview_case_read on public.interview_cases;
create policy interview_case_read on public.interview_cases for select to authenticated
using ((select public.current_app_role()) in ('admin','editor','viewer') or
 ((select public.current_app_role())='interviewer' and room_id in
 (select a.room_id from public.interviewer_assignments a where a.user_id=(select auth.uid()))));

create or replace function interview_private.interview_action(p_nik text,p_action text,p_revision integer,p_payload jsonb default '{}'::jsonb)
returns public.interview_cases language plpgsql security definer
set search_path=pg_catalog,public,interview_private as $$
declare c public.interview_cases; old_c public.interview_cases; actor uuid:=auth.uid(); app_role text:=public.current_app_role(); k text; v jsonb;
begin
 if actor is null or coalesce(app_role,'') not in ('admin','editor','interviewer') then raise exception 'INTERVIEW_FORBIDDEN'; end if;
 select * into c from public.interview_cases where nik=p_nik for update;
 if not found then raise exception 'INTERVIEW_NOT_FOUND'; end if;
 if app_role='interviewer' and not exists(select 1 from public.interviewer_assignments a where a.user_id=actor and a.room_id=c.room_id) then raise exception 'INTERVIEW_FORBIDDEN'; end if;
 if c.revision<>p_revision then raise exception 'INTERVIEW_CONFLICT: Data telah berubah. Muat ulang sebelum melanjutkan.'; end if;
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
   if k not in ('pangkat','jabatan','unitKerja','nomorSurat','tanggalSurat','kota') or jsonb_typeof(v)<>'string' or length(v#>>'{}')>500 then raise exception 'INTERVIEW_INVALID_IDENTITY';end if;
  end loop;
  if coalesce(p_payload->'identity'->>'tanggalSurat','')<>'' then
   if (p_payload->'identity'->>'tanggalSurat')!~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INTERVIEW_INVALID_DATE';end if;
   perform (p_payload->'identity'->>'tanggalSurat')::date;
  end if;
  c.answers:=p_payload->'answers';c.identity_details:=p_payload->'identity';c.status:='Draf';
  if p_action='finalize' then
   for i in 1..22 loop
    if length(btrim(coalesce(c.answers->>i::text,'')))=0 then raise exception 'INTERVIEW_INCOMPLETE: Jawaban % belum diisi.',i;end if;
   end loop;
   foreach k in array array['pangkat','jabatan','unitKerja','nomorSurat','tanggalSurat','kota'] loop
    if length(btrim(coalesce(c.identity_details->>k,'')))=0 then raise exception 'INTERVIEW_INCOMPLETE: % belum diisi.',k;end if;
   end loop;
   if coalesce(c.person->>'nama','')='' or coalesce(c.person->>'nip','')='' then raise exception 'INTERVIEW_INCOMPLETE_IDENTITY';end if;
   c.status:='Selesai';c.finished_at:=clock_timestamp();
  end if;
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
grant usage on schema interview_private to authenticated;
grant execute on function interview_private.interview_action(text,text,integer,jsonb) to authenticated;
create or replace function public.interview_action(p_nik text,p_action text,p_revision integer,p_payload jsonb default '{}'::jsonb)
returns public.interview_cases language sql security invoker
set search_path=pg_catalog,public,interview_private as $$
 select interview_private.interview_action(p_nik,p_action,p_revision,p_payload)
$$;
revoke all on function public.interview_action(text,text,integer,jsonb) from public,anon;
grant execute on function public.interview_action(text,text,integer,jsonb) to authenticated;

create or replace function public.interview_schedule_batch(p_items jsonb) returns integer
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare item jsonb; n integer:=0;
begin
 if auth.uid() is null or public.current_app_role() is distinct from 'admin' then raise exception 'INTERVIEW_FORBIDDEN';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>1100 then raise exception 'INTERVIEW_INVALID';end if;
 for item in select * from jsonb_array_elements(p_items) loop
  perform public.interview_action(item->>'nik','schedule',(item->>'revision')::integer,item->'schedule');n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.interview_schedule_batch(jsonb) from public,anon;
grant execute on function public.interview_schedule_batch(jsonb) to authenticated;
commit;
