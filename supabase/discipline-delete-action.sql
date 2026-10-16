-- Isolated update to enable dataset deletion via discipline_rpc.
-- Run this script in the Supabase SQL Editor for your project.
begin;

create or replace function public.discipline_rpc(p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 app_role text; actor uuid; d public.discipline_datasets; parent public.discipline_datasets;
 followup public.discipline_followups; old_followup jsonb; patch jsonb;
 target_dataset_id uuid; target_parent_id uuid; target_nik text; result jsonb; output jsonb; key text;
 target_request_id uuid; expected_updated_at timestamptz; existing_followup boolean;
begin
 actor := auth.uid(); app_role := public.current_app_role();
 if actor is null or app_role is null or app_role not in ('admin','editor','viewer') then raise exception 'DISCIPLINE_FORBIDDEN'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
 if p_action in ('save_version','archive','delete') and app_role<>'admin' then raise exception 'DISCIPLINE_FORBIDDEN'; end if;
 if p_action='save_followup' and app_role not in ('admin','editor') then raise exception 'DISCIPLINE_FORBIDDEN'; end if;

 if p_action='list' then
  select coalesce(jsonb_agg(public.discipline_dataset_meta(x) order by x.created_at desc,x.id),'[]'::jsonb) into output from public.discipline_datasets x;
  return output;
 elsif p_action='save_version' then
  if jsonb_typeof(p_payload->'name') is distinct from 'string' or length(btrim(p_payload->>'name')) not between 1 and 200 or
     jsonb_typeof(p_payload->'filename') is distinct from 'string' or length(p_payload->>'filename') not between 1 and 240 or (p_payload->>'filename') ~ E'[/\\\\]' then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
  result := p_payload->'result';
  perform public.discipline_validate_result(result);
  if p_payload?'requestId' then
   if jsonb_typeof(p_payload->'requestId') is distinct from 'string' then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
   begin target_request_id := (p_payload->>'requestId')::uuid;
   exception when invalid_text_representation then raise exception 'DISCIPLINE_INVALID_INPUT'; end;
  end if;
  if coalesce(p_payload->>'parentId','') <> '' then
   begin target_parent_id := (p_payload->>'parentId')::uuid; exception when invalid_text_representation then raise exception 'DISCIPLINE_INVALID_INPUT'; end;
  end if;
  if target_request_id is not null then
   select * into d from public.discipline_datasets x where x.created_by=actor and x.request_id=target_request_id;
   if found then
    if d.name is distinct from btrim(p_payload->>'name') or d.filename is distinct from p_payload->>'filename' or
       d.parent_id is distinct from target_parent_id or d.result is distinct from result then raise exception 'DISCIPLINE_REQUEST_CONFLICT'; end if;
    return public.discipline_dataset_meta(d)||jsonb_build_object('result',d.result);
   end if;
  end if;
  if target_parent_id is not null then
   select * into parent from public.discipline_datasets x where x.id=target_parent_id for update;
   if not found then raise exception 'DISCIPLINE_NOT_FOUND'; end if;
   if target_request_id is not null then
    select * into d from public.discipline_datasets x where x.created_by=actor and x.request_id=target_request_id;
    if found then
     if d.name is distinct from btrim(p_payload->>'name') or d.filename is distinct from p_payload->>'filename' or
        d.parent_id is distinct from target_parent_id or d.result is distinct from result then raise exception 'DISCIPLINE_REQUEST_CONFLICT'; end if;
     return public.discipline_dataset_meta(d)||jsonb_build_object('result',d.result);
    end if;
   end if;
   if parent.status='archived' then raise exception 'DISCIPLINE_ARCHIVED'; end if;
  end if;
  insert into public.discipline_datasets(name,filename,parent_id,version,result,created_by,request_id)
   values(btrim(p_payload->>'name'),p_payload->>'filename',target_parent_id,coalesce(parent.version,0)+1,result,actor,target_request_id)
   on conflict(created_by,request_id) where request_id is not null do nothing returning * into d;
  if not found then
   select * into d from public.discipline_datasets x where x.created_by=actor and x.request_id=target_request_id;
   if not found or d.name is distinct from btrim(p_payload->>'name') or d.filename is distinct from p_payload->>'filename' or
      d.parent_id is distinct from target_parent_id or d.result is distinct from result then raise exception 'DISCIPLINE_REQUEST_CONFLICT'; end if;
   return public.discipline_dataset_meta(d)||jsonb_build_object('result',d.result);
  end if;
  insert into public.discipline_audit(dataset_id,action,actor,after_data)
   values(d.id,case when target_parent_id is null then 'import' else 'new_version' end,actor,public.discipline_dataset_meta(d)||jsonb_build_object('rules',result->'rules'));
  return public.discipline_dataset_meta(d)||jsonb_build_object('result',d.result);
 end if;

 if p_action not in ('load','archive','followups','save_followup','delete') then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
 begin target_dataset_id := coalesce(p_payload->>'datasetId',p_payload->>'id')::uuid;
 exception when invalid_text_representation then raise exception 'DISCIPLINE_INVALID_INPUT'; end;
 select * into d from public.discipline_datasets x where x.id=target_dataset_id for update;
 if not found then raise exception 'DISCIPLINE_NOT_FOUND'; end if;
 if p_action='load' then
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'nik',x.nik,'action',x.action,'actor',x.actor,'occurredAt',x.occurred_at,'before',x.before_data,'after',x.after_data) order by x.id),'[]'::jsonb)
   into output from public.discipline_audit x where x.dataset_id=d.id;
  return public.discipline_dataset_meta(d)||jsonb_build_object('result',d.result,'auditEvents',output);
 elsif p_action='followups' then
  select coalesce(jsonb_agg(public.discipline_followup_json(x) order by x.nik),'[]'::jsonb) into output from public.discipline_followups x where x.dataset_id=d.id;
  return output;
 elsif p_action='delete' then
  update public.discipline_datasets set parent_id=d.parent_id where parent_id=d.id;
  delete from public.discipline_followups where dataset_id=d.id;
  delete from public.discipline_audit where dataset_id=d.id;
  delete from public.discipline_datasets where id=d.id;
  return jsonb_build_object('deleted',true,'id',d.id);
 end if;
 if d.status='archived' then raise exception 'DISCIPLINE_ARCHIVED'; end if;
 if p_action='archive' then
  update public.discipline_datasets x set status='archived',archived_at=now(),archived_by=actor where x.id=d.id returning * into d;
  insert into public.discipline_audit(dataset_id,action,actor,after_data) values(d.id,'archive',actor,public.discipline_dataset_meta(d));
  return public.discipline_dataset_meta(d);
 end if;

 target_nik := p_payload->>'nik'; patch := p_payload->'patch';
 if jsonb_typeof(p_payload->'nik') is distinct from 'string' or target_nik !~ '^[0-9]{16}$' or jsonb_typeof(patch) is distinct from 'object' then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
 if not exists(select 1 from jsonb_array_elements(d.result->'rows') r where r->>'nik'=target_nik) then raise exception 'DISCIPLINE_UNKNOWN_NIK'; end if;
 if not exists(select 1 from jsonb_object_keys(patch)) or exists(select 1 from jsonb_object_keys(patch) k where k not in ('status','pic','notes','documentReference','decisionNote')) then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
 for key in select jsonb_object_keys(patch) loop
  if jsonb_typeof(patch->key) <> 'string' or length(patch->>key)>(case key when 'pic' then 200 when 'documentReference' then 2000 else 10000 end) then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
 end loop;
 if patch?'status' and patch->>'status' not in ('Belum ditindaklanjuti','Dalam pemeriksaan','Menunggu dokumen','Selesai') then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
 select * into followup from public.discipline_followups x where x.dataset_id=d.id and x.nik=target_nik for update;
 existing_followup := found;
 old_followup := case when existing_followup then public.discipline_followup_json(followup) else null end;
 if p_payload?'expectedUpdatedAt' then
  if p_payload->'expectedUpdatedAt'='null'::jsonb then
   if existing_followup then raise exception 'DISCIPLINE_FOLLOWUP_CONFLICT'; end if;
  else
   if jsonb_typeof(p_payload->'expectedUpdatedAt') is distinct from 'string' or
      (p_payload->>'expectedUpdatedAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
   begin expected_updated_at := (p_payload->>'expectedUpdatedAt')::timestamptz;
   exception when invalid_datetime_format or datetime_field_overflow or invalid_time_zone_displacement_value then raise exception 'DISCIPLINE_INVALID_INPUT'; end;
   if not isfinite(expected_updated_at) then raise exception 'DISCIPLINE_INVALID_INPUT'; end if;
   if not existing_followup or followup.updated_at is distinct from expected_updated_at then raise exception 'DISCIPLINE_FOLLOWUP_CONFLICT'; end if;
  end if;
 end if;
 insert into public.discipline_followups(dataset_id,nik,status,pic,notes,document_reference,decision_note,updated_at,updated_by)
 values(d.id,target_nik,coalesce(patch->>'status','Belum ditindaklanjuti'),coalesce(patch->>'pic',''),coalesce(patch->>'notes',''),coalesce(patch->>'documentReference',''),coalesce(patch->>'decisionNote',''),clock_timestamp(),actor)
 on conflict(dataset_id,nik) do update set
  status=coalesce(patch->>'status',discipline_followups.status),pic=coalesce(patch->>'pic',discipline_followups.pic),
  notes=coalesce(patch->>'notes',discipline_followups.notes),document_reference=coalesce(patch->>'documentReference',discipline_followups.document_reference),
  decision_note=coalesce(patch->>'decisionNote',discipline_followups.decision_note),
  updated_at=greatest(clock_timestamp(),discipline_followups.updated_at+interval '1 microsecond'),updated_by=actor
 returning * into followup;
 output := public.discipline_followup_json(followup);
 insert into public.discipline_audit(dataset_id,nik,action,actor,before_data,after_data) values(d.id,target_nik,'followup',actor,old_followup,output);
 return output;
end $$;

commit;
