import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {reviewStoredNonactive,statusClient,prepareStatus,commitStatus} from '../src/recovery/nonactiveStatus.js'
import {indexSnapshot,selectProgress,exportRows} from '../src/recovery/progress.js'
const admin='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',editor='00000000-0000-0000-0000-000000000003'
const nip='000000000000000001',second='000000000000000002',url='https://tagokvlsirebfgltbxmq.supabase.co'
const record={nip,nama:'Nama Master',bank:'BRI',category:'BUP',endDateRaw:45000,reasonRaw:'Sumber'}
const snapshot={source:'database',scope:'production',revision:1,results:[{people:[{nip,nama:'Nama Master',bank:'BRI'}],obligations:[],payments:[]}]}
const source={fileName:'Simulasi.xlsx',sha256:'a'.repeat(64),nonactive:{issues:[]},nonactiveReview:[{...record,matchStatus:'Cocok'}, {...record,nip:second,nama:'Belum ada'}]}

test('status reconciliation uses persisted identities and retains held rows without changing snapshot',()=>{
 const changed={...source,nonactiveReview:[{...record,nama:'Nama berbeda',matchStatus:'Cocok'},source.nonactiveReview[1]]}
 const reviewed=reviewStoredNonactive(snapshot,changed)
 assert.equal(reviewed.review[0].matchStatus,'Nama berbeda');assert.equal(reviewed.review[1].matchStatus,'Belum cocok')
 assert.equal(snapshot.results[0].people[0].nonactive,undefined)
 assert.throws(()=>reviewStoredNonactive({...snapshot,source:'excel'},source),/tersimpan/)
 assert.equal(statusClient({},undefined,url),null);assert.equal(statusClient({},'production-sdm','https://other.supabase.co'),null)
 assert.throws(()=>statusClient({},'production-sdm',url).rpc('delete',{}),/tidak diizinkan/)
 const storedResults=[{people:[{nip,nama:'Nama Master',bank:'BRI',status_sdm:'BUP'}],obligations:[{nip,bank:'BRI',kind:'UM',year:2026,amount:100}],payments:[]}]
 const selected=selectProgress(indexSnapshot(storedResults),{status:'BUP'})
 assert.equal(selected.totals.obligation,100)
 const exported=exportRows(selected)
 assert.equal(exported.summary[0].at(-1),'Status SDM (sumber)');assert.equal(exported.summary[1].at(-1),'BUP')
})

