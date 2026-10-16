import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {disciplineStorage,followupStatuses} from '../src/judol/storage.js'
import {analyzeDiscipline,parseDisciplineWorkbook} from '../src/judol/analysis.js'

const admin='00000000-0000-0000-0000-000000000001'
const editor='00000000-0000-0000-0000-000000000002'
const viewer='00000000-0000-0000-0000-000000000003'
const outsider='00000000-0000-0000-0000-000000000004'
const otherAdmin='00000000-0000-0000-0000-000000000005'
const nik='0000000000000001'
const rules={version:1,reference:'Nodin 3513',frequencyWeight:60,depositWeight:30,timeWeight:10}
const period={frekuensi:3,nominal:30000,dalam:0,luar:3,unknown:0,total:21,kategori:'Ringan',status:'Lengkap',invalidDuplicates:0,identityConflicts:0}
const sample=()=>({rows:[{nik,nama:'SDM simulasi',nip:'',hasilPenilaian:'Terbukti',historical:{...period},before:{...period},after:{...period},audits:[]}],rules:{...rules,provenance:['Asumsi analisis']},audits:[],source:{filename:'sumber.xlsx',sha256:'a'.repeat(64),reference:'Nodin Sekjen 3513'},metadata:{transactionCount:6},stats:{total:1}})
const missingNumericFields=['frekuensi','nominal','dalam','luar','unknown','timeFromPairing','timeFromPairingInside','timeFromPairingOutside','total','scoreFrequency','scoreDeposit','scoreTime','invalidDates','invalidAmounts','invalidDuplicates','identityConflicts']
const missingPeriod=()=>({...Object.fromEntries(missingNumericFields.map(key=>[key,null])),kategori:'Rincian transaksi belum tersedia',status:'Rincian transaksi belum tersedia',categoryFrequency:'',categoryDeposit:'',categoryTime:''})
const missingSample=()=>{const result=sample();Object.assign(result.rows[0],{missingTransactionDetails:true,sourceTransactionCount:0,before:missingPeriod(),after:missingPeriod()});return result}
const categoryReferenceStatus='Kategori acuan Hasil pairing; rincian periode belum tersedia'
const referenceSample=()=>{const result=missingSample();result.rows[0].categoryFromPairing=true;for(const key of ['before','after'])Object.assign(result.rows[0][key],{kategori:result.rows[0].historical.kategori,status:categoryReferenceStatus});return result}

async function database(){
 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,role text);
 insert into auth.users values('${admin}','admin'),('${editor}','editor'),('${viewer}','viewer'),('${outsider}',null),('${otherAdmin}','admin');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.current_app_role() returns text language sql stable security definer as $$select role from auth.users where id=auth.uid()$$;
 grant usage on schema auth to authenticated;
 create table public.recovery_sentinel(value integer);insert into public.recovery_sentinel values(42);`)
 const migration=fs.readFileSync('supabase/discipline-module.sql','utf8')
 await db.exec(migration)
 // Running this migration twice must not replace stored data or alter grants.
 await db.exec(migration)
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false)`)
 const transport={rpc:async(name,args)=>{
  assert.equal(name,'discipline_rpc')
  try{return {data:(await db.query('select public.discipline_rpc($1,$2) result',[args.p_action,JSON.stringify(args.p_payload)])).rows[0].result}}
  catch(error){return {error}}
 }}
 const client=disciplineStorage(transport)
 const as=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
 const rpc=async(action,payload)=>(await db.query('select public.discipline_rpc($1,$2) result',[action,JSON.stringify(payload)])).rows[0].result
 return {db,client,as,rpc}
}

