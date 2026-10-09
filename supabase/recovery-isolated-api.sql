-- Review before applying: exposes only the test-schema workflow to signed-in admins.
-- It does not grant schema/table access or write to the application's public tables.
begin;
create or replace function public.recovery_test_rpc(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare page_limit integer;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then
  raise exception 'FORBIDDEN';
 end if;
 case p_action
 when 'recovery_read_meta' then
  return jsonb_build_object('revision',(select revision from recovery_test.recovery_revision where id=1),'people',(select count(*) from recovery_test.recovery_people where archived_at is null));
 when 'recovery_read_page' then
  page_limit:=coalesce((p_payload->>'p_limit')::integer,500);
  if page_limit<1 or page_limit>500 then raise exception 'INVALID_PAGE';end if;
  return (
   with persons as materialized (select nip,nama,provinsi,bank,status_sdm from recovery_test.recovery_people where archived_at is null and (nullif(p_payload->>'p_after','') is null or nip>p_payload->>'p_after') order by nip limit page_limit),
   obligations as materialized (select o.* from recovery_test.recovery_obligations o join persons p on p.nip=o.nip)
   select jsonb_build_object(
    'revision',(select revision from recovery_test.recovery_revision where id=1),
    'people',coalesce((select jsonb_agg(to_jsonb(p) order by nip) from persons p),'[]'::jsonb),
    'obligations',coalesce((select jsonb_agg(jsonb_build_object('nip',nip,'bank',bank,'kind',jenis,'year',tahun_kewajiban,'amount',nominal) order by id) from obligations),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(jsonb_build_object('nip',o.nip,'bank',o.bank,'kind',o.jenis,'year',o.tahun_kewajiban,'stage',p.tahap,'amount',p.nominal,'verification',p.verification,'paymentDate',p.tanggal_pengembalian) order by p.id) from recovery_test.recovery_payments p join obligations o on o.id=p.obligation_id),'[]'::jsonb)
   )
  );
 when 'recovery_begin' then
  return to_jsonb(recovery_test.recovery_begin(p_payload->>'p_name',p_payload->>'p_hash',(p_payload->>'p_rows')::integer,p_payload->'p_totals'));
 when 'recovery_append' then
  return to_jsonb(recovery_test.recovery_append((p_payload->>'p_batch')::uuid,p_payload->'p_records'));
 when 'recovery_validate' then
  return recovery_test.recovery_validate((p_payload->>'p_batch')::uuid);
 when 'recovery_diff' then
  return (select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from recovery_test.recovery_diff((p_payload->>'p_batch')::uuid,coalesce((p_payload->>'p_offset')::integer,0),coalesce((p_payload->>'p_limit')::integer,50)) d);
 when 'recovery_commit' then
  return recovery_test.recovery_commit((p_payload->>'p_batch')::uuid,p_payload->>'p_reason');
 else raise exception 'INVALID_TEST_ACTION';
 end case;
end $$;
revoke all on function public.recovery_test_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.recovery_test_rpc(text,jsonb) to authenticated;
commit;
