import fs from 'node:fs'
const files=['supabase/recovery-production-resume.sql','supabase/recovery-sdm-status-activation.sql','supabase/recovery-followup-activation.sql']
const contents=files.map(file=>`-- Source: ${file}\n${fs.readFileSync(file,'utf8').replace(/^begin;\s*$/gm,'').replace(/^commit;\s*$/gm,'')}`)
const preflight=`do $$begin
 if to_regprocedure('public.recovery_master_rpc(text,jsonb)') is null then raise exception 'PRODUCTION_MASTER_REQUIRED';end if;
 if has_schema_privilege('authenticated','recovery_live','usage') or has_schema_privilege('anon','recovery_live','usage') then raise exception 'PRIVATE_SCHEMA_ACCESS_REVIEW_REQUIRED';end if;
 if to_regclass('recovery_live.sdm_status_batches') is not null or to_regclass('recovery_live.followup_links') is not null then raise exception 'INTEGRATION_ALREADY_PRESENT_REVIEW_REQUIRED';end if;
end $$;`
fs.writeFileSync('supabase/recovery-integration-activation.sql',`-- Activate extensions on an existing production master only, in one transaction.
-- Never rerun schema.sql or recovery-production-activation.sql against the live database.
-- No data import, status assignment or followup links are created by this package.
begin;
${preflight}
${contents.join('\n')}
commit;
`)
