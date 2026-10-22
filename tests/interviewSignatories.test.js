import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

const uid=n=>`00000000-0000-4000-8000-00000000000${n}`
const nik='1111111111111111'
const answers=Object.fromEntries(Array.from({length:22},(_,i)=>[i+1,`Jawaban asli ${i+1}`]))
const identity={pangkat:'Golongan IX',jabatan:'Penata Layanan Operasional',unitKerja:'PSNK',nomorSurat:'123',tanggalSurat:'2026-10-15',kota:'Jakarta'}

test('signatory sources and saved third-signature identity follow the case handler with room and revision guards',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   create table profiles(id uuid primary key,nama text,role text);
   create function public.current_app_role() returns text language sql stable security definer set search_path=public as $$select role from profiles where id=auth.uid()$$;
   create table discipline_datasets(id uuid primary key);create table interviewer_assignments(user_id uuid primary key,room_id text unique);`)
  for(const [n,nama,role] of [[1,'Pewawancara Room Satu','interviewer'],[2,'Pewawancara Room Dua','interviewer'],[3,'Admin Peninjau','admin'],[4,'Viewer Peninjau','viewer'],[5,'Editor yang Menangani','editor'],[6,'Akun Tanpa Izin','other']]){
   await db.query('insert into auth.users values($1)',[uid(n)]);await db.query('insert into profiles values($1,$2,$3)',[uid(n),nama,role])
  }
  await db.exec(`insert into interviewer_assignments values('${uid(1)}','room-1'),('${uid(2)}','room-2');grant select on interviewer_assignments to authenticated;`)
  for(const file of ['interview-portal.sql','interview-revisions.sql','interview-signatories.sql'])await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'))
  await db.exec(`insert into interview_cases(nik,person,room_id,scheduled_date,scheduled_time) values
   ('${nik}','{"nama":"Peserta uji","nip":"123456789012345678"}','room-1','2026-10-26','08:30'),
   ('2222222222222222','{"nama":"Peserta dua","nip":"223456789012345678"}','room-1','2026-10-26','09:00'),
   ('3333333333333333','{"nama":"Peserta tiga","nip":"323456789012345678"}','room-2','2026-10-26','08:30');
   update interview_cases set locked_by='${uid(5)}',started_at='2026-10-26T01:00:00Z',status='Draf' where nik='2222222222222222';`)
  async function actor(n){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${n?uid(n):''}',false);set role authenticated`)}
  const source=async(caseNik=nik)=>(await db.query('select interview_signatory_source($1) as source',[caseNik])).rows[0].source
  const act=async(action,revision,payload={})=>(await db.query('select * from interview_action($1,$2,$3,$4)',[nik,action,revision,payload])).rows[0]
  await actor(1);assert.deepEqual(await source(),{user_id:uid(1),nama:'Pewawancara Room Satu',nip:''})
  assert.deepEqual(await source('2222222222222222'),{user_id:uid(5),nama:'Editor yang Menangani',nip:''})
  await assert.rejects(source('3333333333333333'),/SIGNATORY_FORBIDDEN/)
  await actor(2);await assert.rejects(source(),/SIGNATORY_FORBIDDEN/)
  await actor(3);assert.equal((await source()).nama,'Pewawancara Room Satu');assert.notEqual((await source()).nama,'Admin Peninjau')
  await actor(4);assert.equal((await source('2222222222222222')).nama,'Editor yang Menangani');await assert.rejects(act('start',1),/FORBIDDEN/)
  await actor(6);await assert.rejects(source(),/SIGNATORY_FORBIDDEN/)
  await actor(null);await assert.rejects(source(),/SIGNATORY_FORBIDDEN/)
  await actor(1);await assert.rejects(source('4444444444444444'),/SIGNATORY_NOT_FOUND/)
  let row=await act('start',1);const started=row.started_at
  await assert.rejects(act('finalize',row.revision,{answers,identity}),/INCOMPLETE.*pewawancaraNama/)
  row=await act('save',row.revision,{answers,identity:{...identity,pewawancaraNama:'Nama Pemeriksa',pewawancaraNip:'1234'}})
  assert.equal(row.identity_details.pewawancaraNip,'1234');assert.deepEqual(row.answers,answers)
  await assert.rejects(act('finalize',row.revision,{answers,identity:row.identity_details}),/INVALID_SIGNATORY_NIP/)
  row=await act('save',row.revision,{answers,identity:{...identity,pewawancaraNama:'Nama Pemeriksa',pewawancaraNip:'19880101201001100X'}})
  assert.equal(row.identity_details.pewawancaraNip,'19880101201001100X');assert.deepEqual(row.answers,answers)
  await assert.rejects(act('finalize',row.revision,{answers,identity:row.identity_details}),/INVALID_SIGNATORY_NIP/)
  await assert.rejects(act('save',row.revision,{answers,identity:{...identity,pewawancaraNip:123}}),/INVALID_IDENTITY/)
  row=await act('save',row.revision,{answers,identity:{...identity,pewawancaraNama:'Nama sesuai identitas pewawancara',pewawancaraNip:''}})
  assert.equal(row.status,'Draf');assert.equal((await source()).nip,'')
  await assert.rejects(act('finalize',row.revision,{answers,identity:row.identity_details}),/INCOMPLETE.*pewawancaraNip/)
  const signed={...identity,pewawancaraNama:'Nama sesuai identitas pewawancara',pewawancaraNip:'19880101 201001 1 001'}
  row=await act('save',row.revision,{answers,identity:signed});assert.equal(row.identity_details.pewawancaraNip,'198801012010011001')
  await actor(3);assert.deepEqual(await source(),{user_id:uid(1),nama:signed.pewawancaraNama,nip:'198801012010011001'})
  await actor(4);assert.equal((await source()).nama,signed.pewawancaraNama)
  await actor(1);await assert.rejects(act('finalize',row.revision,{answers,identity:{...row.identity_details,pewawancaraNama:'\n\t'}}),/INCOMPLETE/)
  row=await act('finalize',row.revision,{answers,identity:row.identity_details});assert.equal(row.status,'Selesai');assert.deepEqual(row.started_at,started)
  await assert.rejects(act('revise',null),/CONFLICT/);await assert.rejects(act('revise',row.revision-1),/CONFLICT/)
  row=await act('revise',row.revision,{reason:'Perbaikan tanda tangan'});assert.equal(row.status,'Draf');assert.deepEqual(row.started_at,started);assert.equal(row.identity_details.pewawancaraNama,signed.pewawancaraNama);assert.equal(row.identity_details.pewawancaraNip,'198801012010011001')
  await db.exec('reset role')
  const audit=(await db.query('select action,before_data,after_data from interview_private.audit order by id')).rows
  assert.deepEqual(audit.map(a=>a.action),['start','save','save','save','save','finalize','revise']);assert.equal(audit[1].after_data.identity_details.pewawancaraNip,'1234');assert.equal(audit[4].after_data.identity_details.pewawancaraNip,'198801012010011001');assert.equal(audit[6].before_data.status,'Selesai');assert.equal(audit[6].after_data.reason,'Perbaikan tanda tangan')
  const permissions=(await db.query("select has_function_privilege('anon','public.interview_signatory_source(text)','execute') as anon,has_function_privilege('authenticated','public.interview_signatory_source(text)','execute') as authenticated")).rows[0]
  assert.deepEqual(permissions,{anon:false,authenticated:true})
 }finally{await db.close()}
})
