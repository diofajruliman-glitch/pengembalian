begin;
create table public.interview_categories (
 nik text primary key references public.interview_cases(nik) on delete cascade,
 initial_snapshot jsonb not null,
 proposed_category text not null default '',
 reason text not null default '', evidence text not null default '',
 question_refs integer[] not null default '{}',
 review_status text not null default 'Belum diisi' check(review_status in ('Belum diisi','Draf','Perlu pendalaman','Diajukan','Ditetapkan')),
 proposal_bap_revision integer,
 proposed_by uuid references auth.users(id),
 final_category text not null default '', decision_reason text not null default '',
 decided_by uuid references auth.users(id), decided_at timestamptz, decision_bap_revision integer,
 revision integer not null default 1, updated_at timestamptz not null default now()
);
create table public.interview_category_events (
 id bigint generated always as identity primary key,
 nik text not null references public.interview_cases(nik) on delete cascade,
 actor uuid not null references auth.users(id), actor_name text not null,
 action text not null, details jsonb not null,
 occurred_at timestamptz not null default now()
);
create index interview_category_events_case_idx on public.interview_category_events(nik,id desc);
alter table public.interview_categories enable row level security;
alter table public.interview_category_events enable row level security;
revoke all on public.interview_categories,public.interview_category_events from public,anon,authenticated;
grant select on public.interview_categories,public.interview_category_events to authenticated;
create policy interview_categories_read on public.interview_categories for select to authenticated
using (exists(select 1 from public.interview_cases c where c.nik=interview_categories.nik));
create policy interview_category_events_read on public.interview_category_events for select to authenticated
using (exists(select 1 from public.interview_cases c where c.nik=interview_category_events.nik));

create function interview_private.category_baseline(p_dataset uuid,p_nik text) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
 select coalesce((select jsonb_build_object('afterCategory',r->'after'->>'kategori','historicalCategory',r->'historical'->>'kategori',
 'assessment',r->>'hasilPenilaian','datasetId',d.id,'sourceName',d.name,'datasetVersion',d.version)
 from public.discipline_datasets d cross join lateral jsonb_array_elements(d.result->'rows') r
 where d.id=p_dataset and r->>'nik'=p_nik limit 1),jsonb_build_object('datasetId',p_dataset,'sourceName','Sumber awal belum tersedia'))
$$;
revoke all on function interview_private.category_baseline(uuid,text) from public,anon,authenticated;
insert into public.interview_categories(nik,initial_snapshot)
select c.nik,interview_private.category_baseline(c.dataset_id,c.nik) from public.interview_cases c;

create function interview_private.capture_category() returns trigger language plpgsql security definer
set search_path=pg_catalog,public,interview_private as $$
begin
 insert into public.interview_categories(nik,initial_snapshot) values(new.nik,interview_private.category_baseline(new.dataset_id,new.nik));
 return new;
end $$;
revoke all on function interview_private.capture_category() from public,anon,authenticated;
create trigger interview_capture_category after insert on public.interview_cases for each row execute function interview_private.capture_category();

create function interview_private.category_action(p_nik text,p_action text,p_revision integer,p_bap_revision integer,p_payload jsonb)
returns public.interview_categories language plpgsql security definer set search_path=pg_catalog,public,interview_private as $$
declare c public.interview_cases; v public.interview_categories; actor uuid:=auth.uid(); app_role text:=public.current_app_role();
 category text; note text; refs integer[]; q integer; stale boolean;
