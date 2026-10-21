import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {categoryState} from '../src/bap/categoryModel.js'
import {reportReadiness,sameVersions} from '../src/bap/lhpModel.js'

const uid=n=>`00000000-0000-4000-8000-00000000000${n}`
const answers=Object.fromEntries(Array.from({length:22},(_,i)=>[i+1,`Jawaban asli ${i+1}`]))
const identity={pangkat:'Golongan IX',jabatan:'Penata Layanan Operasional',unitKerja:'PSNK',nomorSurat:'123',tanggalSurat:'2026-10-15',kota:'Jakarta'}
test('completed BAP can be revised by its assigned interviewer without losing content or history',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   create table profiles(id uuid primary key,nama text,role text);
   create function public.current_app_role() returns text language sql stable security definer set search_path=public as $$select role from profiles where id=auth.uid()$$;
   create table discipline_datasets(id uuid primary key,name text,version int,result jsonb);
   create table interviewer_assignments(user_id uuid primary key,room_id text unique);`)
  for(const [n,role] of [[1,'interviewer'],[2,'interviewer'],[3,'admin'],[4,'viewer'],[5,'editor']]){
   await db.query('insert into auth.users values($1)',[uid(n)])
   await db.query('insert into profiles values($1,$2,$3)',[uid(n),'Petugas',role])
  }
  await db.exec(`insert into interviewer_assignments values('${uid(1)}','room-1'),('${uid(2)}','room-2');grant select on interviewer_assignments to authenticated;`)
  for(const file of ['interview-portal.sql','interview-categories.sql','interview-statements.sql','interview-reports.sql','interview-revisions.sql'])await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'))
  await db.exec(`insert into interview_cases(nik,person,room_id,scheduled_date,scheduled_time) values('1111111111111111','{"nama":"Peserta uji","nip":"123456789012345678"}','room-1','2026-10-26','08:30')`)
  async function actor(n){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${n?uid(n):''}',false);set role authenticated`)}
  async function act(action,revision,payload={}){return (await db.query('select * from interview_action($1,$2,$3,$4)',['1111111111111111',action,revision,payload])).rows[0]}
  await actor(1)
  await assert.rejects(act('revise',1),/NOT_FINALIZED/)
  let row=await act('start',1);const started=row.started_at
  row=await act('finalize',row.revision,{answers,identity});const doneRevision=row.revision
  await assert.rejects(act('save',doneRevision,{answers,identity}),/FINALIZED/)
  await actor(2);await assert.rejects(act('revise',doneRevision),/FORBIDDEN/)
  await actor(4);await assert.rejects(act('revise',doneRevision),/FORBIDDEN/)
  await actor(5);await assert.rejects(act('revise',doneRevision),/LOCKED/)
  await actor(null);await assert.rejects(act('revise',doneRevision),/FORBIDDEN/)
  await actor(1);await assert.rejects(act('revise',null),/CONFLICT/)
  await assert.rejects(act('revise',doneRevision-1),/CONFLICT/)
  // Existing reviewed records retain their history but become stale immediately.
  await db.exec(`reset role;update interview_categories set review_status='Ditetapkan',decision_bap_revision=${doneRevision},final_category='Ringan' where nik='1111111111111111';update interview_statements set bap_revision=${doneRevision},confirmed_at=now() where nik='1111111111111111'`)
  await actor(1)
  const before=(await db.query('select interview_report_source($1) as source',['1111111111111111'])).rows[0].source
  assert.equal(reportReadiness(before).length,0)
  row=await act('revise',doneRevision,{reason:'Perbaikan salah ketik'})
  assert.equal(row.status,'Draf');assert.equal(row.finished_at,null);assert.equal(row.locked_by,uid(1));assert.deepEqual(row.started_at,started)
  assert.deepEqual(row.answers,answers);assert.deepEqual(row.identity_details,identity);assert.equal(row.revision,doneRevision+1)
  const after=(await db.query('select interview_report_source($1) as source',['1111111111111111'])).rows[0].source
  assert.equal(categoryState(after.category,row),'Perlu ditinjau ulang');assert.equal(reportReadiness(after).length,3);assert.equal(sameVersions(before.versions,after.versions),false)
  await assert.rejects(act('revise',row.revision),/NOT_FINALIZED/)
  row=await act('save',row.revision,{answers:{...answers,11:'Keterangan yang telah diperbaiki'},identity});assert.equal(row.answers[11],'Keterangan yang telah diperbaiki');assert.deepEqual(row.started_at,started)
  row=await act('finalize',row.revision,{answers:row.answers,identity});assert.equal(row.status,'Selesai')
  // A completed case can be reclaimed by the assigned interviewer even if an
  // admin performed the previous revision. Another room still cannot claim it.
  await actor(3);row=await act('revise',row.revision);assert.equal(row.locked_by,uid(3));row=await act('finalize',row.revision,{answers:row.answers,identity})
  await actor(1);row=await act('revise',row.revision);assert.equal(row.locked_by,uid(1));assert.deepEqual(row.started_at,started)
  await db.exec('reset role')
  const audit=(await db.query("select * from interview_private.audit where action='revise' order by id")).rows
  assert.equal(audit.length,3);assert.equal(audit[0].before_data.status,'Selesai');assert.equal(audit[0].after_data.status,'Draf');assert.equal(audit[0].after_data.reason,'Perbaikan salah ketik')
 }finally{await db.close()}
})