test('request keys replay committed versions once, survive migration and remain actor-scoped',async()=>{
 const {db,client,as,rpc}=await database()
 try{
  const requestId='10000000-0000-0000-0000-000000000001'
  const input={name:'  Impor aman  ',filename:'sumber.xlsx',parentId:null,result:sample(),requestId}
  const attempts=await Promise.all(Array.from({length:4},()=>rpc('save_version',input)))
  assert.equal(new Set(attempts.map(x=>x.id)).size,1)
  const first=attempts[0]
  assert.equal(first.name,'Impor aman')
  assert.equal((await client.listDatasets()).length,1)
  assert.equal((await client.loadDataset(first.id)).auditEvents.length,1)
  // JSON key order is not a new payload, and the API trims dataset names.
  const reordered={...input,name:'Impor aman',result:{stats:input.result.stats,...input.result}}
  assert.equal((await rpc('save_version',reordered)).id,first.id)
  const childInput={...input,name:'Versi parameter baru',parentId:first.id,requestId:'10000000-0000-0000-0000-000000000002'}
  const child=await rpc('save_version',childInput)
  assert.equal(child.version,2)
  assert.equal((await rpc('save_version',childInput)).id,child.id)
  assert.equal((await client.loadDataset(child.id)).auditEvents.length,1)
  await db.exec('reset role')
  await db.exec(fs.readFileSync('supabase/discipline-module.sql','utf8'))
  // The database constraint, independently of the RPC's preliminary lookup,
  // prevents two rows from ever owning one actor/key.
  await assert.rejects(db.query(`insert into public.discipline_datasets(name,filename,version,result,created_by,request_id)
   values('Duplikat','sumber.xlsx',1,$1,$2,$3)`,[JSON.stringify(sample()),admin,requestId]),/duplicate key/)
  await db.exec('set role authenticated')
  assert.equal((await rpc('save_version',input)).id,first.id)
  await as(otherAdmin)
  const other=await rpc('save_version',input)
  assert.notEqual(other.id,first.id)
  await as(admin)
  await client.archiveDataset(first.id)
  assert.equal((await rpc('save_version',input)).id,first.id)
  assert.equal((await rpc('save_version',input)).status,'archived')
  assert.equal((await rpc('save_version',childInput)).id,child.id)
  assert.equal((await client.loadDataset(first.id)).auditEvents.length,2)
  await assert.rejects(rpc('save_version',{...childInput,requestId:'10000000-0000-0000-0000-000000000003'}),/DISCIPLINE_ARCHIVED/)
  await as(editor)
  await assert.rejects(rpc('save_version',input),/DISCIPLINE_FORBIDDEN/)
  await as(viewer)
  await assert.rejects(rpc('save_version',input),/DISCIPLINE_FORBIDDEN/)
 }finally{await db.close()}
})

test('changed request-key payloads conflict atomically; failed writes do not reserve keys',async()=>{
 const {db,client,rpc}=await database()
 try{
  const requestId='20000000-0000-0000-0000-000000000001'
  const input={name:'Impor',filename:'sumber.xlsx',parentId:null,result:sample(),requestId}
  const saved=await rpc('save_version',input)
  const alternative=await client.saveVersion({name:'Induk lain',filename:'sumber.xlsx',result:sample()})
  const changed=sample();changed.rules.frequencyWeight=55
  for(const patch of [{name:'Nama lain'},{filename:'lain.xlsx'},{parentId:alternative.id},{result:changed}]){
   await assert.rejects(rpc('save_version',{...input,...patch}),/DISCIPLINE_REQUEST_CONFLICT/)
  }
  for(const requestId of [null,'',1,{},'not-a-uuid'])await assert.rejects(rpc('save_version',{...input,requestId}),/DISCIPLINE_INVALID_INPUT/)
  const retry={...input,requestId:'20000000-0000-0000-0000-000000000002'}
  await assert.rejects(rpc('save_version',{...retry,result:{...sample(),transactions:[]}}),/DISCIPLINE_INVALID_RESULT/)
  const valid=await rpc('save_version',retry)
  assert.equal(valid.version,1)
  // Callers that omit requestId continue creating distinct versions.
  const legacy={name:'App lama',filename:'sumber.xlsx',result:sample()}
  const oldA=await rpc('save_version',legacy),oldB=await rpc('save_version',legacy)
  assert.notEqual(oldA.id,oldB.id)
  assert.equal((await client.listDatasets()).length,5)
  assert.deepEqual((await client.loadDataset(saved.id)).result,input.result)
  assert.equal((await client.loadDataset(saved.id)).auditEvents.length,1)
 }finally{await db.close()}
})

