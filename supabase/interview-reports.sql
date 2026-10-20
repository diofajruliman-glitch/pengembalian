begin;
create table public.interview_reports (
 nik text primary key references public.interview_cases(nik) on delete cascade,
 sections jsonb not null default '{}',nomor text not null default '',kota text not null default '',
 source_versions jsonb not null default '{}',reviewed_at timestamptz,reviewed_by uuid references auth.users(id),
 revision integer not null default 1,updated_at timestamptz not null default now()
);
alter table public.interview_reports enable row level security;
revoke all on public.interview_reports from public,anon,authenticated;
grant select on public.interview_reports to authenticated;
create policy interview_report_read on public.interview_reports for select to authenticated using(exists(select 1 from public.interview_cases c where c.nik=interview_reports.nik));
insert into public.interview_reports(nik) select nik from public.interview_cases;
create function interview_private.capture_report() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$begin insert into public.interview_reports(nik) values(new.nik);return new;end$$;
revoke all on function interview_private.capture_report() from public,anon,authenticated;
create trigger interview_capture_report after insert on public.interview_cases for each row execute function interview_private.capture_report();
create function interview_private.report_source(p_nik text) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,interview_private as $$
declare c public.interview_cases;cat public.interview_categories;s public.interview_statements;r jsonb;metrics jsonb:='{}';actor uuid:=auth.uid();app_role text:=public.current_app_role();
begin
 if actor is null or coalesce(app_role,'') not in ('admin','editor','viewer','interviewer') then raise exception 'LHP_FORBIDDEN';end if;
 select * into c from public.interview_cases where nik=p_nik;
 if not found then raise exception 'LHP_NOT_FOUND';end if;
 if app_role='interviewer' and not exists(select 1 from public.interviewer_assignments a where a.user_id=actor and a.room_id=c.room_id) then raise exception 'LHP_FORBIDDEN';end if;
 select * into cat from public.interview_categories where nik=p_nik;
 select * into s from public.interview_statements where nik=p_nik;
 select item into r from public.discipline_datasets d cross join lateral jsonb_array_elements(d.result->'rows') item where d.id=c.dataset_id and item->>'nik'=p_nik limit 1;
 if coalesce(r->>'missingTransactionDetails','false')<>'true' then
  if jsonb_typeof(r->'after'->'nominal')='number' then metrics:=metrics||jsonb_build_object('nominal',r->'after'->'nominal');end if;
  if jsonb_typeof(r->'after'->'frekuensi')='number' then metrics:=metrics||jsonb_build_object('frekuensi',r->'after'->'frekuensi');end if;
 end if;
 return jsonb_build_object('case',to_jsonb(c),'category',to_jsonb(cat),'statement',to_jsonb(s),'metrics',metrics,'versions',jsonb_build_object('bap',c.revision,'category',cat.revision,'statement',s.revision));
end$$;
revoke all on function interview_private.report_source(text) from public,anon;
grant execute on function interview_private.report_source(text) to authenticated;
create function public.interview_report_source(p_nik text) returns jsonb language sql security invoker set search_path=pg_catalog,public,interview_private as $$select interview_private.report_source(p_nik)$$;
revoke all on function public.interview_report_source(text) from public,anon;
grant execute on function public.interview_report_source(text) to authenticated;
create function interview_private.report_save(p_nik text,p_revision integer,p_versions jsonb,p_sections jsonb,p_nomor text,p_kota text,p_review boolean)
returns public.interview_reports language plpgsql security definer set search_path=pg_catalog,public,interview_private as $$
declare c public.interview_cases;r public.interview_reports;old_r public.interview_reports;source jsonb;k text;v jsonb;actor uuid:=auth.uid();app_role text:=public.current_app_role();
begin
 if actor is null or coalesce(app_role,'') not in ('admin','editor','interviewer') then raise exception 'LHP_FORBIDDEN';end if;
 select * into c from public.interview_cases where nik=p_nik for update;
 source:=interview_private.report_source(p_nik);
 if c.started_at is null then raise exception 'LHP_INTERVIEW_NOT_STARTED';end if;
 if app_role<>'admin' and c.locked_by is distinct from actor then raise exception 'LHP_LOCKED';end if;
 select * into r from public.interview_reports where nik=p_nik for update;
 if p_revision is null or r.revision is distinct from p_revision or p_versions is distinct from source->'versions' then raise exception 'LHP_CONFLICT: Sumber atau draf berubah. Muat ulang dan tinjau kembali.';end if;
 if p_sections is null or jsonb_typeof(p_sections)<>'object' or octet_length(p_sections::text)>1500000 or p_nomor is null or p_kota is null or length(p_nomor)>200 or length(p_kota)>200 then raise exception 'LHP_INVALID';end if;
 for k,v in select * from jsonb_each(p_sections) loop
  if k not in ('dasar','temuan','fakta','analisis','kesimpulan','rekomendasi') or jsonb_typeof(v)<>'string' or length(v#>>'{}')>200000 then raise exception 'LHP_INVALID';end if;
 end loop;
 if coalesce(p_review,false) then
  if c.status<>'Selesai' or source->'category'->>'review_status' is distinct from 'Ditetapkan' or (source->'category'->>'decision_bap_revision')::integer is distinct from c.revision or source->'statement'->>'confirmed_at' is null or (source->'statement'->>'bap_revision')::integer is distinct from c.revision then raise exception 'LHP_SOURCES_NOT_READY';end if;
  foreach k in array array['dasar','temuan','fakta','analisis','kesimpulan','rekomendasi'] loop
   if coalesce(btrim(p_sections->>k),'')='' then raise exception 'LHP_INCOMPLETE: %',k;end if;
  end loop;
  if length(btrim(p_sections->>'rekomendasi'))<20 or btrim(p_kota)='' then raise exception 'LHP_RECOMMENDATION_REQUIRED';end if;
 end if;
 old_r:=r;r.sections:=p_sections;r.nomor:=p_nomor;r.kota:=p_kota;r.source_versions:=source->'versions';r.revision:=r.revision+1;r.updated_at:=clock_timestamp();
 r.reviewed_at:=case when coalesce(p_review,false) then clock_timestamp() else null end;r.reviewed_by:=case when coalesce(p_review,false) then actor else null end;
 update public.interview_reports set sections=r.sections,nomor=r.nomor,kota=r.kota,source_versions=r.source_versions,revision=r.revision,updated_at=r.updated_at,reviewed_at=r.reviewed_at,reviewed_by=r.reviewed_by where nik=p_nik;
 insert into interview_private.audit(nik,actor,action,before_data,after_data) values(p_nik,actor,case when coalesce(p_review,false) then 'lhp_review' else 'lhp_draft' end,to_jsonb(old_r),to_jsonb(r));return r;
end$$;
revoke all on function interview_private.report_save(text,integer,jsonb,jsonb,text,text,boolean) from public,anon;
grant execute on function interview_private.report_save(text,integer,jsonb,jsonb,text,text,boolean) to authenticated;
create function public.interview_report_save(p_nik text,p_revision integer,p_versions jsonb,p_sections jsonb,p_nomor text,p_kota text,p_review boolean default false) returns public.interview_reports language sql security invoker set search_path=pg_catalog,public,interview_private as $$select interview_private.report_save(p_nik,p_revision,p_versions,p_sections,p_nomor,p_kota,p_review)$$;
revoke all on function public.interview_report_save(text,integer,jsonb,jsonb,text,text,boolean) from public,anon;
grant execute on function public.interview_report_save(text,integer,jsonb,jsonb,text,text,boolean) to authenticated;
commit;
