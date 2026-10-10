-- Extend only read operations to existing editor/viewer roles.
-- Preserve deployed function bodies, financial data, and private-schema grants.
begin;
do $migration$
declare signature text; definition text; changed text; allowed text;
begin
 for signature, allowed in select * from (values
  ('public.recovery_master_rpc(text,jsonb)', 'p_action in (''recovery_read_meta'',''recovery_read_page'',''recovery_linked_meta'',''recovery_linked_cases'')'),
  ('public.recovery_metadata_rpc(text,jsonb)', 'p_action in (''meta'',''page'',''references'')'),
  ('public.recovery_followup_rpc(text,jsonb)', 'p_action in (''meta'',''page'')'),
  ('recovery_live.linked_case_meta()', 'true'),
  ('recovery_live.read_linked_cases(bigint,integer)', 'true')
 ) as operations(signature, allowed)
 loop
  definition := pg_get_functiondef(signature::regprocedure);
  if definition like '%ROLE_READ_ACCESS_V1%' then continue; end if;
  changed := regexp_replace(definition,
   'coalesce\(public.current_app_role\(\),''''\)\s*<>\s*''admin''',
   format('(coalesce(public.current_app_role(),'''') <> ''admin'' and not (coalesce(public.current_app_role(),'''') in (''editor'',''viewer'') and coalesce((%s),false))) /* ROLE_READ_ACCESS_V1 */', allowed));
  if changed = definition then raise exception 'Expected authorization guard missing: %', signature; end if;
  execute changed;
 end loop;
end $migration$;
commit;
