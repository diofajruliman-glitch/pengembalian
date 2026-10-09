import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {fixtures,stageWorkbook} from '../scripts/create_stage_fixtures.mjs'
import {openSnapshot} from '../src/import/xlsxSnapshot.js'
import {BANK_SHEETS} from '../src/import/masterWorkbook.js'
import {summarizeBank,readRecap} from '../src/import/snapshotPreview.js'
import {isolatedTestClient,stageBatch,commitBatch,loadStoredSnapshot} from '../src/import/batchTransport.js'
import {indexSnapshot,selectProgress} from '../src/recovery/progress.js'
test('real workbook pipeline preserves stages, blocks repeats/missing history and audits zero corrections',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('00000000-0000-0000-0000-000000000001');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function public.current_app_role() returns text language sql stable as $$select 'admin'::text$$;`)
  await db.exec(fs.readFileSync('supabase/recovery-isolated-test.sql','utf8'));await db.exec(fs.readFileSync('supabase/recovery-isolated-api.sql','utf8'));await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)")
  const adapter=isolatedTestClient({rpc:async(name,args)=>{try{const q=await db.query('select public.recovery_test_rpc($1,$2) result',[args.p_action,JSON.stringify(args.p_payload)]);return {data:q.rows[0].result}}catch(error){return {error}}}},'isolated-test','https://tagokvlsirebfgltbxmq.supabase.co')
  const bytes=new Map(fixtures.map(f=>[f.name,stageWorkbook(f)]))
  const prepare=async(name,baseline)=>{const file=bytes.get(name),wb=openSnapshot(file),old=baseline&&openSnapshot(bytes.get(baseline));const results=Object.entries(BANK_SHEETS).map(([sheet,bank])=>summarizeBank(wb.read(sheet),bank,old?.read(sheet)).result);return stageBatch(adapter,{fileName:name+'.xlsx',sha256:createHash('sha256').update(file).digest('hex'),results,recap:readRecap(wb.read('REKAPITULASI'))})}
  const save=async(name,baseline)=>{const b=await prepare(name,baseline);await commitBatch(adapter,b.id,'Simulasi '+name)}
  const totals=async()=>selectProgress(indexSnapshot((await loadStoredSnapshot(adapter)).results)).totals
  await save('stage-baseline');assert.equal((await totals()).payment,25020)
  await save('stage-added','stage-baseline');assert.equal((await totals()).payment,30070)
  await assert.rejects(prepare('stage-added','stage-baseline'),/FILE_ALREADY_COMMITTED/)
  assert.equal((await db.query('select count(*)::int n from recovery_test.recovery_payments')).rows[0].n,6)
  await save('stage-corrected','stage-added');assert.equal((await totals()).payment,25070)
  await assert.rejects(prepare('stage-missing','stage-corrected'),/MISSING_HISTORY/);assert.equal((await totals()).payment,25070)
  // Removing the entire new-stage header also cannot delete its historical receipts.
  bytes.set('stage-removed',stageWorkbook({name:'removed',first:[20000,10,10]}))
  await assert.rejects(prepare('stage-removed','stage-corrected'),/MISSING_HISTORY/)
  await save('stage-zero','stage-corrected');assert.equal((await totals()).payment,5070)
  assert.equal((await totals()).remaining,95730)
  const audit=await db.query("select before_data->>'nominal' before_amount,after_data->>'amount' after_amount,reason from recovery_test.recovery_changes where entity='payment' and after_data->>'amount'='0'")
  assert.equal(audit.rows[0].before_amount,'20000');assert.equal(audit.rows[0].after_amount,'0');assert.ok(audit.rows[0].reason)
 }finally{await db.close()}
})
