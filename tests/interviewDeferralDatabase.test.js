import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

const uid=n=>`00000000-0000-4000-8000-00000000000${n}`
const nik='1111111111111111',otherNik='2222222222222222'
const answers=Object.fromEntries(Array.from({length:22},(_,i)=>[i+1,`Keterangan simulasi ${i+1}`]))
const identity={pangkat:'Golongan IX',jabatan:'Penata Layanan Operasional',unitKerja:'PSNK',nomorSurat:'123',tanggalSurat:'2026-10-23',kota:'Jakarta',pewawancaraNama:'Petugas Simulasi',pewawancaraNip:'198801012010011001'}
const deferralSql=()=>readFile(new URL('../supabase/interview-deferral.sql',import.meta.url),'utf8')

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
 await db.exec(await deferralSql())
 const actor=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${n?uid(n):''}',false);set role authenticated`)
 const act=async(action,revision,payload={},caseNik=nik)=>(await db.query('select * from interview_action($1,$2,$3,$4)',[caseNik,action,revision,payload])).rows[0]
 const activity=async(action,revision=null,payload={})=>(await db.query('select * from interview_activity_action($1,$2,$3,$4)',[nik,action,revision,payload])).rows[0]
 const caseRow=async()=>(await db.query('select * from interview_cases where nik=$1',[nik])).rows[0]
 return {db,actor,act,activity,caseRow}
}