test('followup compare-and-save rejects stale or competing editors without losing their newer audit',async()=>{
 const {db,client,as,rpc}=await database()
 try{
  const dataset=await client.saveVersion({name:'Tindak lanjut aman',filename:'sumber.xlsx',result:sample()})
  const create={datasetId:dataset.id,nik,patch:{notes:'Catatan pertama'},expectedUpdatedAt:null}
  const starts=await Promise.allSettled([rpc('save_followup',create),rpc('save_followup',{...create,patch:{notes:'Catatan bersaing'}})])
  assert.equal(starts.filter(x=>x.status==='fulfilled').length,1)
  assert.match(starts.find(x=>x.status==='rejected').reason.message,/DISCIPLINE_FOLLOWUP_CONFLICT/)
  const first=starts.find(x=>x.status==='fulfilled').value
  await as(editor)
  const second=await rpc('save_followup',{datasetId:dataset.id,nik,patch:{pic:'Editor B'},expectedUpdatedAt:first.updatedAt})
  assert.notEqual(second.updatedAt,first.updatedAt)
  await assert.rejects(rpc('save_followup',{...create,patch:{notes:'Edit lama'},expectedUpdatedAt:first.updatedAt}),/DISCIPLINE_FOLLOWUP_CONFLICT/)
  await assert.rejects(rpc('save_followup',create),/DISCIPLINE_FOLLOWUP_CONFLICT/)
  let loaded=await client.loadDataset(dataset.id)
  assert.equal(loaded.auditEvents.length,3)
  assert.equal(loaded.auditEvents.at(-1).before.updatedAt,first.updatedAt)
  assert.equal(loaded.auditEvents.at(-1).after.updatedAt,second.updatedAt)
  assert.equal((await client.loadFollowups(dataset.id))[0].pic,'Editor B')
  // now() is constant inside one transaction: each successful write must still
  // advance its token, otherwise a stale second write could silently succeed.
  await db.exec('begin')
  const third=await rpc('save_followup',{...create,patch:{notes:'Revisi C'},expectedUpdatedAt:second.updatedAt})
  const fourth=await rpc('save_followup',{...create,patch:{notes:'Revisi D'},expectedUpdatedAt:third.updatedAt})
  assert.notEqual(third.updatedAt,fourth.updatedAt)
  await db.exec('commit')
  const races=await Promise.allSettled([
   rpc('save_followup',{...create,patch:{notes:'Revisi E'},expectedUpdatedAt:fourth.updatedAt}),
   rpc('save_followup',{...create,patch:{notes:'Revisi F'},expectedUpdatedAt:fourth.updatedAt})
  ])
  assert.equal(races.filter(x=>x.status==='fulfilled').length,1)
  assert.match(races.find(x=>x.status==='rejected').reason.message,/DISCIPLINE_FOLLOWUP_CONFLICT/)
  // Omitting the token retains compatibility for earlier application versions.
  const legacy=await rpc('save_followup',{datasetId:dataset.id,nik,patch:{decisionNote:'Aplikasi lama'}})
  assert.equal(legacy.pic,'Editor B')
  loaded=await client.loadDataset(dataset.id)
  assert.equal(loaded.auditEvents.length,7)
  await as(viewer)
  await assert.rejects(rpc('save_followup',{...create,expectedUpdatedAt:legacy.updatedAt}),/DISCIPLINE_FORBIDDEN/)
  await as(admin)
  await client.archiveDataset(dataset.id)
  await assert.rejects(rpc('save_followup',{...create,expectedUpdatedAt:legacy.updatedAt}),/DISCIPLINE_ARCHIVED/)
  assert.equal((await client.loadDataset(dataset.id)).auditEvents.length,8)
 }finally{await db.close()}
})

test('followup tokens validate types and require an existing matching row for timestamps',async()=>{
 const {db,client,rpc}=await database()
 try{
  const dataset=await client.saveVersion({name:'Token valid',filename:'sumber.xlsx',result:sample()})
  const input={datasetId:dataset.id,nik,patch:{pic:'Tim A'}}
  for(const expectedUpdatedAt of ['',1,true,{},[], 'infinity','tomorrow','2026-99-01T12:00:00Z','2026-10-16T12:00:00']){
   await assert.rejects(rpc('save_followup',{...input,expectedUpdatedAt}),/DISCIPLINE_INVALID_INPUT/)
  }
  await assert.rejects(rpc('save_followup',{...input,expectedUpdatedAt:'2026-10-16T12:00:00Z'}),/DISCIPLINE_FOLLOWUP_CONFLICT/)
  assert.equal((await client.loadDataset(dataset.id)).auditEvents.length,1)
  assert.deepEqual(await client.loadFollowups(dataset.id),[])
  const first=await rpc('save_followup',{...input,expectedUpdatedAt:null})
  const next=await rpc('save_followup',{...input,expectedUpdatedAt:first.updatedAt,patch:{status:'Selesai'}})
  assert.equal(next.status,'Selesai')
  assert.equal(next.pic,'Tim A')
  assert.equal((await client.loadDataset(dataset.id)).auditEvents.length,3)
 }finally{await db.close()}
})

