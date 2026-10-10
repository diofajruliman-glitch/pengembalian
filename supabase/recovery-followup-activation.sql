-- Optional extension: links only. Review before activating in production.
begin;
do $$begin
 if to_regclass('recovery_live.recovery_people') is null or to_regclass('public.action_plans') is null or to_regclass('public.bottlenecks') is null then raise exception 'FOLLOWUP_PREREQUISITES_MISSING';end if;
 if to_regclass('recovery_live.followup_links') is not null then raise exception 'FOLLOWUP_ALREADY_INITIALIZED';end if;
end $$;
create table recovery_live.followup_links (
 target_type text not null check(target_type in ('action','bottleneck')),target_no integer not null,
 nip text not null references recovery_live.recovery_people(nip),actor uuid not null references auth.users(id),
 created_at timestamptz not null default now(),removed_at timestamptz,
 primary key(target_type,target_no,nip)
);
create table recovery_live.followup_revision(id integer primary key check(id=1),revision bigint not null);
insert into recovery_live.followup_revision values(1,0);
create table recovery_live.followup_requests (
 id uuid primary key,actor uuid not null references auth.users(id),payload jsonb not null,result jsonb not null,
 created_at timestamptz not null default now()
);
create table recovery_live.followup_changes (
 id bigint generated always as identity primary key,request_id uuid not null references recovery_live.followup_requests(id),
 target_type text not null,target_no integer not null,nip text not null references recovery_live.recovery_people(nip),
 operation text not null check(operation in ('add','remove')),actor uuid not null references auth.users(id),
 reason text not null,created_at timestamptz not null default now(),unique(request_id,nip)
);
alter table recovery_live.followup_links enable row level security;
alter table recovery_live.followup_revision enable row level security;
alter table recovery_live.followup_requests enable row level security;
alter table recovery_live.followup_changes enable row level security;
revoke all on recovery_live.followup_links,recovery_live.followup_revision,recovery_live.followup_requests,recovery_live.followup_changes from public,anon,authenticated;

