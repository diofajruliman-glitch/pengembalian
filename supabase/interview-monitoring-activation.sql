-- Apply after interview-portal.sql, interview-revisions.sql and interview-signatories.sql.
-- Activity has its own revision: opening a BAP or reporting an obstacle must never
-- invalidate an answer draft, a finalized BAP, a category decision or its report.
begin;

create table if not exists public.interview_activity (
 nik text primary key references public.interview_cases(nik) on delete cascade,
 opened_at timestamptz,
 opened_by uuid references auth.users(id),
 last_seen_at timestamptz,
 last_seen_by uuid references auth.users(id),
 obstacle_status text not null default 'none' check (obstacle_status in ('none','open','resolved')),
 obstacle_note text not null default '' check (length(obstacle_note)<=2000),
 obstacle_reported_at timestamptz,
 obstacle_reported_by uuid references auth.users(id),
 obstacle_resolved_at timestamptz,
 obstacle_resolved_by uuid references auth.users(id),
 obstacle_resolution_note text not null default '' check (length(obstacle_resolution_note)<=2000),
 revision integer not null default 0 check (revision>=0),
 updated_at timestamptz not null default now()
);
create index if not exists interview_activity_obstacle_idx on public.interview_activity(obstacle_status)
 where obstacle_status='open';
create table if not exists interview_private.activity_audit (
 id bigint generated always as identity primary key,
 nik text not null,
 actor uuid not null,
 action text not null,
 occurred_at timestamptz not null default now(),
 before_data jsonb,
 after_data jsonb
);
alter table public.interview_activity enable row level security;
alter table interview_private.activity_audit enable row level security;
revoke all on public.interview_activity from public,anon,authenticated;
revoke all on interview_private.activity_audit from public,anon,authenticated;
grant select on public.interview_activity to authenticated;
grant all on public.interview_activity to service_role;
drop policy if exists interview_activity_read on public.interview_activity;
create policy interview_activity_read on public.interview_activity for select to authenticated
 using (exists(select 1 from public.interview_cases c where c.nik=interview_activity.nik));

create or replace function interview_private.interview_activity_action(
 p_nik text,p_action text,p_revision integer default null,p_payload jsonb default '{}'::jsonb
) returns public.interview_activity language plpgsql security definer
set search_path=pg_catalog,public,interview_private as $$
declare
 c public.interview_cases;
 a public.interview_activity;
 old_a public.interview_activity;
 actor uuid:=auth.uid();
 app_role text:=public.current_app_role();
 moment timestamptz:=clock_timestamp();
 note text;
 first_open boolean:=false;