test('atomic immutable result snapshots, rule versions, audit and archive remain isolated',async()=>{
 const {db,client}=await database()
 try{
  const first=await client.saveVersion({name:'Periode 2025',filename:'C:\\contoh\\sumber.xlsx',result:sample()})
  assert.equal(first.filename,'sumber.xlsx');assert.equal(first.version,1)
  assert.equal(first.schemaVersion,1);assert.equal(first.rowCount,1)
  const changed=sample();changed.rules.frequencyWeight=55
  const second=await client.saveVersion({name:'Parameter revisi',filename:'sumber.xlsx',parentId:first.id,result:changed})
  assert.equal(second.version,2);assert.equal(second.parentId,first.id)
  assert.equal((await client.loadDataset(first.id)).result.rules.frequencyWeight,60)
  assert.equal((await client.loadDataset(second.id)).result.rules.frequencyWeight,55)
  const listed=await client.listDatasets();assert.equal(listed.length,2);assert.ok(listed.every(r=>!('result' in r)))
  let saved=await client.saveFollowup({datasetId:first.id,nik,patch:{status:followupStatuses[1],pic:'Tim A',notes:'Pemeriksaan',documentReference:'Nota 1'}})
  assert.equal(saved.status,'Dalam pemeriksaan')
  saved=await client.saveFollowup({datasetId:first.id,nik,patch:{decisionNote:'Tindak lanjut selesai',status:'Selesai',datasetId:first.id,nik,updatedAt:saved.updatedAt,updatedBy:admin}})
  assert.equal(saved.pic,'Tim A');assert.equal(saved.notes,'Pemeriksaan')
  assert.equal((await client.loadFollowups(first.id)).length,1)
  assert.equal((await client.loadFollowups(second.id)).length,0)
  const history=await client.loadDataset(first.id)
  assert.equal(history.auditEvents.length,3)
  assert.equal(history.auditEvents.at(-1).before.status,'Dalam pemeriksaan')
  assert.equal(history.auditEvents.at(-1).after.status,'Selesai')
  await client.archiveDataset(first.id)
  assert.equal((await client.loadDataset(first.id)).status,'archived')
  await assert.rejects(client.saveFollowup({datasetId:first.id,nik,patch:{pic:'B'}}),e=>e.code==='DISCIPLINE_ARCHIVED')
  await assert.rejects(client.saveVersion({name:'Dilarang',filename:'source.xlsx',parentId:first.id,result:sample()}),e=>e.code==='DISCIPLINE_ARCHIVED')
  await assert.rejects(client.archiveDataset(first.id),e=>e.code==='DISCIPLINE_ARCHIVED')
  await assert.rejects(db.query("update public.discipline_datasets set result='{}'"),/permission denied/)
  await assert.rejects(db.query('delete from public.discipline_audit'),/permission denied/)
  await db.exec('reset role')
  assert.equal((await db.query('select value from public.recovery_sentinel')).rows[0].value,42)
 }finally{await db.close()}
})

test('viewer reads snapshots and followups; editor updates only followups; unprofiled/anonymous denied',async()=>{
 const {db,client,as}=await database()
 try{
  const dataset=await client.saveVersion({name:'Hak akses',filename:'simulasi.xlsx',result:sample()})
  await as(editor)
  await client.saveFollowup({datasetId:dataset.id,nik,patch:{pic:'Editor'}})
  for(const id of [editor,viewer]){
   await as(id)
   assert.equal((await client.listDatasets()).length,1)
   assert.equal((await client.loadDataset(dataset.id)).result.rows.length,1)
   assert.equal((await client.loadFollowups(dataset.id))[0].pic,'Editor')
   await assert.rejects(client.saveVersion({name:'Tidak berhak',filename:'x.xlsx',result:sample()}),e=>e.code==='DISCIPLINE_FORBIDDEN')
   await assert.rejects(client.archiveDataset(dataset.id),e=>e.code==='DISCIPLINE_FORBIDDEN')
   await assert.rejects(db.exec('insert into public.discipline_followups(dataset_id,nik,updated_by) values(null,null,null)'),/permission denied/)
  }
  await assert.rejects(client.saveFollowup({datasetId:dataset.id,nik,patch:{notes:'Tidak berhak'}}),e=>e.code==='DISCIPLINE_FORBIDDEN')
  for(const id of [outsider,'']){
   await as(id)
   await assert.rejects(client.listDatasets(),e=>e.code==='DISCIPLINE_FORBIDDEN')
  }
  await db.exec('reset role;set role anon')
  await assert.rejects(db.query("select public.discipline_rpc('list','{}')"),/permission denied/)
 }finally{await db.close()}
})

