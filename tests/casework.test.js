import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {caseworkClient,applyCasework,caseworkExport,attachCasework} from '../src/recovery/casework.js'
import {productionMasterClient} from '../src/import/productionClient.js'
import {stageBatch,commitBatch,loadStoredSnapshot,makeRecords} from '../src/import/batchTransport.js'
import {indexSnapshot,selectProgress} from '../src/recovery/progress.js'
import {linkedFollowupProgress} from '../src/recovery/followups.js'
const admin='00000000-0000-0000-0000-000000000001',editor='00000000-0000-0000-0000-000000000002',viewer='00000000-0000-0000-0000-000000000003',nip='000000000000000001',url='https://tagokvlsirebfgltbxmq.supabase.co'
const uuid=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const base=()=>[{issues:[],people:[{nip,nama:'SDM SIMULASI',bank:'BRI'}],obligations:[{nip,bank:'BRI',kind:'TUKIN',year:2025,amount:1000},{nip,bank:'BRI',kind:'UM',year:2025,amount:0}],payments:[{nip,bank:'BRI',kind:'TUKIN',year:2025,stage:7,amount:600}]}]
test('casework overlay counts verified receipts once before/after workbook matching and preserves raw imports',()=>{
 const snapshot={source:'database',scope:'production',revision:1,results:base()}
 const receipts=[{id:uuid(1),bank:'BRI',kind:'TUKIN',year:2025,stage:7,amount:100,ntpn:'TESTNTPN00000001',verification:'verified',included:false},{id:uuid(2),bank:'BRI',kind:'TUKIN',year:2025,stage:7,amount:100,verification:'pending',included:false}]
 const rows=[{nip,status:'Pensiun',needsReview:false,lastNote:{note:'Surat diterima',status:'Menunggu Respons',pic:'PIC',deadline:'2026-11-01'},receipts}]
 const overlay=applyCasework(snapshot,rows),selection=selectProgress(indexSnapshot(overlay.results))
 assert.equal(selection.totals.payment,700);assert.equal(selection.totals.remaining,300);assert.equal(selection.totals.verified,100)
 assert.equal(snapshot.results[0].payments[0].amount,600);assert.equal(makeRecords(overlay.results).filter(r=>r.type==='payment').length,1);assert.equal(caseworkExport(selection)[1][6],'Surat diterima')
 const next=structuredClone(snapshot);next.results[0].payments[0].amount=700;receipts[0].included=true
 const matched=applyCasework(next,rows);assert.equal(selectProgress(indexSnapshot(matched.results)).totals.payment,700);assert.equal(makeRecords(matched.results).find(r=>r.type==='payment').data.amount,700)
 receipts.push({id:uuid(3),bank:'BRI',kind:'TUKIN',year:2025,stage:8,amount:300,verification:'verified',included:false})
 const paidIndex=indexSnapshot(applyCasework(next,rows).results)
 assert.equal(selectProgress(paidIndex,{worklist:'nonactive'}).rows.length,0)
 assert.equal(selectProgress(paidIndex,{worklist:'paid'}).rows[0].remaining,0)
 assert.equal(linkedFollowupProgress(paidIndex,[{nip,available:true}],{worklist:'paid'}).linkedCount,1)
 assert.equal(caseworkClient({},'off',url),null);assert.equal(caseworkClient({},'production-casework','https://other.supabase.co'),null)
})
test('casework reader rejects mixed master revisions',async()=>{await assert.rejects(attachCasework({revision:1,results:base()},{rpc:async()=>({revision:2,rows:[]})}),/berubah/)})
test('private casework API stores actions/status/evidence; independent verification updates balance; explicit workbook match prevents duplicates',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,role text);
   insert into auth.users values('${admin}','admin'),('${editor}','editor'),('${viewer}','viewer');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function public.current_app_role() returns text language sql stable security definer as $$select role from auth.users where id=auth.uid()$$;
   create table public.sdm_cases(id bigint primary key,nip text,nama text,bank text,status text,pic text,deadline date,catatan text,bukti text,kewajiban_total numeric,realisasi_total numeric,updated_at timestamptz,deleted_at timestamptz);
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`)
  await db.exec(fs.readFileSync('supabase/recovery-production-activation.sql','utf8'))
  await db.exec(fs.readFileSync('supabase/recovery-casework.draft.sql','utf8'))
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false)`)
  const raw={rpc:async(name,args)=>{try{const q=await db.query(`select public.${name}($1,$2) result`,[args.p_action,JSON.stringify(args.p_payload)]);return {data:q.rows[0].result}}catch(error){return {error}}}}
  const api=productionMasterClient(raw,'production-master',url),work=caseworkClient(raw,'production-casework',url)
  const direct=(action,payload)=>db.query('select public.recovery_casework_rpc($1,$2) result',[action,JSON.stringify(payload)])
  const initial=await stageBatch(api,{fileName:'SIMULASI.xlsx',sha256:'1'.repeat(64),results:base(),recap:{BRI:{obligation:1000,payment:600}}});await commitBatch(api,initial.id,'Master simulasi')
  await db.exec(`select set_config('request.jwt.claim.sub','${editor}',false)`)
  const path=`${nip}/${editor}/${uuid(1)}.pdf`;await db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['recovery-evidence',path])
  const payload={requestId:uuid(1),nip,type:'receipt_submitted',data:{note:'Setoran baru belum tercatat',evidencePath:path,ntpn:'TESTNTPN00000001',paymentDate:'2026-10-10',bank:'BRI',kind:'TUKIN',year:2025,stage:7,amount:100,notInWorkbook:true}}
  await work.rpc('record',payload);await work.rpc('record',payload)
  await assert.rejects(work.rpc('record',{...payload,data:{...payload.data,amount:101}}),/REQUEST_CHANGED/)
  const verify={requestId:uuid(2),nip,type:'receipt_verified',data:{receipt:uuid(1),note:'Bukti dan penerimaan diperiksa'}}
  await assert.rejects(direct('record',verify),/ADMIN_REQUIRED/)
  await db.exec(`select set_config('request.jwt.claim.sub','${viewer}',false)`);assert.equal((await work.rpc('detail',{nip})).receipts.length,1);await assert.rejects(direct('record',{requestId:uuid(3),nip,type:'note',data:{note:'Test'}}),/FORBIDDEN/)
  await assert.rejects(db.query('select * from recovery_live.direct_receipts'),/permission denied/)
  await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);await work.rpc('record',verify);await work.rpc('record',verify)
  api.caseworkApi=work
  const totals=async()=>selectProgress(indexSnapshot((await loadStoredSnapshot(api)).results)).totals
  assert.equal((await totals()).payment,700);assert.equal((await totals()).remaining,300);assert.equal((await totals()).verified,100)
  const adminPath=`${nip}/${admin}/${uuid(20)}.pdf`;await db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['recovery-evidence',adminPath])
  await work.rpc('record',{...payload,requestId:uuid(20),data:{...payload.data,ntpn:'TESTNTPN00000020',amount:25,evidencePath:adminPath}})
  await assert.rejects(direct('record',{requestId:uuid(21),nip,type:'receipt_verified',data:{receipt:uuid(20),note:'Self approval refused'}}),/SECOND_REVIEWER_REQUIRED/)
  await work.rpc('record',{requestId:uuid(22),nip,type:'receipt_rejected',data:{receipt:uuid(20),note:'Bukti simulasi dibatalkan'}})
  const updated=base();updated[0].payments[0].amount=700
  const batch=await stageBatch(api,{fileName:'SIMULASI-LANJUT.xlsx',sha256:'2'.repeat(64),results:updated,recap:{BRI:{obligation:1000,payment:700}}})
  const matching=await work.rpc('import_review',{batch:batch.id});assert.equal(matching.length,1);assert.equal(matching[0].before,600);assert.equal(matching[0].after,700)
  const otherStage=base();otherStage[0].payments.push({...otherStage[0].payments[0],stage:8,amount:100})
  const otherBatch=await stageBatch(api,{fileName:'SIMULASI-TAHAP-LAIN.xlsx',sha256:'4'.repeat(64),results:otherStage,recap:{BRI:{obligation:1000,payment:700}}})
  const otherReview=await work.rpc('import_review',{batch:otherBatch.id});assert.equal(otherReview.length,1);assert.equal(otherReview[0].changes[0].stage,8)
  await assert.rejects(commitBatch(api,otherBatch.id,'Tanpa tinjauan tahap lain'),/DIRECT_RECEIPTS_REVIEW_REQUIRED/)
  await assert.rejects(commitBatch(api,batch.id,'Belum dicocokkan'),/DIRECT_RECEIPTS_REVIEW_REQUIRED/)
  assert.equal((await totals()).payment,700)
  await work.rpc('commit_import',{batch:batch.id,reason:'NTPN cocok ke workbook',choices:[{id:uuid(1),included:true}]})
  await work.rpc('commit_import',{batch:batch.id,reason:'Ulangi setelah jaringan terputus',choices:[{id:uuid(1),included:true}]})
  assert.equal((await totals()).payment,700);assert.equal((await totals()).remaining,300);assert.equal((await totals()).verified,100)
  await db.exec(`select set_config('request.jwt.claim.sub','${editor}',false)`)
  await work.rpc('record',{requestId:uuid(4),nip,type:'note',data:{note:'Surat diterima, menunggu respons',pic:'PIC SIMULASI',deadline:'2026-11-01',status:'Menunggu Respons'}})
  await work.rpc('record',{requestId:uuid(5),nip,type:'status_report',data:{note:'SK pensiun diperiksa',status:'Pensiun',evidencePath:path}})
  await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`)
  await work.rpc('record',{requestId:uuid(6),nip,type:'status_verified',data:{note:'Dokumen cocok dengan master',report:uuid(5),status:'Pensiun'}})
  const loaded=await loadStoredSnapshot(api);assert.equal(loaded.results[0].people[0].sourceMetadata.status,'Pensiun');assert.equal(loaded.results[0].people[0].casework.lastNote.pic,'PIC SIMULASI')
  await db.exec(`reset role;insert into public.sdm_cases values(1,'${nip}','SDM SIMULASI','BRI','Proses Penagihan','PIC manual','2026-12-15','Catatan tetap','',999,0,'2026-01-01T00:00:00Z',null);set role authenticated;`)
  const link=await api.rpc('case_prepare',{p_revision:loaded.revision,p_cases:[{caseId:'1',expectedUpdatedAt:'2026-01-01T00:00:00Z'}]});assert.ifError(link.error)
  assert.ifError((await api.rpc('case_commit',{p_batch:link.data,p_reason:'Hubungkan simulasi'})).error)
  const monitoring=await api.rpc('recovery_linked_cases',{p_after:'0',p_limit:100});assert.ifError(monitoring.error);assert.equal(monitoring.data.rows[0].finance.payment,700);assert.equal(monitoring.data.rows[0].finance.verified,100);assert.equal(monitoring.data.rows[0].manual.catatan,'Catatan tetap')
  await db.exec(`select set_config('request.jwt.claim.sub','${editor}',false)`)
  await work.rpc('record',{requestId:uuid(30),nip,type:'status_report',data:{note:'Status berbeda perlu ditinjau',status:'Mengundurkan Diri',evidencePath:path}})
  await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`)
  await work.rpc('record',{requestId:uuid(31),nip,type:'status_rejected',data:{note:'Dokumen tidak sesuai',report:uuid(30)}})
  assert.equal((await loadStoredSnapshot(api)).results[0].people[0].sourceMetadata.needsReview,false)
  const over=base();over[0].payments[0].amount=650
  const correction=await stageBatch(api,{fileName:'SIMULASI-KOREKSI.xlsx',sha256:'3'.repeat(64),results:over,recap:{BRI:{obligation:1000,payment:650}}});await assert.rejects(commitBatch(api,correction.id,'Koreksi penurunan'),/MATCHED_RECEIPT_CORRECTION_REQUIRES_REVIEW/)
  await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from recovery_live.direct_receipts where verification='verified'")).rows[0].n,1);assert.equal((await db.query("select count(*)::int n from recovery_live.casework_events where event_type='workbook_match'")).rows[0].n,1)
  assert.equal((await db.query("select has_function_privilege('anon','public.recovery_casework_rpc(text,jsonb)','execute') yes")).rows[0].yes,false)
 }finally{await db.close()}
})