test('started BAP can defer its draft atomically and resume before completing all required fields',async()=>{
 const {db,actor,act,activity,caseRow}=await harness()
 try{
  await actor(1)
  await assert.rejects(act('save',1,{answers,identity}),/INTERVIEW_LOCKED/)
  await assert.rejects(act('finalize',1,{answers,identity}),/INTERVIEW_LOCKED/)
  let row=await act('start',1)
  const started=row.started_at
  assert.equal(row.status,'Dalam wawancara')
  const opened=await activity('open')
  row=await act('defer',row.revision,{reason:'  Koneksi peserta terputus  ',answers:{1:'Jawaban sebelum koneksi terputus'},identity:{...identity,pewawancaraNip:'19880101 201001 1 001'}})
  assert.equal(row.status,'Tertunda');assert.equal(row.deferred_reason,'Koneksi peserta terputus')
  assert.ok(row.deferred_at);assert.equal(row.deferred_by,uid(1));assert.equal(row.locked_by,uid(1))
  assert.deepEqual(row.started_at,started);assert.equal(row.finished_at,null)
  assert.deepEqual(row.answers,{1:'Jawaban sebelum koneksi terputus'})
  assert.equal(row.identity_details.pewawancaraNip,identity.pewawancaraNip)
  const deferred={reason:row.deferred_reason,at:row.deferred_at,by:row.deferred_by}
  for(const action of ['save','finalize','defer'])await assert.rejects(act(action,row.revision,{answers,identity,reason:'Penundaan lagi'}),/INTERVIEW_DEFERRED/)
  await assert.rejects(activity('open'),/INTERVIEW_ACTIVITY_DEFERRED/)
  const reported=await activity('report',opened.revision,{note:'Peserta perlu menstabilkan koneksi'})
  assert.equal(reported.obstacle_status,'open')
  await activity('resolve',reported.revision,{note:'Koneksi sudah tersedia'})
  assert.deepEqual(await caseRow(),row)
  await actor(4)
  const leadership=await caseRow()
  assert.equal(leadership.status,'Tertunda');assert.equal(leadership.deferred_reason,deferred.reason)
  assert.equal(leadership.answers[1],'Jawaban sebelum koneksi terputus')
  await actor(1)
  row=await act('start',row.revision)
  assert.equal(row.status,'Dalam wawancara');assert.deepEqual(row.started_at,started)
  assert.deepEqual({reason:row.deferred_reason,at:row.deferred_at,by:row.deferred_by},deferred)
  await activity('open')
  for(const payload of [
   {answers:{...answers,22:''},identity},
   {answers:{...answers,22:'\n\t  '},identity},
   {answers,identity:{...identity,jabatan:''}},
   {answers,identity:{...identity,jabatan:'\r\n\t  '}},
   {answers,identity:{...identity,pewawancaraNama:'\n\t'}},
   {answers,identity:{...identity,pewawancaraNip:''}},
   {answers,identity:{...identity,pewawancaraNip:'1234'}}
  ])await assert.rejects(act('finalize',row.revision,payload),/INTERVIEW_INCOMPLETE|INTERVIEW_INVALID_SIGNATORY_NIP/)
  for(const field of ['nama','nip']){
   await db.exec('reset role')
   const person=row.person
   await db.query('update interview_cases set person=$1 where nik=$2',[{...person,[field]:'\n\t  '},nik])
   await actor(1)
   await assert.rejects(act('finalize',row.revision,{answers,identity}),/INTERVIEW_INCOMPLETE_IDENTITY/)
   await db.exec('reset role')
   await db.query('update interview_cases set person=$1 where nik=$2',[person,nik])
   await actor(1)
  }
  const multilineAnswers={...answers,1:'Baris keterangan pertama\n\tBaris keterangan kedua'}
  row=await act('finalize',row.revision,{answers:multilineAnswers,identity})
  assert.equal(row.status,'Selesai');assert.ok(row.finished_at);assert.deepEqual(row.started_at,started)
  assert.equal(row.answers[1],multilineAnswers[1])
  assert.deepEqual({reason:row.deferred_reason,at:row.deferred_at,by:row.deferred_by},deferred)
  await assert.rejects(act('defer',row.revision,{reason:'Tidak boleh menunda yang selesai'}),/INTERVIEW_FINALIZED/)
  row=await act('revise',row.revision,{reason:'Perbaikan catatan pemeriksaan'})
  assert.equal(row.status,'Draf');assert.equal(row.finished_at,null);assert.deepEqual(row.answers,multilineAnswers)
  row=await act('defer',row.revision,{reason:'Menunggu dokumen pendukung'})
  assert.deepEqual(row.answers,multilineAnswers);assert.deepEqual(row.identity_details,identity)
  assert.deepEqual(row.started_at,started);assert.equal(row.deferred_reason,'Menunggu dokumen pendukung')
  await db.exec('reset role')
  const audit=(await db.query('select action,before_data,after_data from interview_private.audit order by id')).rows
  assert.deepEqual(audit.map(item=>item.action),['start','defer','start','finalize','revise','defer'])
  assert.equal(audit[1].before_data.status,'Dalam wawancara');assert.equal(audit[1].after_data.status,'Tertunda')
  assert.equal(audit[1].after_data.reason,'Koneksi peserta terputus')
  assert.equal(audit[1].after_data.answers[1],'Jawaban sebelum koneksi terputus')
  assert.equal(audit[2].before_data.status,'Tertunda');assert.equal(audit[2].after_data.status,'Dalam wawancara')
  const before=(await db.query('select * from interview_cases order by nik')).rows
  await db.exec(await deferralSql())
  assert.deepEqual((await db.query('select * from interview_cases order by nik')).rows,before)
  assert.equal((await db.query('select count(*)::integer n from interview_private.audit')).rows[0].n,audit.length)
 }finally{await db.close()}
})