test('rejects malformed result or followup atomically and keeps audit unchanged',async()=>{
 const {db,client}=await database()
 try{
  const first=await client.saveVersion({name:'Valid',filename:'valid.xlsx',result:sample()})
  const invalid=[]
  let data=sample();data.rows.push({...data.rows[0]});invalid.push(data)
  data=sample();data.rows[0].nik=1234567890123456;invalid.push(data)
  data=sample();data.rows[0].before.nominal='NaN';invalid.push(data)
  data=sample();data.rows[0].before.nominal=null;invalid.push(data)
  data=sample();data.rows[0].before.frekuensi=0.5;invalid.push(data)
  data=sample();data.rows[0].before.nominal=-1;invalid.push(data)
  data=sample();data.transactions=[];invalid.push(data)
  data=sample();data.rows[0].before.transactions=[];invalid.push(data)
  data=sample();data.metadata.transactions=[{date:'2025-01-01',amount:1}];invalid.push(data)
  data=sample();data.rules.frequencyWeight=Number.MAX_VALUE;invalid.push(data)
  data=sample();data.rules=null;invalid.push(data)
  data=sample();data.source.transactions=[];invalid.push(data)
  for(const result of invalid)await assert.rejects(client.saveVersion({name:'Invalid',filename:'invalid.xlsx',result}),e=>e.code==='DISCIPLINE_INVALID_RESULT')
  assert.equal((await client.listDatasets()).length,1)
  for(const patch of [{status:'Diubah sembarang'},{pic:null},{notes:'x'.repeat(10001)},{rules:{}},{}])await assert.rejects(client.saveFollowup({datasetId:first.id,nik,patch}),e=>e.code==='DISCIPLINE_INVALID_INPUT')
  await assert.rejects(client.saveFollowup({datasetId:first.id,nik:'0000000000000002',patch:{notes:'Tidak ada'}}),e=>e.code==='DISCIPLINE_UNKNOWN_NIK')
  assert.deepEqual(await client.loadFollowups(first.id),[])
  assert.equal((await client.loadDataset(first.id)).auditEvents.length,1)
 }finally{await db.close()}
})

test('optional pairing-time provenance survives versions without rewriting earlier snapshots',async()=>{
 const {db,client}=await database()
 try{
  const original=sample()
  const first=await client.saveVersion({name:'Sebelum kebijakan jam',filename:'sumber.xlsx',result:original})
  // Reapplying the additive migration must retain snapshots with the old shape.
  await db.exec('reset role')
  await db.exec(fs.readFileSync('supabase/discipline-module.sql','utf8'))
  await db.exec('set role authenticated')
  assert.deepEqual((await client.loadDataset(first.id)).result,original)
  const revised=sample()
  revised.rules.missingTimePolicy='pairing'
  Object.assign(revised.rows[0].before,{frekuensi:4,dalam:2,luar:1,unknown:1,timeFromPairing:2,timeFromPairingInside:1,timeFromPairingOutside:1})
  Object.assign(revised.rows[0].after,{timeFromPairing:0,timeFromPairingInside:0,timeFromPairingOutside:0})
  revised.audits.push({type:'time-from-pairing',nik,message:'Jam - memakai asumsi dari pairing; jam asli tetap tidak diketahui.',row:2})
  const second=await client.saveVersion({name:'Asumsi waktu pairing',filename:'sumber.xlsx',result:revised,parentId:first.id})
  assert.equal(second.schemaVersion,1);assert.equal(second.version,2)
  assert.deepEqual((await client.loadDataset(second.id)).result,revised)
  assert.deepEqual((await client.loadDataset(first.id)).result,original)
  assert.equal((await client.loadDataset(first.id)).auditEvents.length,1)
  const strict=structuredClone(revised)
  strict.rules.missingTimePolicy='validate'
  Object.assign(strict.rows[0].before,{timeFromPairing:0,timeFromPairingInside:0,timeFromPairingOutside:0})
  const third=await client.saveVersion({name:'Validasi jam',filename:'sumber.xlsx',result:strict,parentId:second.id})
  assert.deepEqual((await client.loadDataset(third.id)).result,strict)
  assert.deepEqual((await client.loadDataset(second.id)).result,revised)
 }finally{await db.close()}
})

