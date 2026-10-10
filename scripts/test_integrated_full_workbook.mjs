// All processing stays in local PostgreSQL. No network or production writes.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {integratedDatabase,localApis} from '../tests/helpers/recoveryHarness.js'
import {openSnapshot} from '../src/import/xlsxSnapshot.js'
import {BANK_SHEETS,parseBankSheet,reconcileBanks} from '../src/import/masterWorkbook.js'
import {readRecap} from '../src/import/snapshotPreview.js'
import {parseNonactive,matchNonactive} from '../src/import/nonactive.js'
import {stageBatch,commitBatch,loadStoredSnapshot} from '../src/import/batchTransport.js'
import {reviewStoredNonactive,prepareStatus,commitStatus} from '../src/recovery/nonactiveStatus.js'
import {followupIndex,loadFollowups,prepareFollowup,saveFollowup,linkedFollowupProgress} from '../src/recovery/followups.js'
import {selectProgress,detailBalances} from '../src/recovery/progress.js'
import {prepareReferences,commitReferences} from '../src/recovery/caseApi.js'
import {loadLinkedCaseRows} from '../src/recovery/linkedCases.js'
const bytes=fs.readFileSync(process.argv[2]),book=openSnapshot(bytes),started=Date.now(),db=await integratedDatabase()
const log=step=>console.log(JSON.stringify({step,elapsedMs:Date.now()-started}))
try{
 const results=Object.entries(BANK_SHEETS).map(([sheet,bank])=>parseBankSheet(book.read(sheet),bank,{keepZeroPayments:false}))
 const recap=readRecap(book.read('REKAPITULASI'));assert.deepEqual(reconcileBanks(results,recap),[])
 const nonactive=matchNonactive(results,parseNonactive(book.read(Object.keys(book.sheets).find(s=>s.trim().toLowerCase()==='master tidak aktif'))))
 const publicImage=async()=>Object.fromEntries(await Promise.all(['profiles','bottlenecks','action_plans','bank_recap'].map(async table=>[table,(await db.query(`select to_jsonb(t) value from public.${table} t order by 1`)).rows])))
 const before=await publicImage(),api=localApis(db)
 await db.exec("set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)")
 const initial=await stageBatch(api.master,{fileName:'WORKBOOK ASLI — SIMULASI LOKAL',sha256:createHash('sha256').update(bytes).digest('hex'),results,recap,onProgress:(n,total)=>{if(n%20000===0||n===total)console.log(JSON.stringify({step:'master-staging',rows:n,total,elapsedMs:Date.now()-started}))}})
 await commitBatch(api.master,initial.id,'Verifikasi lokal paket integrasi, bukan impor produksi');log('master-committed')
 let snapshot=await loadStoredSnapshot(api.master),totals=selectProgress(followupIndex(snapshot)).totals
 assert.equal(totals.obligation,5837623999);assert.equal(totals.payment,3641947218);assert.equal(totals.remaining,2195676781)
 const source={fileName:'WORKBOOK ASLI — STATUS LOKAL',sha256:createHash('sha256').update(bytes).digest('hex'),nonactive:nonactive.summary,nonactiveReview:nonactive.review}
 const review=reviewStoredNonactive(snapshot,source),status=await prepareStatus(api.sdm,snapshot,source,review.review)
 assert.equal(status.count,117);await commitStatus(api.sdm,status.id,'Pencocokan status workbook asli pada database lokal')
 snapshot=await loadStoredSnapshot(api.master)
 assert.deepEqual(selectProgress(followupIndex(snapshot)).totals,totals);assert.equal(snapshot.results[0].people.filter(p=>p.status_sdm).length,117);log('117-statuses-preserved-balances')
 const index=followupIndex(snapshot),retired=selectProgress(index,{status:'BUP'}).rows
 const briCandidate=selectProgress(index,{bank:'BRI'}).rows.find(p=>p.remaining>1)
 assert.ok(briCandidate)
 const targetAction=(await db.query('select * from public.action_plans where no=5')).rows[0],targetBottleneck=(await db.query('select * from public.bottlenecks where no=9')).rows[0]
 for(const [i,type,target] of [[1,'action',targetAction],[2,'bottleneck',targetBottleneck]]){
  const links=await loadFollowups(api.followup,type,target,snapshot)
  await saveFollowup(api.followup,prepareFollowup({snapshot,type,target,meta:links.meta,nips:[briCandidate.nip],operation:'add',requestId:`30000000-0000-0000-0000-${String(i).padStart(12,'0')}`}), 'Penghubungan hanya pada database lokal')
 }
 await db.exec('reset role')
 await db.query(`insert into public.sdm_cases(nip,nama,bank,kewajiban_total,realisasi_total,status,pic,catatan) values($1,$2,$3,999,0,'Proses Penagihan','PIC SIMULASI','Catatan SIMULASI')`,[briCandidate.nip,briCandidate.nama,briCandidate.bank])
 const manual=(await db.query('select * from public.sdm_cases')).rows[0],caseImage=(await db.query('select to_jsonb(c) value from public.sdm_cases c')).rows[0].value
 await db.exec('set role authenticated')
 const ref=await prepareReferences(api.master,snapshot,[{manual:{id:manual.id,updated_at:manual.updated_at.toISOString()},master:briCandidate,issues:[]}])
 await commitReferences(api.master,ref,'Referensi kasus hanya di database lokal')
 // Synthetic Rp1 receipt for a single bank; original workbook bytes remain untouched.
 const bri=structuredClone(results.find(r=>r.bank==='BRI')),balance=detailBalances(briCandidate).find(o=>o.remaining>1)
 const stage=1+Math.max(0,...bri.payments.filter(p=>p.kind===balance.kind&&p.year===balance.year).map(p=>p.stage))
 bri.payments.push({nip:briCandidate.nip,bank:'BRI',kind:balance.kind,year:balance.year,stage,amount:1})
 const briRecap={BRI:{obligation:bri.obligations.reduce((s,o)=>s+o.amount,0),payment:bri.payments.reduce((s,p)=>s+p.amount,0)}}
 const hash=createHash('sha256').update('LOCAL SYNTHETIC BRI STAGE '+source.sha256).digest('hex')
 const next=await stageBatch(api.master,{fileName:'BRI TAHAP TAMBAHAN SINTETIS — LOKAL',sha256:hash,results:[bri],recap:briRecap})
 await commitBatch(api.master,next.id,'Rp1 simulasi untuk menguji pembaruan progres, bukan transaksi riil')
 snapshot=await loadStoredSnapshot(api.master)
 const after=selectProgress(followupIndex(snapshot)).totals
 assert.equal(after.obligation,totals.obligation);assert.equal(after.payment,totals.payment+1);assert.equal(after.remaining,totals.remaining-1);assert.equal(after.verified,0)
 assert.equal(snapshot.results[0].people.filter(p=>p.status_sdm).length,117)
 for(const [type,target] of [['action',targetAction],['bottleneck',targetBottleneck]]){
  const links=await loadFollowups(api.followup,type,target,snapshot),linked=linkedFollowupProgress(followupIndex(snapshot),links.rows)
  assert.equal(linked.totals.payment,briCandidate.payment+1);assert.equal(linked.totals.remaining,briCandidate.remaining-1)
 }
 const cases=await loadLinkedCaseRows(api.master)
 assert.equal(cases.rows[0].finance.payment,briCandidate.payment+1)
 await assert.rejects(stageBatch(api.master,{fileName:'UJI ULANG LOKAL',sha256:hash,results:[bri],recap:briRecap}),/FILE_ALREADY_COMMITTED/)
 await db.exec('reset role')
 assert.deepEqual(await publicImage(),before);assert.deepEqual((await db.query('select to_jsonb(c) value from public.sdm_cases c')).rows[0].value,caseImage)
 const report={localOnly:true,originalWorkbookUnchanged:true,people:snapshot.results[0].people.length,sourceTotals:totals,nonactive:review.summary,storedStatuses:117,positiveRetiredPeople:retired.length,syntheticReceiptAmount:1,updatedTotals:after,actionAndBottleneckFollowLatestLedger:true,caseFollowsLatestLedger:true,manualTablesPreserved:true,repeatBlocked:true,revision:snapshot.revision,elapsedMs:Date.now()-started}
 fs.writeFileSync('.local-analysis/integrated-full-workbook-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}finally{await db.close()}