test('absence can be deferred before Mulai without creating BAP input or allowing rescheduling until admin reopen',async()=>{
 const {db,actor,act,activity,caseRow}=await harness()
 try{
  await actor(1)
  for(const payload of [{reason:'Peserta belum hadir',answers,identity},{reason:'Peserta belum hadir',answers},{reason:'Peserta belum hadir',identity}]){
   await assert.rejects(act('defer',1,payload),/INTERVIEW_LOCKED/)
  }
  let row=await act('defer',1,{reason:'Peserta belum hadir di Zoom'})
  assert.equal(row.status,'Tertunda');assert.equal(row.started_at,null);assert.equal(row.finished_at,null)
  assert.deepEqual(row.answers,{});assert.deepEqual(row.identity_details,{})
  assert.equal(row.locked_by,uid(1));assert.equal(row.deferred_by,uid(1))
  await assert.rejects(activity('open'),/INTERVIEW_ACTIVITY_DEFERRED/)
  await actor(3)
  await assert.rejects(act('schedule',row.revision,{date:'2026-10-27',time:'09:00'}),/INTERVIEW_DEFERRED/)
  await assert.rejects(act('start',row.revision),/INTERVIEW_LOCKED/)
  await assert.rejects(act('reopen',row.revision,{reason:'x'}),/ADMIN_REASON_REQUIRED/)
  assert.deepEqual(await caseRow(),row)
  row=await act('reopen',row.revision,{reason:'Peserta dikonfirmasi untuk jadwal baru'})
  assert.equal(row.status,'Terjadwal');assert.equal(row.locked_by,null);assert.equal(row.started_at,null)
  assert.equal(row.deferred_reason,'Peserta belum hadir di Zoom')
  row=await act('schedule',row.revision,{date:'2026-10-27',time:'09:00',roomId:'room-2'})
  assert.equal(row.status,'Terjadwal');assert.equal(row.scheduled_date.toISOString().slice(0,10),'2026-10-27');assert.equal(row.room_id,'room-2')
  await actor(1)
  await assert.rejects(act('start',row.revision),/INTERVIEW_FORBIDDEN/)
  await actor(2)
  row=await act('start',row.revision)
  assert.equal(row.status,'Dalam wawancara');assert.ok(row.started_at);assert.equal(row.locked_by,uid(2))
  assert.equal(row.deferred_reason,'Peserta belum hadir di Zoom');assert.equal(row.deferred_by,uid(1))
  row=await act('save',row.revision,{answers:{1:'Jawaban setelah hadir'},identity:{...identity,pewawancaraNip:'1234'}})
  assert.equal(row.status,'Draf');assert.equal(row.identity_details.pewawancaraNip,'1234')
  await assert.rejects(act('schedule',row.revision,{date:'2026-10-28'}),/INTERVIEW_FORBIDDEN/)
  await actor(3)
  await assert.rejects(act('schedule',row.revision,{date:'2026-10-28'}),/INTERVIEW_ALREADY_STARTED/)
  row=await act('reopen',row.revision,{reason:'Pergantian petugas oleh admin'})
  assert.equal(row.status,'Draf');assert.equal(row.locked_by,null);assert.ok(row.started_at)
  await actor(5)
  row=await act('start',row.revision)
  assert.equal(row.locked_by,uid(5));assert.equal(row.status,'Dalam wawancara')
 }finally{await db.close()}
})

