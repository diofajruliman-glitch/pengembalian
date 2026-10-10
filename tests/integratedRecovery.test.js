import test from 'node:test'
import assert from 'node:assert/strict'
import {integratedDatabase,localApis} from './helpers/recoveryHarness.js'
import {createHash} from 'node:crypto'
import {fixtures,stageWorkbook} from '../scripts/create_stage_fixtures.mjs'
import {openSnapshot} from '../src/import/xlsxSnapshot.js'
import {BANK_SHEETS} from '../src/import/masterWorkbook.js'
import {summarizeBank,readRecap} from '../src/import/snapshotPreview.js'
import {stageBatch,commitBatch,loadStoredSnapshot} from '../src/import/batchTransport.js'
import {prepareStatus,commitStatus,reviewStoredNonactive} from '../src/recovery/nonactiveStatus.js'
import {loadFollowups,prepareFollowup,saveFollowup,followupIndex,linkedFollowupProgress} from '../src/recovery/followups.js'
import {selectProgress} from '../src/recovery/progress.js'
import {prepareReferences,commitReferences} from '../src/recovery/caseApi.js'
import {loadLinkedCaseRows} from '../src/recovery/linkedCases.js'
const admin='00000000-0000-0000-0000-000000000001',editor='00000000-0000-0000-0000-000000000002',viewer='00000000-0000-0000-0000-000000000003'
test('complete schema integrates imports, SDM status, both followup types and cases without overwriting manual data',async()=>{
 const db=await integratedDatabase()
 try{
  const publicImage=async()=>Object.fromEntries(await Promise.all(['profiles','bottlenecks','action_plans','bank_recap'].map(async t=>[t,(await db.query(`select to_jsonb(t) value from public.${t} t order by 1`)).rows])))
  const image=await publicImage(),auditBefore=(await db.query('select count(*)::int n from public.audit_events')).rows[0].n
  const api=localApis(db)
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false)`)
  const bytesByName=new Map(fixtures.map(f=>[f.name,stageWorkbook(f)]))
  const prepareWorkbook=async(f,old)=>{const bytes=bytesByName.get(f.name),wb=openSnapshot(bytes),base=old&&openSnapshot(bytesByName.get(old.name));return stageBatch(api.master,{fileName:'SIMULASI '+f.name+'.xlsx',sha256:createHash('sha256').update(bytes).digest('hex'),results:Object.entries(BANK_SHEETS).map(([sheet,bank])=>summarizeBank(wb.read(sheet),bank,base?.read(sheet)).result),recap:readRecap(wb.read('REKAPITULASI'))})}
  const baseline=await prepareWorkbook(fixtures[0]);await commitBatch(api.master,baseline.id,'Workbook simulasi dasar')
  let stored=await loadStoredSnapshot(api.master)
  assert.equal(selectProgress(followupIndex(stored)).totals.payment,25020)
  const staleImport=await prepareWorkbook(fixtures[1],fixtures[0])
  const person=stored.results[0].people.find(p=>p.bank==='Mandiri')
  const source={fileName:'STATUS SIMULASI.xlsx',sha256:'d'.repeat(64),nonactive:{issues:[]},nonactiveReview:[{...person,category:'BUP',endDateRaw:45000,reasonRaw:'Sumber simulasi'}]}
  const review=reviewStoredNonactive(stored,source)
  const status=await prepareStatus(api.sdm,stored,source,review.review)
  await commitStatus(api.sdm,status.id,'Rekonsiliasi status simulasi')
  await assert.rejects(commitBatch(api.master,staleImport.id,'Batch sebelum status berubah'),/STALE_PREVIEW/)
  stored=await loadStoredSnapshot(api.master)
  assert.equal(stored.revision,2);assert.equal(stored.results[0].people.find(p=>p.nip===person.nip).status_sdm,'BUP')
  assert.equal(selectProgress(followupIndex(stored),{status:'BUP'}).totals.payment,25000)
  const targets={action:(await db.query('select * from public.action_plans where no=1')).rows[0],bottleneck:(await db.query('select * from public.bottlenecks where no=1')).rows[0]}
  for(const [i,type] of ['action','bottleneck'].entries()){
   const target=targets[type],links=await loadFollowups(api.followup,type,target,stored)
   const payload=prepareFollowup({snapshot:stored,type,target,meta:links.meta,nips:[person.nip],operation:'add',requestId:`20000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`})
   await saveFollowup(api.followup,payload,'Tindak lanjut simulasi terhubung')
  }
  await db.exec('reset role')
  await db.query(`insert into public.sdm_cases(nip,nama,bank,kewajiban_total,realisasi_total,status,pic,catatan) values($1,$2,$3,999,0,'Proses Penagihan','PIC manual tetap','Catatan manual tetap')`,[person.nip,person.nama,person.bank])
  const manual=(await db.query('select * from public.sdm_cases')).rows[0]
  const caseImage=(await db.query('select to_jsonb(c) value from public.sdm_cases c')).rows[0].value
  await db.exec('set role authenticated')
  const candidate=selectProgress(followupIndex(stored)).rows.find(p=>p.nip===person.nip)
  const reference=await prepareReferences(api.master,stored,[{manual:{id:manual.id,updated_at:manual.updated_at.toISOString()},master:candidate,issues:[]}])
  await commitReferences(api.master,reference,'Referensi kasus simulasi')
  const fresh=await prepareWorkbook(fixtures[1],fixtures[0])
  assert.notEqual(fresh.id,staleImport.id)
  await assert.rejects(commitBatch(api.master,staleImport.id,'Batch lama tidak boleh aktif kembali'),/NOT_VALIDATED/)
  await commitBatch(api.master,fresh.id,'Tahap II simulasi setelah tinjauan ulang')
  stored=await loadStoredSnapshot(api.master)
  assert.equal(stored.revision,3)
  const total=selectProgress(followupIndex(stored)).totals
  assert.equal(total.obligation,100800);assert.equal(total.payment,30070);assert.equal(total.remaining,70730);assert.equal(total.verified,0)
  assert.equal(selectProgress(followupIndex(stored),{status:'BUP'}).totals.payment,30000)
  for(const type of ['action','bottleneck']){
   const links=await loadFollowups(api.followup,type,targets[type],stored)
   const monitored=linkedFollowupProgress(followupIndex(stored),links.rows)
   assert.equal(monitored.totals.people,1);assert.equal(monitored.totals.payment,30000);assert.equal(monitored.totals.remaining,70000)
  }
  const cases=await loadLinkedCaseRows(api.master)
  assert.equal(cases.rows[0].finance.payment,30000);assert.equal(cases.rows[0].finance.remaining,70000)
  await assert.rejects(prepareWorkbook(fixtures[1],fixtures[0]),/FILE_ALREADY_COMMITTED/)
  await assert.rejects(prepareWorkbook(fixtures[3],fixtures[1]),/MISSING_HISTORY/)
  for(const user of [editor,viewer]){
   await db.exec(`select set_config('request.jwt.claim.sub','${user}',false)`)
   for(const [client,action,args] of [[api.master,'recovery_read_meta',{}],[api.sdm,'prepare',{}],[api.followup,'meta',{type:'action',target:1}]]){
    assert.match((await client.rpc(action,args)).error.message,/FORBIDDEN/)
   }
  }
  await db.exec('reset role')
  assert.deepEqual(await publicImage(),image)
  assert.deepEqual((await db.query('select to_jsonb(c) value from public.sdm_cases c')).rows[0].value,caseImage)
  assert.equal((await db.query('select count(*)::int n from public.audit_events')).rows[0].n,auditBefore+1)
  assert.equal((await db.query('select value from recovery_test.sentinel')).rows[0].value,42)
  assert.equal((await db.query('select count(*)::int n from recovery_live.sdm_status_changes')).rows[0].n,1)
  assert.equal((await db.query('select count(*)::int n from recovery_live.followup_changes')).rows[0].n,2)
  assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='recovery_live' and c.relkind='r' and c.relrowsecurity")).rows[0].n,19)
 }finally{await db.close()}
})