test('rejects incomplete or inconsistent pairing-time counts without committing a child or audit',async()=>{
 const {db,client}=await database()
 try{
  const result=sample()
  result.rules.missingTimePolicy='pairing'
  Object.assign(result.rows[0].before,{frekuensi:4,dalam:2,luar:1,unknown:1,timeFromPairing:2,timeFromPairingInside:1,timeFromPairingOutside:1})
  const first=await client.saveVersion({name:'Asumsi tervalidasi',filename:'sumber.xlsx',result})
  const cases=[]
  const add=(label,change)=>{const invalid=structuredClone(result);change(invalid);cases.push([label,invalid])}
  for(const key of ['timeFromPairing','timeFromPairingInside','timeFromPairingOutside']){
   add(`missing ${key}`,r=>{delete r.rows[0].before[key]})
   for(const value of [null,'1',-1,0.5])add(`invalid ${key}: ${value}`,r=>{r.rows[0].before[key]=value})
  }
  add('partial zero triplet',r=>{r.rows[0].after.timeFromPairing=0})
  add('sum does not match',r=>{r.rows[0].before.timeFromPairing=1})
  add('total exceeds frequency',r=>Object.assign(r.rows[0].before,{timeFromPairing:5,timeFromPairingInside:3,timeFromPairingOutside:2,dalam:3,luar:2,unknown:0}))
  add('inside exceeds effective inside',r=>Object.assign(r.rows[0].before,{timeFromPairingInside:2,timeFromPairingOutside:0,dalam:1}))
  add('outside exceeds effective outside',r=>Object.assign(r.rows[0].before,{timeFromPairingInside:0,timeFromPairingOutside:2}))
  add('assumptions overlap unresolved count',r=>{r.rows[0].before.unknown=3})
  for(const policy of [null,true,'guess'])add(`invalid missingTimePolicy: ${policy}`,r=>{r.rules.missingTimePolicy=policy})
  for(const [label,invalid] of cases)await assert.rejects(client.saveVersion({name:'Invalid',filename:'sumber.xlsx',parentId:first.id,result:invalid}),e=>e.code==='DISCIPLINE_INVALID_RESULT',label)
  assert.equal((await client.listDatasets()).length,1)
  const loaded=await client.loadDataset(first.id)
  assert.deepEqual(loaded.result,result)
  assert.equal(loaded.auditEvents.length,1)
  assert.equal(loaded.auditEvents[0].action,'import')
 }finally{await db.close()}
})

test('missing transaction details preserve historical evidence and null results across versions',async()=>{
 const {db,client}=await database()
 try{
  const original=sample()
  const first=await client.saveVersion({name:'Snapshot lama',filename:'sumber.xlsx',result:original})
  const complete=sample()
  Object.assign(complete.rows[0],{missingTransactionDetails:false,sourceTransactionCount:6})
  const second=await client.saveVersion({name:'Rincian tersedia',filename:'sumber.xlsx',result:complete,parentId:first.id})
  assert.deepEqual((await client.loadDataset(second.id)).result,complete)
  const missing=missingSample()
  const third=await client.saveVersion({name:'Rincian belum tersedia',filename:'sumber.xlsx',result:missing,parentId:second.id})
  let loaded=await client.loadDataset(third.id)
  assert.deepEqual(loaded.result,missing)
  assert.deepEqual(loaded.result.rows[0].historical,original.rows[0].historical)
  for(const key of missingNumericFields)assert.equal(loaded.result.rows[0].before[key],null,key)
  await db.exec('reset role')
  await db.exec(fs.readFileSync('supabase/discipline-module.sql','utf8'))
  await db.exec('set role authenticated')
  assert.deepEqual((await client.loadDataset(first.id)).result,original)
  assert.deepEqual((await client.loadDataset(second.id)).result,complete)
  assert.deepEqual((await client.loadDataset(third.id)).result,missing)
  for(const evidence of ['frekuensi','nominal']){
   const positive=missingSample()
   Object.assign(positive.rows[0].historical,{frekuensi:0,nominal:0,dalam:0,luar:0,[evidence]:1})
   const saved=await client.saveVersion({name:`Bukti historis ${evidence}`,filename:'sumber.xlsx',result:positive})
   assert.deepEqual((await client.loadDataset(saved.id)).result,positive)
  }
  const genuineZero=sample()
  Object.assign(genuineZero.rows[0],{missingTransactionDetails:false,sourceTransactionCount:0})
  Object.assign(genuineZero.rows[0].historical,{frekuensi:0,nominal:0,dalam:0,luar:0,total:0})
  for(const periodKey of ['before','after']){
   genuineZero.rows[0][periodKey]={...missingPeriod(),...Object.fromEntries(missingNumericFields.map(key=>[key,key==='total'||key.startsWith('score')?null:0])),kategori:'Tidak ada transaksi',status:'Tidak ada transaksi'}
  }
  const zero=await client.saveVersion({name:'Nihil tanpa bukti historis positif',filename:'sumber.xlsx',result:genuineZero})
  assert.deepEqual((await client.loadDataset(zero.id)).result,genuineZero)
  loaded=await client.loadDataset(third.id)
  assert.equal(loaded.auditEvents.length,1)
 }finally{await db.close()}
})

