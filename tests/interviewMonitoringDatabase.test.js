import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

const uid=n=>`00000000-0000-4000-8000-00000000000${n}`
const nik='1111111111111111', otherNik='2222222222222222'
const answers=Object.fromEntries(Array.from({length:22},(_,i)=>[i+1,`Keterangan simulasi ${i+1}`]))
const identity={pangkat:'Golongan IX',jabatan:'Penata Layanan Operasional',unitKerja:'PSNK',nomorSurat:'123',tanggalSurat:'2026-10-23',kota:'Jakarta',pewawancaraNama:'Petugas Simulasi',pewawancaraNip:'198801012010011001'}

async function harness(){
 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
  create table profiles(id uuid primary key,nama text,role text);
  create function public.current_app_role() returns text language sql stable security definer set search_path=public as $$select role from profiles where id=auth.uid()$$;
  create table discipline_datasets(id uuid primary key);
  create table interviewer_assignments(user_id uuid primary key,room_id text unique);`)
 for(const [n,role] of [[1,'interviewer'],[2,'interviewer'],[3,'admin'],[4,'viewer'],[5,'editor'],[6,'other']]){
  await db.query('insert into auth.users values($1)',[uid(n)])
  await db.query('insert into profiles values($1,$2,$3)',[uid(n),'Petugas simulasi',role])
 }
 await db.exec(`insert into interviewer_assignments values('${uid(1)}','room-1'),('${uid(2)}','room-2');grant select on interviewer_assignments to authenticated;`)
 for(const file of ['interview-portal.sql','interview-revisions.sql','interview-signatories.sql','interview-monitoring-activation.sql']){
  await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'))
 }
 await db.exec(`insert into interview_cases(nik,person,room_id,scheduled_date,scheduled_time) values
  ('${nik}','{"nama":"Peserta simulasi satu","nip":"123456789012345678"}','room-1','2026-10-26','08:30'),
  ('${otherNik}','{"nama":"Peserta simulasi dua","nip":"223456789012345678"}','room-2','2026-10-26','08:30');`)
 const actor=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${n?uid(n):''}',false);set role authenticated`)
 const activity=async(action,revision=null,payload={},caseNik=nik)=>(await db.query('select * from interview_activity_action($1,$2,$3,$4)',[caseNik,action,revision,payload])).rows[0]
 const act=async(action,revision,payload={})=>(await db.query('select * from interview_action($1,$2,$3,$4)',[nik,action,revision,payload])).rows[0]
 const caseRow=async()=>(await db.query('select * from interview_cases where nik=$1',[nik])).rows[0]
 return {db,actor,activity,act,caseRow}
}

test('open BAP, interview progress and live obstacles stay visible to leadership without invalidating drafts',async()=>{
 const {db,actor,activity,act,caseRow}=await harness()
 try{
  await actor(1)
  const untouched=await caseRow()
  const opened=await activity('open')
  assert.equal(opened.revision,0);assert.equal(opened.opened_by,uid(1));assert.ok(opened.last_seen_at)
  assert.deepEqual(await caseRow(),untouched)
  let current=await act('start',untouched.revision)
  assert.equal(current.status,'Dalam wawancara')
  const started=current.started_at
  const report=await activity('report',0,{note:'  Sambungan peserta terputus saat wawancara  '})
  assert.equal(report.obstacle_status,'open');assert.equal(report.obstacle_note,'Sambungan peserta terputus saat wawancara')
  assert.equal(report.obstacle_reported_by,uid(1));assert.equal(report.revision,1)
  assert.deepEqual(await caseRow(),current)
  // Autosave uses its existing BAP revision even after an obstacle was reported.
  current=await act('save',current.revision,{answers:{1:'Jawaban tersimpan'},identity})
  assert.equal(current.status,'Draf')
  for(let i=0;i<4;i++){
   const heartbeat=await activity('open')
   assert.equal(heartbeat.revision,report.revision)
   assert.deepEqual(heartbeat.opened_at,opened.opened_at)
  }
  assert.deepEqual(await caseRow(),current)
  for(const n of [3,4,5]){
   await actor(n)
   const rows=(await db.query('select c.nik,c.status,c.answers,a.obstacle_status,a.obstacle_note,a.last_seen_by from interview_cases c left join interview_activity a using(nik) order by nik')).rows
   assert.equal(rows.length,2)
   assert.equal(rows[0].status,'Draf');assert.equal(rows[0].answers[1],'Jawaban tersimpan')
   assert.equal(rows[0].obstacle_status,'open');assert.equal(rows[0].obstacle_note,report.obstacle_note);assert.equal(rows[0].last_seen_by,uid(1))
  }
  // Looking at another handler's draft must not change the active handler.
  await actor(3);await assert.rejects(activity('open'),/ACTIVITY_LOCKED/)
  await actor(5);await assert.rejects(activity('open'),/ACTIVITY_LOCKED/)
  await actor(1)
  current=await act('finalize',current.revision,{answers,identity})
  assert.equal(current.status,'Selesai');assert.deepEqual(current.started_at,started)
  await assert.rejects(activity('open'),/ACTIVITY_FINALIZED/)
  await assert.rejects(activity('report',1,{note:'Kendala yang terlambat'}),/ACTIVITY_FINALIZED/)
  // An outstanding obstacle can still be acknowledged after the BAP completes.
  await actor(3)
  const resolved=await activity('resolve',1,{note:'Peserta berhasil tersambung kembali'})
  assert.equal(resolved.obstacle_status,'resolved');assert.equal(resolved.obstacle_reported_by,uid(1));assert.equal(resolved.obstacle_resolved_by,uid(3));assert.equal(resolved.revision,2)
  assert.equal(resolved.obstacle_resolution_note,'Peserta berhasil tersambung kembali')
  assert.deepEqual(await caseRow(),current)
  await actor(4)
  const completed=(await db.query('select c.status,c.finished_at,a.obstacle_status from interview_cases c join interview_activity a using(nik) where nik=$1',[nik])).rows[0]
  assert.equal(completed.status,'Selesai');assert.ok(completed.finished_at);assert.equal(completed.obstacle_status,'resolved')
  await db.exec('reset role')
  const audit=(await db.query('select action,before_data,after_data from interview_private.activity_audit order by id')).rows
  assert.deepEqual(audit.map(row=>row.action),['open','report','resolve'])
  assert.equal(audit[2].before_data.obstacle_status,'open');assert.equal(audit[2].after_data.obstacle_status,'resolved')
  const bapAudit=(await db.query('select action from interview_private.audit order by id')).rows
  assert.deepEqual(bapAudit.map(row=>row.action),['start','save','finalize'])
  // Rerunning this activation preserves both BAP content and the activity history.
  const before=(await db.query('select * from interview_activity order by nik')).rows
  await db.exec(await readFile(new URL('../supabase/interview-monitoring-activation.sql',import.meta.url),'utf8'))
  assert.deepEqual((await db.query('select * from interview_activity order by nik')).rows,before)
  assert.equal((await db.query('select count(*)::integer n from interview_private.activity_audit')).rows[0].n,3)
 }finally{await db.close()}
})

