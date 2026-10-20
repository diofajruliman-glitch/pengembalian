begin;
create table public.interview_statements (
 nik text primary key references public.interview_cases(nik) on delete cascade,
 details jsonb not null default '{}'::jsonb,
 bap_revision integer,
 confirmed_at timestamptz, confirmed_by uuid references auth.users(id),
 revision integer not null default 1, updated_at timestamptz not null default now()
);
alter table public.interview_statements enable row level security;
revoke all on public.interview_statements from public,anon,authenticated;
grant select on public.interview_statements to authenticated;
create policy interview_statement_read on public.interview_statements for select to authenticated
using(exists(select 1 from public.interview_cases c where c.nik=interview_statements.nik));
insert into public.interview_statements(nik) select nik from public.interview_cases;
create function interview_private.capture_statement() returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$begin insert into public.interview_statements(nik) values(new.nik);return new;end$$;
revoke all on function interview_private.capture_statement() from public,anon,authenticated;
create trigger interview_capture_statement after insert on public.interview_cases for each row execute function interview_private.capture_statement();

create function interview_private.statement_save(p_nik text,p_revision integer,p_bap_revision integer,p_details jsonb,p_confirm boolean)
returns public.interview_statements language plpgsql security definer set search_path=pg_catalog,public,interview_private as $$
declare c public.interview_cases;s public.interview_statements;old_s public.interview_statements;actor uuid:=auth.uid();app_role text:=public.current_app_role();k text;v jsonb;admission text;activity text;actual_month text;
begin
 if actor is null or coalesce(app_role,'') not in ('admin','editor','interviewer') then raise exception 'SPTJM_FORBIDDEN';end if;
 select * into c from public.interview_cases where nik=p_nik for update;
 if not found then raise exception 'SPTJM_NOT_FOUND';end if;
 if app_role='interviewer' and not exists(select 1 from public.interviewer_assignments a where a.user_id=actor and a.room_id=c.room_id) then raise exception 'SPTJM_FORBIDDEN';end if;
 if c.started_at is null then raise exception 'SPTJM_INTERVIEW_NOT_STARTED';end if;
 if app_role<>'admin' and c.locked_by is distinct from actor then raise exception 'SPTJM_LOCKED';end if;
 select * into s from public.interview_statements where nik=p_nik for update;
 if not found then raise exception 'SPTJM_NOT_FOUND';end if;
 if p_revision is null or p_bap_revision is null or s.revision<>p_revision or c.revision<>p_bap_revision then raise exception 'SPTJM_CONFLICT: BAP atau SPTJM berubah. Muat ulang sebelum melanjutkan.';end if;
 if p_details is null or jsonb_typeof(p_details)<>'object' or octet_length(p_details::text)>12000 then raise exception 'SPTJM_INVALID';end if;
 for k,v in select * from jsonb_each(p_details) loop
  if k='hasAttachments' then
   if jsonb_typeof(v)<>'boolean' then raise exception 'SPTJM_INVALID';end if;
  elsif k not in ('provinsi','kabKota','noHp','kota','admission','activityState','startMonth','endMonth','periodNote') or jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000 then raise exception 'SPTJM_INVALID';end if;
 end loop;
 admission:=coalesce(p_details->>'admission','');activity:=coalesce(p_details->>'activityState','');
 if admission not in ('','Mengakui','Tidak mengakui') or activity not in ('','stopped','ongoing','unknown') then raise exception 'SPTJM_INVALID';end if;
 if coalesce(p_confirm,false) then
  if c.status<>'Selesai' then raise exception 'SPTJM_FINALIZE_BAP_FIRST';end if;
  foreach k in array array['nama','nip','nik'] loop
   if coalesce(btrim(c.person->>k),'')='' then raise exception 'SPTJM_IDENTITY_REQUIRED';end if;
  end loop;
  foreach k in array array['jabatan','unitKerja'] loop
   if coalesce(nullif(btrim(c.identity_details->>k),''),nullif(btrim(c.person->>k),''),'')='' then raise exception 'SPTJM_IDENTITY_REQUIRED';end if;
  end loop;
  foreach k in array array['provinsi','kabKota','noHp','kota'] loop
   if coalesce(btrim(p_details->>k),'')='' then raise exception 'SPTJM_INCOMPLETE: % belum diisi.',k;end if;
  end loop;
  if (p_details->>'noHp')!~ '^[+]?[-0-9 ()]{8,30}$' then raise exception 'SPTJM_INVALID_PHONE';end if;
  if admission='' then raise exception 'SPTJM_ADMISSION_REQUIRED';end if;
  if admission='Mengakui' then
   if activity='' then raise exception 'SPTJM_PERIOD_REQUIRED';end if;
   if activity='unknown' then
    if length(btrim(coalesce(p_details->>'periodNote','')))<10 then raise exception 'SPTJM_PERIOD_NOTE_REQUIRED';end if;
   else
    actual_month:=to_char(c.started_at at time zone 'Asia/Jakarta','YYYY-MM');
    if coalesce(p_details->>'startMonth','')!~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' or p_details->>'startMonth'>actual_month then raise exception 'SPTJM_INVALID_PERIOD';end if;
    if activity='stopped' and (coalesce(p_details->>'endMonth','')!~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' or p_details->>'endMonth'<p_details->>'startMonth' or p_details->>'endMonth'>actual_month) then raise exception 'SPTJM_INVALID_PERIOD';end if;
   end if;
  end if;
 end if;
 old_s:=s;s.details:=p_details;s.bap_revision:=c.revision;s.revision:=s.revision+1;s.updated_at:=clock_timestamp();
 s.confirmed_at:=case when coalesce(p_confirm,false) then clock_timestamp() else null end;s.confirmed_by:=case when coalesce(p_confirm,false) then actor else null end;
 update public.interview_statements set details=s.details,bap_revision=s.bap_revision,revision=s.revision,updated_at=s.updated_at,confirmed_at=s.confirmed_at,confirmed_by=s.confirmed_by where nik=s.nik;
 insert into interview_private.audit(nik,actor,action,before_data,after_data) values(s.nik,actor,case when coalesce(p_confirm,false) then 'sptjm_confirm' else 'sptjm_save' end,to_jsonb(old_s),to_jsonb(s));
 return s;
end$$;
revoke all on function interview_private.statement_save(text,integer,integer,jsonb,boolean) from public,anon;
grant execute on function interview_private.statement_save(text,integer,integer,jsonb,boolean) to authenticated;
create function public.interview_statement_save(p_nik text,p_revision integer,p_bap_revision integer,p_details jsonb,p_confirm boolean default false)
returns public.interview_statements language sql security invoker set search_path=pg_catalog,public,interview_private as $$
 select interview_private.statement_save(p_nik,p_revision,p_bap_revision,p_details,p_confirm)
$$;
revoke all on function public.interview_statement_save(text,integer,integer,jsonb,boolean) from public,anon;
grant execute on function public.interview_statement_save(text,integer,integer,jsonb,boolean) to authenticated;
commit;
