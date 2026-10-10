// Local PostgreSQL only. No network calls and no workbook upload.
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {openSnapshot} from '../src/import/xlsxSnapshot.js'
import {BANK_SHEETS,parseBankSheet,reconcileBanks} from '../src/import/masterWorkbook.js'
import {readRecap} from '../src/import/snapshotPreview.js'
import {stageBatch,commitBatch,loadStoredSnapshot,makeRecords} from '../src/import/batchTransport.js'
import {productionMasterClient} from '../src/import/productionClient.js'
import {indexSnapshot,selectProgress} from '../src/recovery/progress.js'
import {summarizeSp2dYears} from '../src/import/sp2dYears.js'
import {prepareReferences,commitReferences} from '../src/recovery/caseApi.js'
import {loadLinkedCaseRows} from '../src/recovery/linkedCases.js'
import assert from 'node:assert/strict'
const started=Date.now(),db=new PGlite(),actor='00000000-0000-0000-0000-000000000001'
try{
 const bytes=new Uint8Array(fs.readFileSync(process.argv[2])),book=openSnapshot(bytes)
 const results=Object.entries(BANK_SHEETS).map(([sheet,bank])=>parseBankSheet(book.read(sheet),bank,{keepZeroPayments:false}))
 const recap=readRecap(book.read('REKAPITULASI'))
 assert.equal(results.some(r=>r.issues.length),false);assert.deepEqual(reconcileBanks(results,recap),[])
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${actor}');
 create function auth.uid() returns uuid language sql stable as $$select '${actor}'::uuid$$;
 create function public.current_app_role() returns text language sql stable as $$select 'admin'::text$$;
 create table public.sdm_cases(id bigint primary key,nip text,nama text,bank text,status text,pic text,deadline date,catatan text,bukti text,kewajiban_total numeric,realisasi_total numeric,updated_at timestamptz not null,deleted_at timestamptz);`)
 await db.exec(fs.readFileSync('supabase/recovery-production-activation.sql','utf8'))
 await db.exec('set role authenticated')
 const client=productionMasterClient({rpc:async(name,args)=>{try{const q=await db.query('select public.recovery_master_rpc($1,$2) result',[args.p_action,JSON.stringify(args.p_payload)]);return {data:q.rows[0].result}}catch(error){return {error}}}},'production-master','https://tagokvlsirebfgltbxmq.supabase.co')
 const hash=createHash('sha256').update(bytes).digest('hex')
 const batch=await stageBatch(client,{fileName:'WORKBOOK ASLI — UJI LOKAL',sha256:hash,results,recap,onProgress:(n,total)=>{if(n%20000===0||n===total)console.log(JSON.stringify({step:'staging',loaded:n,total,elapsedMs:Date.now()-started}))}})
 assert.equal(batch.summary.initialImport,true)
 const commitStart=Date.now();await commitBatch(client,batch.id,'Verifikasi lokal workbook dasar, bukan aktivasi server')
 const commitMs=Date.now()-commitStart
 await assert.rejects(stageBatch(client,{fileName:'UJI ULANG LOKAL',sha256:hash,results,recap}),/FILE_ALREADY_COMMITTED/)
 const readStart=Date.now(),stored=await loadStoredSnapshot(client),readMs=Date.now()-readStart
 assert.deepEqual(summarizeSp2dYears(stored.results),summarizeSp2dYears(results))
 assert.equal(stored.results[0].people.length,results.reduce((s,r)=>s+r.people.length,0))
 const candidate=selectProgress(indexSnapshot(stored.results)).rows[0]
 await db.exec('reset role')
 await db.query(`insert into public.sdm_cases values(1,$1,$2,$3,'Proses Penagihan','PIC UJI LOKAL','2026-12-15','CATATAN UJI LOKAL',null,999,0,'2026-01-01T00:00:00Z',null)`,[candidate.nip,candidate.nama,candidate.bank])
 const before=(await db.query('select to_jsonb(c) image from public.sdm_cases c')).rows[0].image
 await db.exec('set role authenticated')
 const ref=await prepareReferences(client,stored,[{manual:{id:1,updated_at:'2026-01-01T00:00:00Z'},master:candidate,issues:[]}])
 await commitReferences(client,ref,'Tinjauan kasus hanya dalam PostgreSQL lokal')
 const monitored=(await loadLinkedCaseRows(client)).rows[0]
 assert.equal(monitored.finance.obligation,candidate.obligation);assert.equal(monitored.finance.payment,candidate.payment)
 await db.exec('reset role')
 assert.deepEqual((await db.query('select to_jsonb(c) image from public.sdm_cases c')).rows[0].image,before)
 const report={localOnly:true,people:stored.results[0].people.length,records:makeRecords(results).length,years:summarizeSp2dYears(stored.results),commitMs,readMs,elapsedMs:Date.now()-started,repeatBlocked:true,caseManualPreserved:true,referenceMatchesMaster:true}
 fs.writeFileSync('.local-analysis/production-full-batch-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}finally{await db.close()}