test('operational reporting enforces role, room, revision, validation and direct-write guards',async()=>{
 const {db,actor,activity,caseRow}=await harness()
 try{
  await actor(1)
  await assert.rejects(activity('report',0,{note:'\n\t  '}),/INVALID_NOTE/)
  await assert.rejects(activity('report',0,{note:'x'.repeat(2001)}),/INVALID_NOTE/)
  await assert.rejects(activity('report',0,{note:123}),/INVALID_NOTE/)
  await assert.rejects(activity('report',0,[]),/ACTIVITY_INVALID/)
  await assert.rejects(activity('open',null,null),/ACTIVITY_INVALID/)
  await assert.rejects(activity('unknown'),/INVALID_ACTION/)
  await assert.rejects(activity('open',null,{},'3333333333333333'),/NOT_FOUND/)
  assert.equal((await db.query('select * from interview_activity')).rows.length,0)
  const before=await caseRow()
  // An interviewer can report a connection problem before clicking Mulai.
  let row=await activity('report',0,{note:'Peserta belum dapat tersambung ke Zoom'})
  assert.equal(row.opened_at,null);assert.equal(row.revision,1)
  assert.deepEqual(await caseRow(),before)
  await assert.rejects(activity('report',null,{note:'Keterangan kendala baru'}),/CONFLICT/)
  await assert.rejects(activity('resolve',0),/CONFLICT/)
  row=await activity('open');assert.equal(row.revision,1)
  row=await activity('report',1,{note:'Masih belum dapat tersambung'});assert.equal(row.revision,2)
  await actor(2)
  assert.equal((await db.query('select * from interview_activity')).rows.length,0)
  for(const action of ['open','report','resolve'])await assert.rejects(activity(action,2,{note:'Permintaan room lain'}),/FORBIDDEN/)
  // New activity in another room stays invisible to the first interviewer.
  await activity('report',0,{note:'Kendala room dua'},otherNik)
  await actor(1);assert.deepEqual((await db.query('select nik from interview_activity')).rows,[{nik}])
  for(const n of [4,6,null]){
   await actor(n)
   for(const action of ['open','report','resolve'])await assert.rejects(activity(action,2,{note:'Permintaan tanpa izin'}),/FORBIDDEN/)
   assert.equal((await db.query('select * from interview_activity')).rows.length,n===4?2:0)
  }
  await actor(3)
  await assert.rejects(db.query("update interview_activity set obstacle_status='resolved' where nik=$1",[nik]),/permission denied/)
  await assert.rejects(db.query('delete from interview_activity where nik=$1',[nik]),/permission denied/)
  await assert.rejects(db.query('insert into interview_activity(nik) values($1)',[nik]),/permission denied/)
  await assert.rejects(db.query('select * from interview_private.activity_audit'),/permission denied/)
  row=await activity('resolve',2);assert.equal(row.obstacle_status,'resolved');assert.equal(row.revision,3)
  await assert.rejects(activity('resolve',3),/NO_OPEN_OBSTACLE/)
  row=await activity('report',3,{note:'Kendala berulang setelah resolusi'})
  assert.equal(row.obstacle_status,'open');assert.equal(row.obstacle_resolved_at,null);assert.equal(row.obstacle_resolution_note,'');assert.equal(row.revision,4)
  await actor(5);row=await activity('resolve',4,{note:'Tindak lanjut editor'});assert.equal(row.obstacle_resolved_by,uid(5))
  assert.deepEqual(await caseRow(),before)
  await db.exec('reset role')
  const grants=(await db.query(`select
   has_function_privilege('anon','public.interview_activity_action(text,text,integer,jsonb)','execute') as anon_public,
   has_function_privilege('anon','interview_private.interview_activity_action(text,text,integer,jsonb)','execute') as anon_private,
   has_function_privilege('authenticated','public.interview_activity_action(text,text,integer,jsonb)','execute') as authenticated,
   has_table_privilege('anon','public.interview_activity','select') as anon_read,
   (select relrowsecurity from pg_class where oid='public.interview_activity'::regclass) as rls`)).rows[0]
  assert.deepEqual(grants,{anon_public:false,anon_private:false,authenticated:true,anon_read:false,rls:true})
 }finally{await db.close()}
})