test('rejects false zeros, scores, incomplete flags, or absent historical evidence for missing details',async()=>{
 const {db,client}=await database()
 try{
  const result=missingSample()
  const first=await client.saveVersion({name:'Rincian kosong tervalidasi',filename:'sumber.xlsx',result})
  const cases=[]
  const add=(label,change)=>{const invalid=structuredClone(result);change(invalid.rows[0]);cases.push([label,invalid])}
  for(const periodKey of ['before','after']){
   for(const key of missingNumericFields){
    add(`false zero ${periodKey}.${key}`,r=>{r[periodKey][key]=0})
    add(`missing null ${periodKey}.${key}`,r=>{delete r[periodKey][key]})
   }
   for(const key of ['categoryFrequency','categoryDeposit','categoryTime'])add(`false component ${periodKey}.${key}`,r=>{r[periodKey][key]='Rendah'})
   for(const key of ['kategori','status'])add(`incorrect label ${periodKey}.${key}`,r=>{r[periodKey][key]='Tidak ada transaksi'})
   add(`only one missing period: ${periodKey}`,r=>{r[periodKey]={...period}})
   add(`optional false score ${periodKey}`,r=>{r[periodKey].weightTime=10})
   add(`raw transactions ${periodKey}`,r=>{r[periodKey].transactions=[]})
  }
  add('missing flag',r=>{delete r.missingTransactionDetails})
  add('missing count',r=>{delete r.sourceTransactionCount})
  for(const value of [null,'true',1,{}])add(`invalid flag ${JSON.stringify(value)}`,r=>{r.missingTransactionDetails=value})
  for(const value of [null,'0',-1,0.5,Number.MAX_VALUE])add(`invalid source count ${value}`,r=>{r.sourceTransactionCount=value})
  add('positive source count',r=>{r.sourceTransactionCount=1})
  add('historical null',r=>{r.historical=null})
  add('historical absent',r=>{delete r.historical})
  add('historical has no positive evidence',r=>Object.assign(r.historical,{frekuensi:0,nominal:0,dalam:0,luar:0}))
  add('historical evidence is text',r=>Object.assign(r.historical,{frekuensi:'3',nominal:0}))
  add('historical false null score',r=>{r.historical.frekuensi=null})
  add('flag false with missing details',r=>{r.missingTransactionDetails=false})
  add('new label without either new field',r=>{delete r.missingTransactionDetails;delete r.sourceTransactionCount})
  add('historical given computed missing label',r=>{r.historical.kategori='Rincian transaksi belum tersedia'})
  const falseZero=sample()
  Object.assign(falseZero.rows[0],{missingTransactionDetails:false,sourceTransactionCount:0})
  cases.push(['normal zero falsely claims complete despite positive history',falseZero])
  for(const [label,invalid] of cases)await assert.rejects(client.saveVersion({name:'Invalid',filename:'sumber.xlsx',parentId:first.id,result:invalid}),e=>e.code==='DISCIPLINE_INVALID_RESULT',label)
  assert.equal((await client.listDatasets()).length,1)
  const loaded=await client.loadDataset(first.id)
  assert.deepEqual(loaded.result,result)
  assert.equal(loaded.auditEvents.length,1)
 }finally{await db.close()}
})

test('historical reference categories retain null period numbers and preserve older gap snapshots',async()=>{
 const {db,client}=await database()
 try{
  const old=missingSample()
  const first=await client.saveVersion({name:'Versi lama rincian kosong',filename:'sumber.xlsx',result:old})
  const reference=referenceSample()
  const second=await client.saveVersion({name:'Acuan hasil asli',filename:'sumber.xlsx',parentId:first.id,result:reference})
  const loaded=await client.loadDataset(second.id)
  assert.deepEqual(loaded.result,reference)
  assert.deepEqual(loaded.result.rows[0].historical,old.rows[0].historical)
  for(const periodKey of ['before','after']){
   assert.equal(loaded.result.rows[0][periodKey].kategori,'Ringan')
   assert.equal(loaded.result.rows[0][periodKey].status,categoryReferenceStatus)
   for(const key of missingNumericFields)assert.equal(loaded.result.rows[0][periodKey][key],null)
  }
  await db.exec('reset role')
  await db.exec(fs.readFileSync('supabase/discipline-module.sql','utf8'))
  await db.exec('set role authenticated')
  assert.deepEqual((await client.loadDataset(first.id)).result,old)
  assert.deepEqual((await client.loadDataset(second.id)).result,reference)
  for(const category of ['Sedang','Berat']){
   const changed=referenceSample()
   changed.rows[0].historical.kategori=category
   for(const periodKey of ['before','after'])changed.rows[0][periodKey].kategori=category
   const saved=await client.saveVersion({name:`Acuan ${category}`,filename:'sumber.xlsx',result:changed})
   assert.deepEqual((await client.loadDataset(saved.id)).result,changed)
  }
  for(const changeHistory of [h=>{h.status='Perlu validasi'},h=>{h.kategori='Kategori belum valid'}]){
   const fallback=missingSample()
   fallback.rows[0].categoryFromPairing=false
   changeHistory(fallback.rows[0].historical)
   const saved=await client.saveVersion({name:'Hasil asli perlu validasi',filename:'sumber.xlsx',result:fallback})
   assert.deepEqual((await client.loadDataset(saved.id)).result,fallback)
  }
  const complete=sample()
  Object.assign(complete.rows[0],{missingTransactionDetails:false,sourceTransactionCount:6,categoryFromPairing:false})
  const savedComplete=await client.saveVersion({name:'Hasil periode dihitung',filename:'sumber.xlsx',result:complete})
  assert.deepEqual((await client.loadDataset(savedComplete.id)).result,complete)
 }finally{await db.close()}
})