begin
 if actor is null or coalesce(app_role,'') not in ('admin','editor','interviewer') then
  raise exception 'INTERVIEW_ACTIVITY_FORBIDDEN';
 end if;
 -- Keep assignment and completion stable while this short action is checked.
 -- This lock does not modify the BAP or its revision.
 select * into c from public.interview_cases where nik=p_nik for share;
 if not found then raise exception 'INTERVIEW_ACTIVITY_NOT_FOUND';end if;
 if app_role='interviewer' and not exists(
  select 1 from public.interviewer_assignments r where r.user_id=actor and r.room_id=c.room_id
 ) then raise exception 'INTERVIEW_ACTIVITY_FORBIDDEN';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>12000 then
  raise exception 'INTERVIEW_ACTIVITY_INVALID';
 end if;
 if p_action not in ('open','report','resolve') or p_action is null then
  raise exception 'INTERVIEW_ACTIVITY_INVALID_ACTION';
 end if;
 if p_action='open' then
  if c.status='Selesai' then raise exception 'INTERVIEW_ACTIVITY_FINALIZED';end if;
  if c.locked_by is not null and c.locked_by<>actor then raise exception 'INTERVIEW_ACTIVITY_LOCKED';end if;
 elsif p_action='report' then
  if c.status='Selesai' then raise exception 'INTERVIEW_ACTIVITY_FINALIZED';end if;
  if jsonb_typeof(p_payload->'note') is distinct from 'string' then
   raise exception 'INTERVIEW_ACTIVITY_INVALID_NOTE';
  end if;
 elsif p_payload ? 'note' and jsonb_typeof(p_payload->'note') is distinct from 'string' then
  raise exception 'INTERVIEW_ACTIVITY_INVALID_NOTE';
 end if;
 if p_action in ('report','resolve') then
  note:=regexp_replace(coalesce(p_payload->>'note',''),'^[[:space:]]+|[[:space:]]+$','','g');
  if length(note)>2000 or (p_action='report' and length(note)<5) then
   raise exception 'INTERVIEW_ACTIVITY_INVALID_NOTE: Catatan kendala harus 5–2000 karakter.';
  end if;
 end if;

 -- Serialize simultaneous first opens/reports on this operational record only.
 insert into public.interview_activity(nik) values(p_nik) on conflict(nik) do nothing;
 select * into a from public.interview_activity where nik=p_nik for update;
 moment:=clock_timestamp();
 old_a:=a;
 if p_action='open' then
  first_open:=a.opened_at is null;
  a.opened_at:=coalesce(a.opened_at,moment);
  a.opened_by:=coalesce(a.opened_by,actor);
  a.last_seen_at:=moment;
  a.last_seen_by:=actor;
 else
  if p_revision is null or a.revision<>p_revision then
   raise exception 'INTERVIEW_ACTIVITY_CONFLICT: Kendala telah berubah. Muat ulang sebelum melanjutkan.';
  end if;
  if p_action='report' then
   a.obstacle_status:='open';
   a.obstacle_note:=note;
   a.obstacle_reported_at:=moment;
   a.obstacle_reported_by:=actor;
   a.obstacle_resolved_at:=null;
   a.obstacle_resolved_by:=null;
   a.obstacle_resolution_note:='';
  else
   if a.obstacle_status<>'open' then raise exception 'INTERVIEW_ACTIVITY_NO_OPEN_OBSTACLE';end if;
   a.obstacle_status:='resolved';
   a.obstacle_resolved_at:=moment;
   a.obstacle_resolved_by:=actor;
   a.obstacle_resolution_note:=note;
  end if;
  a.revision:=a.revision+1;
 end if;
 a.updated_at:=moment;
 update public.interview_activity set
  opened_at=a.opened_at,opened_by=a.opened_by,last_seen_at=a.last_seen_at,last_seen_by=a.last_seen_by,
  obstacle_status=a.obstacle_status,obstacle_note=a.obstacle_note,
  obstacle_reported_at=a.obstacle_reported_at,obstacle_reported_by=a.obstacle_reported_by,
  obstacle_resolved_at=a.obstacle_resolved_at,obstacle_resolved_by=a.obstacle_resolved_by,
  obstacle_resolution_note=a.obstacle_resolution_note,revision=a.revision,updated_at=a.updated_at
 where nik=a.nik;
 -- Heartbeats are presence signals; only the first open and obstacle changes
 -- enter the permanent audit so a long interview cannot flood its history.
 if first_open or p_action<>'open' then
  insert into interview_private.activity_audit(nik,actor,action,before_data,after_data)
   values(a.nik,actor,p_action,to_jsonb(old_a),to_jsonb(a));
 end if;
 return a;
end $$;
revoke all on function interview_private.interview_activity_action(text,text,integer,jsonb) from public,anon;
grant usage on schema interview_private to authenticated;
grant execute on function interview_private.interview_activity_action(text,text,integer,jsonb) to authenticated;

create or replace function public.interview_activity_action(
 p_nik text,p_action text,p_revision integer default null,p_payload jsonb default '{}'::jsonb
) returns public.interview_activity language sql security invoker
set search_path=pg_catalog,public,interview_private as $$
 select interview_private.interview_activity_action(p_nik,p_action,p_revision,p_payload)
$$;
revoke all on function public.interview_activity_action(text,text,integer,jsonb) from public,anon;
grant execute on function public.interview_activity_action(text,text,integer,jsonb) to authenticated;
commit;