create function public.recovery_followup_rpc(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog set statement_timeout='60s' as $$
declare typ text:=p_payload->>'type'; target integer;
 mr bigint; lr bigint; target_time timestamptz; lim integer; request_id uuid;
 old_request recovery_live.followup_requests; nips jsonb:=p_payload->'nips'; person_nip text;
 v_reason text:=btrim(p_payload->>'reason'); op text:=p_payload->>'operation'; changed integer:=0; result jsonb;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 target:=(p_payload->>'target')::integer;
 if p_action is null or p_action not in ('meta','page','save') then raise exception 'INVALID_FOLLOWUP_ACTION';end if;
 if typ is null or typ not in ('action','bottleneck') or target is null or target<1 then raise exception 'INVALID_TARGET';end if;
 if p_action='save' then
  request_id:=(p_payload->>'requestId')::uuid;
  if request_id is null then raise exception 'REQUEST_REQUIRED';end if;
  -- Serializes retries without changing the money/master revision.
  select revision into lr from recovery_live.followup_revision where id=1 for update;
  select * into old_request from recovery_live.followup_requests where id=request_id;
  if found then
   if old_request.actor<>auth.uid() or old_request.payload<>p_payload then raise exception 'REQUEST_CONFLICT';end if;
   return old_request.result||jsonb_build_object('alreadySaved',true);
  end if;
  select revision into mr from recovery_live.recovery_revision where id=1 for share;
 else
  select revision into lr from recovery_live.followup_revision where id=1;
  select revision into mr from recovery_live.recovery_revision where id=1;
 end if;
 if typ='action' then
  select updated_at into target_time from public.action_plans where no=target and deleted_at is null for share;
 else
  select updated_at into target_time from public.bottlenecks where no=target and deleted_at is null for share;
 end if;
 if target_time is null then raise exception 'TARGET_UNAVAILABLE';end if;
 if p_action='meta' then
  return jsonb_build_object('revision',lr,'masterRevision',mr,'targetUpdatedAt',target_time,'count',(select count(*) from recovery_live.followup_links where target_type=typ and target_no=target and removed_at is null));
 elsif p_action='page' then
  lim:=coalesce((p_payload->>'limit')::integer,500);
  if lim<1 or lim>500 then raise exception 'INVALID_PAGE';end if;
  return jsonb_build_object('revision',lr,'masterRevision',mr,'rows',coalesce((select jsonb_agg(to_jsonb(x) order by nip) from
   (select l.nip,p.archived_at is null as available from recovery_live.followup_links l join recovery_live.recovery_people p on p.nip=l.nip
    where l.target_type=typ and l.target_no=target and l.removed_at is null and (coalesce(p_payload->>'after','')='' or l.nip>p_payload->>'after') order by l.nip limit lim) x),'[]'::jsonb));
 end if;
 if mr is distinct from (p_payload->>'masterRevision')::bigint or lr is distinct from (p_payload->>'revision')::bigint or target_time is distinct from (p_payload->>'targetUpdatedAt')::timestamptz then raise exception 'STALE_FOLLOWUP';end if;
 if op is null or op not in ('add','remove') or coalesce(length(v_reason),0) not between 3 and 2000 then raise exception 'INVALID_CHANGE';end if;
 if jsonb_typeof(nips) is distinct from 'array' then raise exception 'INVALID_NIPS';end if;
 if jsonb_array_length(nips) not between 1 and 500 or octet_length(nips::text)>20000 then raise exception 'INVALID_NIPS';end if;
 if (select count(distinct x) from jsonb_array_elements_text(nips) x)<>jsonb_array_length(nips) then raise exception 'DUPLICATE_NIP';end if;
 for person_nip in select value from jsonb_array_elements_text(nips) loop
  if person_nip!~'^[0-9]{18}$' then raise exception 'INVALID_NIP';end if;
  if op='add' then
   if not exists(select 1 from recovery_live.recovery_people where nip=person_nip and archived_at is null) then raise exception 'MASTER_PERSON_UNAVAILABLE';end if;
   if not exists(select 1 from recovery_live.recovery_obligations where nip=person_nip and nominal>0) then raise exception 'NO_POSITIVE_OBLIGATION';end if;
   if exists(select 1 from recovery_live.followup_links where target_type=typ and target_no=target and nip=person_nip and removed_at is null) then continue;end if;
  elsif not exists(select 1 from recovery_live.followup_links where target_type=typ and target_no=target and nip=person_nip and removed_at is null) then
   raise exception 'LINK_NOT_FOUND';
  end if;
  changed:=changed+1;
 end loop;
 result:=jsonb_build_object('changed',changed,'revision',lr+case when changed>0 then 1 else 0 end,'alreadySaved',false);
 insert into recovery_live.followup_requests(id,actor,payload,result) values(request_id,auth.uid(),p_payload,result);
 for person_nip in select value from jsonb_array_elements_text(nips) loop
  if op='add' then
   if exists(select 1 from recovery_live.followup_links where target_type=typ and target_no=target and nip=person_nip and removed_at is null) then continue;end if;
   insert into recovery_live.followup_links(target_type,target_no,nip,actor) values(typ,target,person_nip,auth.uid())
   on conflict(target_type,target_no,nip) do update set removed_at=null,actor=excluded.actor,created_at=now();
  else
   update recovery_live.followup_links set removed_at=now() where target_type=typ and target_no=target and nip=person_nip;
  end if;
  insert into recovery_live.followup_changes(request_id,target_type,target_no,nip,operation,actor,reason) values(request_id,typ,target,person_nip,op,auth.uid(),v_reason);
 end loop;
 if changed>0 then update recovery_live.followup_revision set revision=revision+1 where id=1;end if;
 return result;
end $$;
revoke all on function public.recovery_followup_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.recovery_followup_rpc(text,jsonb) to authenticated;
commit;
