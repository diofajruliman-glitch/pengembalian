import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {followupClient,followupIndex,linkedFollowupProgress,loadFollowups,prepareFollowup,saveFollowup} from '../src/recovery/followups.js'
const admin='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',editor='00000000-0000-0000-0000-000000000003'
const nip='000000000000000001',zero='000000000000000002',url='https://tagokvlsirebfgltbxmq.supabase.co'
const at='2026-01-01T00:00:00+00:00',target={no:1,updated_at:at}
const snapshot={source:'database',scope:'production',revision:1,results:[{people:[{nip,nama:'Simulasi',bank:'BRI'}],obligations:[{nip,bank:'BRI',year:2025,kind:'TUKIN',amount:100},{nip,bank:'BRI',year:2026,kind:'UM',amount:200}],payments:[{nip,bank:'BRI',year:2025,kind:'TUKIN',stage:1,amount:10,verification:'pending'}]}]}
const reqId=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`

test('followup summaries deduplicate people, follow current ledger and flag unavailable references',()=>{
 assert.equal(followupClient({},undefined,url),null)
 assert.equal(followupClient({},'production-followup','https://other.supabase.co'),null)
 assert.throws(()=>followupClient({},'production-followup',url).rpc('update_master',{}),/tidak diizinkan/)
 const index=followupIndex(snapshot),links=[{nip,available:true},{nip,available:true},{nip:zero,available:false}]
 const all=linkedFollowupProgress(index,links)
 assert.equal(all.totals.people,1);assert.equal(all.totals.obligation,300);assert.equal(all.held.length,1)
 const annual=linkedFollowupProgress(index,links,{year:2025})
 assert.equal(annual.totals.remaining,90);assert.equal(annual.totals.verified,0)
 const next=structuredClone(snapshot);next.results[0].payments.push({nip,bank:'BRI',kind:'UM',year:2026,stage:2,amount:20})
 assert.equal(linkedFollowupProgress(followupIndex(next),links).totals.remaining,270)
 assert.equal(all.totals.remaining,290)
})

test('followup reader refuses mixed or incomplete reference snapshots',async()=>{
 const meta={masterRevision:1,revision:1,targetUpdatedAt:at,count:1}
 const good={rpc:async(action)=>({data:action==='meta'?meta:{masterRevision:1,revision:1,rows:[{nip,available:true}]}})}
 assert.equal((await loadFollowups(good,'action',target,snapshot)).rows.length,1)
 await assert.rejects(loadFollowups({rpc:async(action)=>({data:action==='meta'?meta:{masterRevision:1,revision:2,rows:[]}})},'action',target,snapshot),/berubah/)
 await assert.rejects(loadFollowups({rpc:async(action)=>({data:action==='meta'?meta:{masterRevision:1,revision:1,rows:[]}})},'action',target,snapshot),/tidak lengkap/)
})

test('SQL followup API preserves plans and money; add, retry, removal, stale data and access checks are atomic',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,role text);
   insert into auth.users values('${admin}','admin'),('${other}','admin'),('${editor}','editor');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function public.current_app_role() returns text language sql stable security definer as $$select role from auth.users where id=auth.uid()$$;
   create schema recovery_live;revoke all on schema recovery_live from public,anon,authenticated;
   create table recovery_live.recovery_revision(id integer primary key,revision bigint);insert into recovery_live.recovery_revision values(1,1);
   create table recovery_live.recovery_people(nip text primary key,nama text,bank text,archived_at timestamptz);
   insert into recovery_live.recovery_people values('${nip}','Simulasi','BRI',null),('${zero}','Zero','BRI',null);
   create table recovery_live.recovery_obligations(nip text,nominal bigint);insert into recovery_live.recovery_obligations values('${nip}',300),('${zero}',0);
   create table recovery_live.money_sentinel(payment bigint);insert into recovery_live.money_sentinel values(10);
   create table public.action_plans(no integer primary key,kegiatan text,pic text,status text,progres int,updated_at timestamptz,deleted_at timestamptz);
   create table public.bottlenecks(no integer primary key,kategori text,pic text,status text,updated_at timestamptz,deleted_at timestamptz);
   insert into public.action_plans values(1,'Tindak lanjut','PIC tetap','Selesai',100,'${at}',null);
   insert into public.bottlenecks values(1,'Uji','PIC hambatan','Proses','${at}',null);`)
  await db.exec(fs.readFileSync('supabase/recovery-followup-activation.sql','utf8'))
  const before=(await db.query('select to_jsonb(a) value from public.action_plans a')).rows[0].value
  const raw=async(action,payload)=>db.query('select public.recovery_followup_rpc($1,$2) result',[action,JSON.stringify(payload)])
  const adapter=followupClient({rpc:async(name,args)=>{assert.equal(name,'recovery_followup_rpc');try{return {data:(await raw(args.p_action,args.p_payload)).rows[0].result}}catch(error){return {error}}}},'production-followup',url)
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false)`)
  const prepare=async(type='action',nips=[nip],operation='add',id=1)=>{const loaded=await loadFollowups(adapter,type,target,snapshot);return prepareFollowup({snapshot,type,target,meta:loaded.meta,nips,operation,requestId:reqId(id)})}
  const payload=await prepare()
  assert.equal((await saveFollowup(adapter,payload,'Hubungkan untuk penagihan')).changed,1)
  assert.equal((await saveFollowup(adapter,payload,'Hubungkan untuk penagihan')).alreadySaved,true)
  await assert.rejects(saveFollowup(adapter,payload,'Alasan diganti'),/REQUEST_CONFLICT/)
  await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`)
  await assert.rejects(saveFollowup(adapter,payload,'Hubungkan untuk penagihan'),/REQUEST_CONFLICT/)
  await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`)
  assert.equal((await loadFollowups(adapter,'action',target,snapshot)).rows.length,1)
  const noChange=await prepare('action',[nip],'add',2)
  assert.equal((await saveFollowup(adapter,noChange,'Sudah terhubung')).changed,0)
  assert.equal((await saveFollowup(adapter,await prepare('bottleneck',[nip],'add',3),'Hubungkan hambatan')).changed,1)
  const heldPayload=await prepare('action',[nip],'remove',4)
  await db.exec('reset role;update recovery_live.recovery_revision set revision=2;set role authenticated')
  await assert.rejects(saveFollowup(adapter,heldPayload,'Master sudah berubah'),/STALE_FOLLOWUP/)
  await db.exec('reset role;update recovery_live.recovery_revision set revision=1;set role authenticated')
  const invalid=await prepare('action',[nip,zero],'add',5)
  await assert.rejects(saveFollowup(adapter,invalid,'Tidak boleh parsial'),/NO_POSITIVE_OBLIGATION/)
  const remove=await prepare('action',[nip],'remove',6)
  assert.equal((await saveFollowup(adapter,remove,'Tindak lanjut dipindahkan')).changed,1)
  assert.equal((await loadFollowups(adapter,'action',target,snapshot)).rows.length,0)
  assert.equal((await saveFollowup(adapter,await prepare('action',[nip],'add',7),'Hubungkan kembali')).changed,1)
  const staleTarget=await prepare('action',[nip],'remove',8)
  await db.exec(`reset role;update public.action_plans set updated_at='2026-02-01';set role authenticated`)
  await assert.rejects(saveFollowup(adapter,staleTarget,'Kegiatan sudah berubah'),/STALE_FOLLOWUP/)
  await db.exec(`reset role;update public.action_plans set updated_at='${at}';set role authenticated`)
  const archived=await prepare('action',[nip],'remove',9)
  await db.exec('reset role;update public.action_plans set deleted_at=now();set role authenticated')
  await assert.rejects(saveFollowup(adapter,archived,'Kegiatan diarsipkan'),/TARGET_UNAVAILABLE/)
  await db.exec(`reset role;update public.action_plans set deleted_at=null;set role authenticated;select set_config('request.jwt.claim.sub','${editor}',false)`)
  await assert.rejects(raw('meta',{type:'action',target:1}),/FORBIDDEN/)
  await assert.rejects(db.query('select * from recovery_live.followup_links'),/permission denied/)
  await db.exec('reset role')
  assert.deepEqual((await db.query('select to_jsonb(a) value from public.action_plans a')).rows[0].value,before)
  assert.equal((await db.query('select payment from recovery_live.money_sentinel')).rows[0].payment,10)
  assert.equal((await db.query('select sum(nominal)::int n from recovery_live.recovery_obligations')).rows[0].n,300)
  assert.equal((await db.query('select revision from recovery_live.recovery_revision')).rows[0].revision,1)
  assert.equal((await db.query('select count(*)::int n from recovery_live.followup_changes')).rows[0].n,4)
  assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='recovery_live' and c.relname like 'followup_%' and c.relkind='r' and c.relrowsecurity")).rows[0].n,4)
  assert.equal((await db.query("select has_function_privilege('anon','public.recovery_followup_rpc(text,jsonb)','execute') yes")).rows[0].yes,false)
 }finally{await db.close()}
})
