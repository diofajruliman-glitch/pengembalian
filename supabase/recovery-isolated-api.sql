-- Review before applying: exposes only the test-schema workflow to signed-in admins.
-- It does not grant schema/table access or write to the application's public tables.
begin;
create function public.recovery_test_rpc(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then
  raise exception 'FORBIDDEN';
 end if;
 case p_action
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