test('rejects unmarked, inconsistent, or scored reference categories atomically',async()=>{
 const {db,client}=await database()
 try{
  const result=referenceSample()
  const first=await client.saveVersion({name:'Acuan tervalidasi',filename:'sumber.xlsx',result})
  const cases=[]
  const add=(label,change)=>{const invalid=structuredClone(result);change(invalid.rows[0]);cases.push([label,invalid])}
  for(const value of [null,'true',1,{}])add(`invalid category reference flag ${JSON.stringify(value)}`,r=>{r.categoryFromPairing=value})
  add('reference flag absent',r=>{delete r.categoryFromPairing})
  add('false reference flag despite eligible history',r=>{r.categoryFromPairing=false})
  add('reference without missing flag',r=>{delete r.missingTransactionDetails;delete r.sourceTransactionCount})
  add('reference when details exist',r=>Object.assign(r,{missingTransactionDetails:false,sourceTransactionCount:1}))
  add('reference with invalid historic status',r=>{r.historical.status='Perlu validasi'})
  add('reference with invalid historic category',r=>{r.historical.kategori='Perlu validasi'})
  add('reference with null historic category',r=>{r.historical.kategori=null})
  add('reference with no historical evidence',r=>Object.assign(r.historical,{frekuensi:0,nominal:0,dalam:0,luar:0}))
  add('category changed only in history',r=>{r.historical.kategori='Sedang'})
  for(const periodKey of ['before','after']){
   add(`mismatched ${periodKey} category`,r=>{r[periodKey].kategori='Sedang'})
   add(`unmarked ${periodKey} reference`,r=>{r[periodKey].status='Simulasi berdasarkan parameter'})
   add(`one missing period ${periodKey}`,r=>{r[periodKey]=missingPeriod()})
   add(`one calculated period ${periodKey}`,r=>{r[periodKey]={...period}})
   for(const key of missingNumericFields)add(`false reference number ${periodKey}.${key}`,r=>{r[periodKey][key]=0})
  }
  const unmarked=missingSample()
  unmarked.rows[0].categoryFromPairing=false
  cases.push(['false reference flag despite valid category even with missing labels',unmarked])
  for(const flag of [undefined,false,true]){
   const normal=sample()
   Object.assign(normal.rows[0],{missingTransactionDetails:false,sourceTransactionCount:6})
   if(flag!==undefined)normal.rows[0].categoryFromPairing=flag
   normal.rows[0].before.status=categoryReferenceStatus
   cases.push([`normal result with reference status, flag ${flag}`,normal])
  }
  for(const [label,invalid] of cases)await assert.rejects(client.saveVersion({name:'Invalid',filename:'sumber.xlsx',parentId:first.id,result:invalid}),e=>e.code==='DISCIPLINE_INVALID_RESULT',label)
  assert.equal((await client.listDatasets()).length,1)
  const loaded=await client.loadDataset(first.id)
  assert.deepEqual(loaded.result,result)
  assert.equal(loaded.auditEvents.length,1)
 }finally{await db.close()}
})

test('real workbook calculated result survives isolated database round trip',{skip:!process.env.DISCIPLINE_WORKBOOK_PATH},async()=>{
 const source=parseDisciplineWorkbook(fs.readFileSync(process.env.DISCIPLINE_WORKBOOK_PATH))
 const result=analyzeDiscipline(source)
 const {db,client}=await database()
 try{
  const saved=await client.saveVersion({name:'Validasi workbook',filename:'sumber.xlsx',result})
  const loaded=await client.loadDataset(saved.id)
  assert.equal(loaded.rowCount,result.rows.length)
  assert.deepEqual(loaded.result,result)
 }finally{await db.close()}
})

test('missing migration and transport failures have actionable errors without source disclosure',async()=>{
 assert.equal(disciplineStorage(null),null)
 let api=disciplineStorage({rpc:async()=>({error:{code:'PGRST202',message:'Could not find function'}})})
 await assert.rejects(api.listDatasets(),e=>e.code==='DISCIPLINE_NOT_READY'&&e.message.includes('migrasi'))
 api=disciplineStorage({rpc:async()=>{throw Error('private source token')}})
 await assert.rejects(api.listDatasets(),e=>e.code==='DISCIPLINE_STORAGE_ERROR'&&!e.message.includes('private'))
})
