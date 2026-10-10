import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {productionMasterClient} from '../src/import/productionClient.js'
import {stageBatch,commitBatch,loadStoredSnapshot} from '../src/import/batchTransport.js'
import {prepareReferences,commitReferences} from '../src/recovery/caseApi.js'
import {loadLinkedCaseRows} from '../src/recovery/linkedCases.js'
import {indexSnapshot,selectProgress} from '../src/recovery/progress.js'
const admin='00000000-0000-0000-0000-000000000001',editor='00000000-0000-0000-0000-000000000002'
const nip='000000000000000901',url='https://tagokvlsirebfgltbxmq.supabase.co'
const sql=fs.readFileSync('supabase/recovery-production-activation.sql','utf8')
const setup=`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,role text);
insert into auth.users values('${admin}','admin'),('${editor}','editor');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function public.current_app_role() returns text language sql stable security definer as $$select role from auth.users where id=auth.uid()$$;
create table public.sdm_cases(id bigint primary key,nip text,nama text,bank text,status text,pic text,deadline date,catatan text,bukti text,kewajiban_total numeric,realisasi_total numeric,updated_at timestamptz not null,deleted_at timestamptz);
insert into public.sdm_cases values(1,'${nip}','Uji produksi lokal','BRI','Proses Penagihan','PIC tetap','2026-12-15','Catatan tetap','Bukti manual',999,0,'2026-01-01T00:00:00Z',null);
create schema recovery_test;create table recovery_test.sentinel(value integer);insert into recovery_test.sentinel values(42);`
const sample=()=>[{issues:[],people:[{nip,bank:'BRI',nama:'Uji produksi lokal',provinsi:'Uji'}],obligations:[{nip,bank:'BRI',kind:'TUKIN',year:2025,amount:100},{nip,bank:'BRI',kind:'UM',year:2026,amount:200},{nip,bank:'BRI',kind:'UM',year:2025,amount:0}],payments:[{nip,bank:'BRI',kind:'TUKIN',year:2025,stage:1,amount:20},{nip,bank:'BRI',kind:'UM',year:2026,stage:1,amount:30}]}]
test('production adapter is explicit, project-bound and rejects unrelated operations',()=>{
 assert.equal(productionMasterClient({},undefined,url),null)
 assert.equal(productionMasterClient({},'isolated-test',url),null)
 assert.equal(productionMasterClient({},'production-master','https://other.supabase.co'),null)
 const c=productionMasterClient({},'production-master',url)
 assert.equal(c.scope,'production');assert.throws(()=>c.rpc('update_cases'),/tidak diizinkan/)
})
test('production package preserves existing tables and supports atomic import, retained references, corrections and access guards',async()=>{
 const db=new PGlite()
 try{
  await db.exec(setup);await db.exec(sql)
  await assert.rejects(db.exec(sql),/PRODUCTION_ALREADY_INITIALIZED/);await db.exec('rollback')
  const image=(await db.query('select to_jsonb(c) value from public.sdm_cases c')).rows[0].value
  assert.equal((await db.query('select value from recovery_test.sentinel')).rows[0].value,42)
  assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='recovery_live' and c.relkind='r' and c.relrowsecurity")).rows[0].n,13)
  assert.equal((await db.query("select has_function_privilege('anon','public.recovery_master_rpc(text,jsonb)','execute') yes")).rows[0].yes,false)
  assert.ok((await db.query("select proconfig from pg_proc where oid='public.recovery_master_rpc(text,jsonb)'::regprocedure")).rows[0].proconfig.includes('statement_timeout=60s'))
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false)`)
  const api=productionMasterClient({rpc:async(name,args)=>{try{assert.equal(name,'recovery_master_rpc');const q=await db.query('select public.recovery_master_rpc($1,$2) result',[args.p_action,JSON.stringify(args.p_payload)]);return {data:q.rows[0].result}}catch(error){return {error}}}},'production-master',url)
  const stage=(results,hash,recap)=>stageBatch(api,{fileName:'UJI LOKAL.xlsx',sha256:hash.repeat(64),results,recap})
  const first=await stage(sample(),'1',{BRI:{obligation:300,payment:50}})
  assert.equal(first.summary.initialImport,true);assert.equal(first.summary.people,1);assert.equal(first.summary.obligations,3);assert.equal(first.summary.payments,2)
  await assert.rejects(commitBatch(api,first.id,''),/Alasan/)
  await commitBatch(api,first.id,'Impor awal lokal');await commitBatch(api,first.id,'Retry aman')
  const stored=await loadStoredSnapshot(api)
  assert.equal(stored.scope,'production');assert.equal(stored.fileName,'Master produksi tersimpan')
  assert.equal(selectProgress(indexSnapshot(stored.results),{year:2025,kind:'UM'}).totals.people,0)
  assert.equal(selectProgress(indexSnapshot(stored.results)).totals.remaining,250)
  await assert.rejects(stage(sample(),'1',{BRI:{obligation:300,payment:50}}),/FILE_ALREADY_COMMITTED/)
  const row={manual:{id:1,updated_at:'2026-01-01T00:00:00Z'},master:{nip},issues:[]}
  const batch=await prepareReferences(api,stored,[row]);await commitReferences(api,batch,'Tinjauan lokal');await commitReferences(api,batch,'Retry lokal')
  assert.equal((await loadLinkedCaseRows(api)).rows[0].finance.payment,50)
  const correction=sample();correction[0].payments[0].amount=10
  const next=await stage(correction,'2',{BRI:{obligation:300,payment:40}})
  assert.equal(next.summary.initialImport,false);await commitBatch(api,next.id,'Koreksi lokal')
  assert.equal((await loadLinkedCaseRows(api)).rows[0].finance.remaining,260)
  const missing=sample();missing[0].payments=[]
  await assert.rejects(stage(missing,'3',{BRI:{obligation:300,payment:0}}),/MISSING_HISTORY/)
  const renamed=sample();renamed[0].people[0].nama='Nama berubah'
  await assert.rejects(stage(renamed,'4',{BRI:{obligation:300,payment:50}}),/PERSON_CHANGE/)
  await assert.rejects(db.query('select * from recovery_live.recovery_people'),/permission denied/)
  await db.exec(`select set_config('request.jwt.claim.sub','${editor}',false)`)
  await assert.rejects(loadStoredSnapshot(api),/FORBIDDEN/);await assert.rejects(loadLinkedCaseRows(api),/FORBIDDEN/)
  await db.exec('reset role')
  assert.deepEqual((await db.query('select to_jsonb(c) value from public.sdm_cases c')).rows[0].value,image)
  assert.equal((await db.query('select count(*)::int n from recovery_live.case_link_audit')).rows[0].n,1)
 }finally{await db.close()}
})
test('lost begin, append and commit responses retry the same batch without duplicate ledger or audit rows',async()=>{
 const db=new PGlite(),lost=new Set(),ids=[]
 try{
  await db.exec(setup);await db.exec(sql)
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false)`)
  const client=productionMasterClient({rpc:async(name,args)=>{
   try{
    const q=await db.query('select public.recovery_master_rpc($1,$2) result',[args.p_action,JSON.stringify(args.p_payload)])
    if(args.p_action==='recovery_begin')ids.push(q.rows[0].result)
    if(['recovery_begin','recovery_append','recovery_commit'].includes(args.p_action)&&!lost.has(args.p_action)){
     lost.add(args.p_action);return {error:Error('Failed to fetch')}
    }
    return {data:q.rows[0].result}
   }catch(error){return {error}}
  }},'production-master',url)
  const b=await stageBatch(client,{fileName:'RETRY LOKAL.xlsx',sha256:'5'.repeat(64),results:sample(),recap:{BRI:{obligation:300,payment:50}}})
  assert.equal(new Set(ids).size,1);await commitBatch(client,b.id,'Uji respons jaringan hilang')
  await db.exec('reset role')
  assert.equal((await db.query('select count(*)::int n from recovery_live.recovery_imports')).rows[0].n,1)
  assert.equal((await db.query('select count(*)::int n from recovery_live.recovery_payments')).rows[0].n,2)
  assert.equal((await db.query('select count(*)::int n from recovery_live.recovery_changes')).rows[0].n,5)
  assert.equal((await db.query('select revision from recovery_live.recovery_revision')).rows[0].revision,1)
 }finally{await db.close()}
})
test('partially staged imports resume their original batch and reject a changed manifest',async()=>{
 const db=new PGlite(),hash='6'.repeat(64)
 try{
  await db.exec(setup);await db.exec(sql)
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false)`)
  const call=async(action,payload)=>{const q=await db.query('select public.recovery_master_rpc($1,$2) result',[action,JSON.stringify(payload)]);return q.rows[0].result}
  const id=await call('recovery_begin',{p_name:'RESUME LOKAL.xlsx',p_hash:hash,p_rows:6,p_totals:{BRI:{obligation:300,payment:50}}})
  await call('recovery_append',{p_batch:id,p_records:[{type:'person',data:sample()[0].people[0]}]})
  await assert.rejects(call('recovery_begin',{p_name:'RESUME LOKAL.xlsx',p_hash:hash,p_rows:7,p_totals:{BRI:{obligation:300,payment:50}}}),/MANIFEST_REQUIRES_REVIEW/)
  const client=productionMasterClient({rpc:async(name,args)=>{try{return {data:await call(args.p_action,args.p_payload)}}catch(error){return {error}}}},'production-master',url)
  const resumed=await stageBatch(client,{fileName:'RESUME LOKAL.xlsx',sha256:hash,results:sample(),recap:{BRI:{obligation:300,payment:50}}})
  assert.equal(resumed.id,id)
  const validated=await stageBatch(client,{fileName:'RESUME LOKAL.xlsx',sha256:hash,results:sample(),recap:{BRI:{obligation:300,payment:50}}})
  assert.equal(validated.id,id)
  await db.exec('reset role')
  assert.equal((await db.query('select count(*)::int n from recovery_live.recovery_imports')).rows[0].n,1)
  assert.equal((await db.query('select count(*)::int n from recovery_live.recovery_staging')).rows[0].n,6)
 }finally{await db.close()}
})