begin
 if actor is null or coalesce(app_role,'') not in ('admin','editor','interviewer') then raise exception 'CATEGORY_FORBIDDEN';end if;
 -- Same lock order as BAP writes: first the case, then the category record.
 select * into c from public.interview_cases where nik=p_nik for update;
 if not found then raise exception 'CATEGORY_NOT_FOUND';end if;
 if app_role='interviewer' and not exists(select 1 from public.interviewer_assignments a where a.user_id=actor and a.room_id=c.room_id) then raise exception 'CATEGORY_FORBIDDEN';end if;
 select * into v from public.interview_categories where nik=p_nik for update;
 if not found then raise exception 'CATEGORY_NOT_FOUND';end if;
 if p_revision is null or p_bap_revision is null or v.revision<>p_revision or c.revision<>p_bap_revision then raise exception 'CATEGORY_CONFLICT: Data berubah. Muat ulang sebelum menyimpan.';end if;
 if c.started_at is null then raise exception 'CATEGORY_INTERVIEW_NOT_STARTED';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>25000 then raise exception 'CATEGORY_INVALID';end if;
 stale:=v.proposal_bap_revision is distinct from c.revision;
 if p_action in ('draft','deepen','submit') then
  if app_role<>'admin' and c.locked_by is distinct from actor then raise exception 'CATEGORY_LOCKED';end if;
  if v.review_status='Ditetapkan' and v.decision_bap_revision=c.revision then raise exception 'CATEGORY_FINALIZED';end if;
  category:=coalesce(p_payload->>'category','');note:=btrim(coalesce(p_payload->>'reason',''));
  if category not in ('','Belum dapat disimpulkan','Tidak terbukti','Ringan','Sedang','Berat') or length(note)>8000 or length(coalesce(p_payload->>'evidence',''))>8000 then raise exception 'CATEGORY_INVALID';end if;
  if jsonb_typeof(p_payload->'questionRefs') is distinct from 'array' then raise exception 'CATEGORY_INVALID_REFS';end if;
  select coalesce(array_agg(distinct x::integer),'{}'::integer[]) into refs from jsonb_array_elements_text(p_payload->'questionRefs') x;
  foreach q in array refs loop
   if q is null or q<1 or q>22 or length(btrim(coalesce(c.answers->>q::text,'')))=0 then raise exception 'CATEGORY_UNANSWERED_REFERENCE';end if;
  end loop;
  if p_action in ('deepen','submit') and length(note)<20 then raise exception 'CATEGORY_REASON_REQUIRED';end if;
  if p_action='submit' and (c.status<>'Selesai' or category in ('','Belum dapat disimpulkan') or cardinality(refs)=0) then raise exception 'CATEGORY_SUBMISSION_INCOMPLETE: Finalisasi BAP, pilih kategori dan jawaban pendukung dahulu.';end if;
  v.proposed_category:=category;v.reason:=note;v.evidence:=coalesce(p_payload->>'evidence','');v.question_refs:=refs;
  v.proposed_by:=actor;v.proposal_bap_revision:=c.revision;
  v.review_status:=case p_action when 'submit' then 'Diajukan' when 'deepen' then 'Perlu pendalaman' else 'Draf' end;
  -- Old decisions stay in the append-only history and are no longer current.
  v.final_category:='';v.decision_reason:='';v.decided_by:=null;v.decided_at:=null;v.decision_bap_revision:=null;
 elsif p_action in ('approve','return') then
  if app_role<>'admin' then raise exception 'CATEGORY_ADMIN_REQUIRED';end if;
  if v.review_status<>'Diajukan' or stale or c.status<>'Selesai' then raise exception 'CATEGORY_REVIEW_STALE';end if;
  note:=btrim(coalesce(p_payload->>'reason',''));
  if length(note)<20 or length(note)>8000 then raise exception 'CATEGORY_REASON_REQUIRED';end if;
  if p_action='approve' then
   category:=coalesce(p_payload->>'category','');
   if category not in ('Tidak terbukti','Ringan','Sedang','Berat') then raise exception 'CATEGORY_INVALID';end if;
   v.final_category:=category;v.decision_reason:=note;v.decided_by:=actor;v.decided_at:=clock_timestamp();v.decision_bap_revision:=c.revision;v.review_status:='Ditetapkan';
  else
   v.review_status:='Perlu pendalaman';v.decision_reason:=note;
  end if;
 else raise exception 'CATEGORY_INVALID_ACTION';end if;
 v.revision:=v.revision+1;v.updated_at:=clock_timestamp();
 update public.interview_categories set proposed_category=v.proposed_category,reason=v.reason,evidence=v.evidence,question_refs=v.question_refs,
 review_status=v.review_status,proposal_bap_revision=v.proposal_bap_revision,proposed_by=v.proposed_by,final_category=v.final_category,decision_reason=v.decision_reason,
 decided_by=v.decided_by,decided_at=v.decided_at,decision_bap_revision=v.decision_bap_revision,revision=v.revision,updated_at=v.updated_at where nik=v.nik;
 insert into public.interview_category_events(nik,actor,actor_name,action,details)
 values(v.nik,actor,coalesce((select nama from public.profiles where id=actor),'Pemeriksa'),p_action,to_jsonb(v));
 return v;
end $$;
revoke all on function interview_private.category_action(text,text,integer,integer,jsonb) from public,anon;
grant execute on function interview_private.category_action(text,text,integer,integer,jsonb) to authenticated;
create function public.interview_category_action(p_nik text,p_action text,p_revision integer,p_bap_revision integer,p_payload jsonb default '{}'::jsonb)
returns public.interview_categories language sql security invoker set search_path=pg_catalog,public,interview_private as $$
 select interview_private.category_action(p_nik,p_action,p_revision,p_bap_revision,p_payload)
$$;
revoke all on function public.interview_category_action(text,text,integer,integer,jsonb) from public,anon;
grant execute on function public.interview_category_action(text,text,integer,integer,jsonb) to authenticated;
commit;
