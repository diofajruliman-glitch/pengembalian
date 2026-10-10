-- LOCAL DRAFT. Adds an admin-only API for test references; no public case updates.
begin;
create function public.recovery_case_test_rpc(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 case p_action
 when 'case_prepare' then return to_jsonb(recovery_test.prepare_case_links((p_payload->>'p_revision')::bigint,p_payload->'p_cases'));
 when 'case_commit' then return recovery_test.commit_case_links((p_payload->>'p_batch')::uuid,p_payload->>'p_reason');
 when 'recovery_linked_meta' then return recovery_test.linked_case_meta();
 when 'recovery_linked_cases' then return recovery_test.read_linked_cases(coalesce((p_payload->>'p_after')::bigint,0),coalesce((p_payload->>'p_limit')::integer,100));
 else raise exception 'INVALID_CASE_ACTION';
 end case;
end $$;
revoke all on function public.recovery_case_test_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.recovery_case_test_rpc(text,jsonb) to authenticated;
commit;
