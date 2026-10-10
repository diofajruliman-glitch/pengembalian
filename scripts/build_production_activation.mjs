import fs from 'node:fs'
const strip=s=>s.replace(/^begin;\s*$/gm,'').replace(/^commit;\s*$/gm,'').replace(/^\s*--.*$/gm,'')
const privateSql=s=>strip(s).replace(/public\./g,'recovery_live.').replace(/recovery_live\.current_app_role/g,'public.current_app_role').replace(/set search_path=public/g,'set search_path=recovery_live,pg_catalog').replace(/not in \('admin','editor'\)/g,"<>'admin'").replace(/^\s*grant execute.*$/gm,'').replace(/^\s*execute format\('grant select.*$/gm,'')
const foundation=privateSql(fs.readFileSync('supabase/recovery-foundation.draft.sql','utf8'))
let batches=privateSql(fs.readFileSync('supabase/recovery-batches.draft.sql','utf8'))
batches=batches.replace('declare batch uuid; rev bigint;','declare batch uuid; rev bigint; previous recovery_imports;')
batches=batches.replace(" if exists(select 1 from recovery_imports where file_sha256=p_hash and status='committed')", " perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'|'||p_hash,0));\n if exists(select 1 from recovery_imports where file_sha256=p_hash and status='committed')")
batches=batches.replace(' select revision into rev from recovery_revision where id=1;',` select revision into rev from recovery_revision where id=1;
 select * into previous from recovery_imports where actor=auth.uid() and file_sha256=p_hash and status in ('preview','validated') order by created_at desc limit 1 for update;
 if found then
  if previous.base_revision<>rev then raise exception 'STALE_PREVIEW';end if;
  if previous.expected_rows<>p_rows or previous.expected_totals is distinct from p_totals then raise exception 'MANIFEST_REQUIRES_REVIEW';end if;
  return previous.id;
 end if;`)
const summary="jsonb_build_object('totals',actual,'obligationCorrections',corrections)"
const detailed=`jsonb_build_object('totals',actual,'obligationCorrections',corrections,
 'initialImport',not exists(select 1 from recovery_people) and not exists(select 1 from recovery_obligations) and not exists(select 1 from recovery_payments),
 'people',(select count(*) from recovery_staging where import_id=p_batch and record_type='person'),
 'obligations',(select count(*) from recovery_staging where import_id=p_batch and record_type='obligation'),
 'payments',(select count(*) from recovery_staging where import_id=p_batch and record_type='payment'))`
if(!batches.includes(summary))throw Error('VALIDATION_SUMMARY_TEMPLATE_CHANGED')
batches=batches.replaceAll(summary,detailed)
const nameGuard=`
 if exists(select 1 from recovery_staging s join recovery_people p on p.nip=s.data->>'nip'
  where s.import_id=p_batch and s.record_type='person' and
   upper(regexp_replace(btrim(p.nama),'\\s+',' ','g'))<>upper(regexp_replace(btrim(s.data->>'nama'),'\\s+',' ','g')))
 then raise exception 'PERSON_CHANGE_REQUIRES_REVIEW';end if;
`
batches=batches.replace(' analyze recovery_live.recovery_staging;',' analyze recovery_live.recovery_staging;'+nameGuard)
const links=strip(fs.readFileSync('supabase/recovery-case-links.draft.sql','utf8')).replaceAll('recovery_test','recovery_live').replace("if total is null then raise exception 'MASTER_OBLIGATION_NOT_FOUND'","if total is null or total<=0 then raise exception 'MASTER_OBLIGATION_NOT_FOUND'")
const linkedRead=strip(fs.readFileSync('supabase/recovery-case-read.draft.sql','utf8')).replaceAll('recovery_test','recovery_live').replace('where o.nip=p.nip) f on true','where o.nip=p.nip and o.nominal>0) f on true')
let broker=strip(fs.readFileSync('supabase/recovery-isolated-api.sql','utf8')).replaceAll('recovery_test','recovery_live').replaceAll('public.recovery_live_rpc','public.recovery_master_rpc').replace('create or replace function','create function').replace('INVALID_TEST_ACTION','INVALID_MASTER_ACTION').replace('set search_path=pg_catalog as $$',()=>"set search_path=pg_catalog set statement_timeout='60s' as $$")
const caseApi=fs.readFileSync('supabase/recovery-case-api.draft.sql','utf8')
const actions=caseApi.slice(caseApi.indexOf(" when 'case_prepare'"),caseApi.indexOf(" else raise exception" )).replaceAll('recovery_test','recovery_live')
broker=broker.replace(" else raise exception 'INVALID_MASTER_ACTION';",actions+" else raise exception 'INVALID_MASTER_ACTION';")
const sql=`-- PRODUCTION MASTER ACTIVATION PACKAGE. Review before applying.
-- Creates a separate empty schema; never copies simulated data or inserts cases.
-- Admin-only wrapper; private tables/functions remain inaccessible to app roles.
begin;
do $$begin
 if to_regprocedure('public.current_app_role()') is null or to_regclass('public.sdm_cases') is null then raise exception 'PRODUCTION_PREREQUISITES_MISSING';end if;
 if exists(select 1 from pg_namespace where nspname='recovery_live') or to_regprocedure('public.recovery_master_rpc(text,jsonb)') is not null then raise exception 'PRODUCTION_ALREADY_INITIALIZED_REVIEW_REQUIRED';end if;
end $$;
create schema recovery_live;
revoke all on schema recovery_live from public,anon,authenticated;
set local search_path=recovery_live,pg_catalog;
${foundation}
${batches}
${links}
${linkedRead}
revoke all on all tables in schema recovery_live from public,anon,authenticated;
revoke all on all sequences in schema recovery_live from public,anon,authenticated;
revoke all on all functions in schema recovery_live from public,anon,authenticated;
${broker}
commit;
`
fs.writeFileSync('supabase/recovery-production-activation.sql',sql)
const beginStart=batches.indexOf('create function recovery_live.recovery_begin(')
const beginEnd=batches.indexOf('end $$;',beginStart)+7
fs.writeFileSync('supabase/recovery-production-resume.sql',`-- Retry-safe begin; same permissions and same import workflow. Does not alter data.\nbegin;\n${batches.slice(beginStart,beginEnd).replace('create function','create or replace function')}\ncommit;\n`)