test('status API validates identities, commits atomically, audits once, preserves money and denies unauthorized access',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,role text);
   insert into auth.users values('${admin}','admin'),('${other}','admin'),('${editor}','editor');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function public.current_app_role() returns text language sql stable security definer as $$select role from auth.users where id=auth.uid()$$;
   create schema recovery_live;revoke all on schema recovery_live from public,anon,authenticated;
   create table recovery_live.recovery_revision(id integer primary key,revision bigint);insert into recovery_live.recovery_revision values(1,1);
   create table recovery_live.recovery_people(nip text primary key,nama text,bank text,status_sdm text,archived_at timestamptz);
   insert into recovery_live.recovery_people values('${nip}','Nama Master','BRI',null,null),('${second}','Kedua','BSI','SP3',null);
   create table recovery_live.money_sentinel(obligation bigint,payment bigint);insert into recovery_live.money_sentinel values(300,30);`)
  await db.exec(fs.readFileSync('supabase/recovery-sdm-status-activation.sql','utf8'))
  const raw=async(action,payload)=>db.query('select public.recovery_sdm_rpc($1,$2) result',[action,JSON.stringify(payload)])
  const adapter=statusClient({rpc:async(name,args)=>{assert.equal(name,'recovery_sdm_rpc');try{return {data:(await raw(args.p_action,args.p_payload)).rows[0].result}}catch(error){return {error}}}},'production-sdm',url)
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false)`)
  const reviewed=reviewStoredNonactive(snapshot,source)
  const batch=await prepareStatus(adapter,snapshot,source,reviewed.review)
  assert.equal(batch.count,1);assert.equal(batch.review[0].before,null)
  assert.equal((await prepareStatus(adapter,snapshot,source,reviewed.review)).id,batch.id)
  await assert.rejects(commitStatus(adapter,batch.id,''),/alasan/)
  await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`)
  await assert.rejects(commitStatus(adapter,batch.id,'Uji actor lain'),/BATCH_NOT_FOUND/)
  await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`)
  assert.equal((await commitStatus(adapter,batch.id,'Rekonsiliasi status dari sumber')).saved,1)
  assert.equal((await commitStatus(adapter,batch.id,'Ulang setelah respons hilang')).alreadyCommitted,true)
  assert.equal((await prepareStatus(adapter,snapshot,source,reviewed.review)).committed,true)
  await db.exec('reset role')
  assert.equal((await db.query('select status_sdm from recovery_live.recovery_people where nip=$1',[nip])).rows[0].status_sdm,'BUP')
  assert.equal((await db.query('select revision from recovery_live.recovery_revision')).rows[0].revision,2)
  assert.equal((await db.query('select count(*)::int n from recovery_live.sdm_status_changes')).rows[0].n,1)
  const audit=(await db.query('select * from recovery_live.sdm_status_changes')).rows[0]
  assert.equal(audit.before_status,null);assert.equal(audit.source_record.endDateRaw,45000)
  assert.deepEqual((await db.query('select * from recovery_live.money_sentinel')).rows,[{obligation:300,payment:30}])
  assert.equal((await db.query("select count(*)::int n from pg_class where oid in ('recovery_live.sdm_status_changes'::regclass,'recovery_live.sdm_status_batches'::regclass) and relrowsecurity")).rows[0].n,2)
  assert.equal((await db.query("select has_function_privilege('anon','public.recovery_sdm_rpc(text,jsonb)','execute') yes")).rows[0].yes,false)
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${editor}',false)`)
  await assert.rejects(raw('prepare',{}),/FORBIDDEN/)
  await assert.rejects(db.query('select * from recovery_live.sdm_status_changes'),/permission denied/)
  await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`)
  const request={revision:2,sourceName:'Second.xlsx',sourceHash:'b'.repeat(64),records:[{...record,category:'SP3'}]}
  await assert.rejects(raw('prepare',{...request,records:[{...record,nama:'Beda'}]}),/IDENTITY_REVIEW_REQUIRED/)
  await assert.rejects(raw('prepare',{...request,records:[record,record]}),/DUPLICATE_NIP/)
  await assert.rejects(raw('prepare',{...request,records:[{...record,nip:'000000000000000099'}]}),/UNMATCHED_NIP/)
  await assert.rejects(raw('prepare',{...request,records:[{...record,category:'Aktif'}]}),/INVALID_STATUS/)
  const stale=(await raw('prepare',request)).rows[0].result
  await db.exec('reset role;update recovery_live.recovery_revision set revision=3')
  await db.exec('set role authenticated')
  await assert.rejects(commitStatus(adapter,stale.id,'Master sudah berubah'),/STALE_MASTER/)
  const renewed=(await raw('prepare',{...request,revision:3})).rows[0].result
  assert.notEqual(renewed.id,stale.id)
  await assert.rejects(commitStatus(adapter,stale.id,'Batch lama sesudah tinjauan baru'),/STALE_MASTER/)
  await db.exec('reset role')
  assert.equal((await db.query('select count(*)::int n from recovery_live.sdm_status_changes')).rows[0].n,1)
  await db.exec('set role authenticated')
  const atomic=(await raw('prepare',{...request,sourceHash:'c'.repeat(64),revision:3,records:[record,{...record,nip:second,nama:'Kedua',bank:'BSI'}]})).rows[0].result
  await db.exec(`reset role;update recovery_live.recovery_people set archived_at=now() where nip='${second}';set role authenticated`)
  await assert.rejects(commitStatus(adapter,atomic.id,'Uji rollback sebagian'),/IDENTITY_REVIEW_REQUIRED/)
  await db.exec('reset role')
  assert.equal((await db.query('select count(*)::int n from recovery_live.sdm_status_changes')).rows[0].n,1)
  assert.equal((await db.query('select revision from recovery_live.recovery_revision')).rows[0].revision,3)
 }finally{await db.close()}
})