test('deferral validates atomic drafts and leaves the whole case unchanged on rejected writes',async()=>{
 const {db,actor,act,caseRow}=await harness()
 try{
  await actor(1)
  for(const reason of [undefined,null,123,'\n\t  ','abc','x'.repeat(2001)]){
   await assert.rejects(act('defer',1,{reason}),/INTERVIEW_DEFER_REASON_REQUIRED/)
  }
  await assert.rejects(act('defer',1,null),/INTERVIEW_INVALID/)
  await assert.rejects(act('defer',1,[]),/INTERVIEW_INVALID/)
  let row=await act('start',1)
  row=await act('save',row.revision,{answers:{1:'Catatan lama'},identity})
  const reason='Perlu tindak lanjut dokumen'
  const invalid=[
   [{reason,answers},/INTERVIEW_INVALID/],
   [{reason,identity},/INTERVIEW_INVALID/],
   [{reason,answers:[],identity},/INTERVIEW_INVALID/],
   [{reason,answers:{23:'Jawaban di luar BAP'},identity},/INVALID_ANSWER/],
   [{reason,answers:{1:123},identity},/INVALID_ANSWER/],
   [{reason,answers:{1:'x'.repeat(8001)},identity},/INVALID_ANSWER/],
   [{reason,answers,identity:{...identity,unrecognized:'Tidak boleh'}},/INVALID_IDENTITY/],
   [{reason,answers,identity:{...identity,pewawancaraNip:123}},/INVALID_IDENTITY/],
   [{reason,answers,identity:{...identity,kota:'x'.repeat(501)}},/INVALID_IDENTITY/],
   [{reason,answers,identity:{...identity,tanggalSurat:'23-10-2026'}},/INVALID_DATE/],
   [{reason,answers,identity:{...identity,tanggalSurat:'2026-02-30'}},/date\/time field value out of range/]
  ]
  for(const [payload,expected] of invalid){
   await assert.rejects(act('defer',row.revision,payload),expected)
   assert.deepEqual(await caseRow(),row)
  }
  await assert.rejects(act('defer',null,{reason}),/INTERVIEW_CONFLICT/)
  await assert.rejects(act('defer',row.revision-1,{reason}),/INTERVIEW_CONFLICT/)
  const deferred=await act('defer',row.revision,{reason:'x'.repeat(2000)})
  assert.equal(deferred.deferred_reason.length,2000)
  assert.deepEqual(deferred.answers,row.answers);assert.deepEqual(deferred.identity_details,row.identity_details)
  assert.equal(deferred.revision,row.revision+1)
  await assert.rejects(act('start',row.revision),/INTERVIEW_CONFLICT/)
  await assert.rejects(act('defer',deferred.revision,{reason,answers,identity}),/INTERVIEW_DEFERRED/)
 }finally{await db.close()}
})

test('defer preserves role, room, lock, RLS and direct-write restrictions',async()=>{
 const {db,actor,act,caseRow}=await harness()
 try{
  for(const n of [2,4,6,null]){
   await actor(n)
   await assert.rejects(act('defer',1,{reason:'Permintaan tanpa hak akses'}),/INTERVIEW_FORBIDDEN/)
  }
  await actor(1)
  let row=await act('start',1)
  for(const n of [3,5]){
   await actor(n)
   await assert.rejects(act('defer',row.revision,{reason:'Tidak boleh mengambil kunci'}),/INTERVIEW_LOCKED/)
   assert.deepEqual(await caseRow(),row)
  }
  await actor(3)
  row=await act('reopen',row.revision,{reason:'Admin membuka alih penanganan'})
  row=await act('defer',row.revision,{reason:'Menunggu keputusan penanganan'})
  assert.equal(row.locked_by,uid(3));assert.equal(row.deferred_by,uid(3))
  await actor(4)
  assert.equal((await db.query('select nik from interview_cases order by nik')).rows.length,2)
  for(const sql of ["update interview_cases set status='Dalam wawancara'",'delete from interview_cases'])await assert.rejects(db.exec(sql),/permission denied/)
  await actor(2)
  assert.deepEqual((await db.query('select nik from interview_cases')).rows,[{nik:otherNik}])
  await db.exec('reset role')
  const permissions=(await db.query(`select
   has_function_privilege('anon','public.interview_action(text,text,integer,jsonb)','execute') as anon_public,
   has_function_privilege('anon','interview_private.interview_action(text,text,integer,jsonb)','execute') as anon_private,
   has_function_privilege('authenticated','public.interview_action(text,text,integer,jsonb)','execute') as authenticated,
   has_function_privilege('anon','interview_private.interview_activity_action(text,text,integer,jsonb)','execute') as anon_activity,
   has_table_privilege('authenticated','public.interview_cases','update') as direct_update,
   (select relrowsecurity from pg_class where oid='public.interview_cases'::regclass) as rls`)).rows[0]
  assert.deepEqual(permissions,{anon_public:false,anon_private:false,authenticated:true,anon_activity:false,direct_update:false,rls:true})
 }finally{await db.close()}
})
