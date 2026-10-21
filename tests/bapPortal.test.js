import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {dateWords,interviewTimestamp,missingFields,initialIdentity,templateData,QUESTIONS} from '../src/bap/model.js'
import {buildWord} from '../src/bap/documents.js'
import {unzipSync,strFromU8} from 'fflate'
import {positions,positionBackfillSql} from '../scripts/prepare_interview_positions.mjs'
import {lookupNipPosition} from '../src/letters/nipPositionReference.js'

test('all 1057 BAP position mappings match the letter reference exactly',()=>{
 assert.equal(positions.length,1057)
 assert.equal(new Set(positions.map(p=>p.nip)).size,1057)
 for(const p of positions){assert.equal(p.pangkat,lookupNipPosition(p.nip).pangkat);assert.equal(p.jabatan,lookupNipPosition(p.nip).jabatan)}
 const person={pangkat:positions[0].pangkat,jabatan:positions[0].jabatan}
 assert.equal(initialIdentity({person,identity_details:{pangkat:'',jabatan:''}}).pangkat,person.pangkat)
 assert.equal(initialIdentity({person,identity_details:{jabatan:'Koreksi terverifikasi'}}).jabatan,'Koreksi terverifikasi')
})

test('position backfill fills gaps and preserves finalized BAP, corrections and answers',async()=>{
 const db=new PGlite()
 try{
  await db.exec("create table interview_cases(nik text,person jsonb,status text,revision int default 1,updated_at timestamptz default now(),identity_details jsonb,answers jsonb)")
  const a=positions[0],b=positions[1]
  for(const [nik,nip,status,rank] of [['1',a.nip,'Terjadwal',''],['2',b.nip,'Draf','Pangkat terkoreksi'],['3',a.nip,'Selesai',''],['4','000000000000000000','Terjadwal','']]){
   await db.query('insert into interview_cases(nik,person,status,identity_details,answers) values($1,$2,$3,$4,$5)',[nik,JSON.stringify({nip,pangkat:rank,jabatan:''}),status,'{"jabatan":"Koreksi pemeriksa"}','{"1":"Jawaban asli"}'])
  }
  const result=await db.query(positionBackfillSql());assert.equal(Number(result.rows[0].updated_participants),2)
  const {rows}=await db.query('select * from interview_cases order by nik')
  assert.equal(rows[0].person.pangkat,a.pangkat);assert.equal(rows[0].person.jabatan,a.jabatan)
  assert.equal(rows[1].person.pangkat,'Pangkat terkoreksi');assert.equal(rows[1].person.jabatan,b.jabatan)
  assert.equal(rows[2].person.pangkat,'');assert.equal(rows[3].person.pangkat,'')
  assert.equal(rows[0].identity_details.jabatan,'Koreksi pemeriksa');assert.equal(rows[0].answers['1'],'Jawaban asli')
  assert.equal(Number((await db.query(positionBackfillSql())).rows[0].updated_participants),0)
 }finally{await db.close()}
})

test('Word preserves the supplied package and safely inserts all answers',async()=>{
 const template=await readFile(new URL('../public/templates/bap-2026.docx',import.meta.url))
 const previous=globalThis.fetch;globalThis.fetch=async()=>new Response(template)
 try{
  const row={person:{nama:'Nama & <contoh>',nip:'123456789012345678'},started_at:'2026-10-26T01:30:00Z'}
  const identity={...initialIdentity(row),pangkat:'IX',jabatan:'Jabatan Uji'}
  const answers=Object.fromEntries(Array.from({length:22},(_,i)=>[i+1,`Jawaban ${i+1}\nBaris berikutnya & benar`]))
  const word=await buildWord(row,identity,answers);const files=unzipSync(new Uint8Array(await word.arrayBuffer()))
  const xml=strFromU8(files['word/document.xml'])
  assert.ok(xml.includes('Nama &amp; &lt;contoh&gt;'));assert.ok(xml.includes('Jawaban 22'))
  assert.ok(xml.includes('<w:br/>'));assert.ok(!/\{jawaban_|\{nama\}|\{nip\}/.test(xml))
  assert.ok(xml.includes('RAHASIA'));assert.ok(xml.includes('BERITA  ACARA PEMERIKSAAN'))
  assert.deepEqual(Object.keys(files).sort(),Object.keys(unzipSync(template)).sort())
 }finally{globalThis.fetch=previous}
})

test('BAP follows scheduled WIB date in words and preserves literal answers',()=>{
 const row={started_at:'2026-10-25T18:30:00.000Z',person:{nama:'Peserta & keluarga',nip:'123456789012345678'},identity_details:{}}
 const date=dateWords(row.started_at)
 assert.equal(date.hari,'Senin');assert.equal(date.tanggal_huruf,'dua puluh enam');assert.equal(date.tahun_huruf,'Dua Ribu Dua Puluh Enam')
 const identity=initialIdentity(row)
 assert.equal(identity.pangkat,'');assert.equal(identity.jabatan,'')
 assert.ok(missingFields(row,identity,{}).includes('Pangkat / golongan'))
 assert.equal(QUESTIONS.length,22)
 assert.equal(templateData(row,identity,{11:'Tidak mengakui <apa pun>'}).jawaban_11,'Tidak mengakui <apa pun>')
 const scheduled={...row,scheduled_date:'2026-10-29',scheduled_time:'09:30:00'}
 assert.equal(interviewTimestamp(scheduled),'2026-10-29T09:30:00+07:00')
 assert.equal(templateData(scheduled,identity,{}).hari,'Kamis');assert.equal(templateData(scheduled,identity,{}).tanggal_huruf,'dua puluh sembilan')
 assert.equal(row.started_at,'2026-10-25T18:30:00.000Z')
})

test('database enforces room access, revision checks, immutable start, finalization and admin reopening',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   create table public.profiles(id uuid primary key references auth.users(id),nama text,role text);
   create function public.current_app_role() returns text language sql stable security definer set search_path=public as $$ select role from profiles where id=auth.uid() $$;
   create table public.discipline_datasets(id uuid primary key);
   create table public.interviewer_assignments(user_id uuid primary key,room_id text unique);
   insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004');
   insert into profiles select id,'Petugas',case right(id::text,1) when '3' then 'admin' when '4' then 'viewer' else 'interviewer' end from auth.users;
   insert into interviewer_assignments values ('00000000-0000-4000-8000-000000000001','room-1'),('00000000-0000-4000-8000-000000000002','room-2');
   grant select on interviewer_assignments to authenticated;`)
  await db.exec(await readFile(new URL('../supabase/interview-portal.sql',import.meta.url),'utf8'))
  await db.exec(`insert into public.interview_cases(nik,person,room_id,scheduled_date,scheduled_time) values
   ('1111111111111111','{"nama":"Peserta 1","nip":"123456789012345678"}','room-1','2026-10-26','08:30'),
   ('2222222222222222','{"nama":"Peserta 2","nip":"223456789012345678"}','room-2','2026-10-26','08:30');`)
  async function actor(n){await db.exec(`reset role;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000${n}',false);set role authenticated;`)}
  async function action(nik,action,revision,payload={}){return (await db.query('select * from public.interview_action($1,$2,$3,$4)',[nik,action,revision,payload])).rows[0]}
  await actor(1)
  assert.equal((await db.query('select * from public.interview_cases')).rows.length,1)
  await assert.rejects(action('2222222222222222','start',1),/FORBIDDEN/)
  let r=await action('1111111111111111','start',1);const start=r.started_at
  await assert.rejects(action(r.nik,'save',1,{answers:{},identity:{}}),/CONFLICT/)
  await assert.rejects(action(r.nik,'finalize',r.revision,{answers:{},identity:{}}),/INCOMPLETE/)
  const answers=Object.fromEntries(Array.from({length:22},(_,i)=>[i+1,'Jawaban '+(i+1)]))
  const identity={pangkat:'IX',jabatan:'Jabatan terverifikasi',unitKerja:'PSNK',nomorSurat:'123',tanggalSurat:'2026-10-15',kota:'Jakarta'}
  await assert.rejects(action(r.nik,'save',r.revision,{answers,identity:{...identity,tanggalSurat:'2026-99-99'}}),/out of range/)
  r=await action(r.nik,'save',r.revision,{answers,identity});assert.equal(r.status,'Draf');assert.deepEqual(r.started_at,start)
  await assert.rejects(action(r.nik,'save',r.revision,{answers:{23:'invalid'},identity}),/INVALID_ANSWER/)
  r=await action(r.nik,'finalize',r.revision,{answers,identity});assert.equal(r.status,'Selesai')
  await assert.rejects(action(r.nik,'save',r.revision,{answers,identity}),/FINALIZED/)
  await assert.rejects(action(r.nik,'reopen',r.revision,{reason:'Cek ulang'}),/ADMIN_REASON/)
  await actor(4);assert.equal((await db.query('select * from public.interview_cases')).rows.length,2)
  await assert.rejects(action(r.nik,'start',r.revision),/FORBIDDEN/)
  await actor(3);r=await action(r.nik,'reopen',r.revision,{reason:'Koreksi keterangan'});assert.equal(r.locked_by,null);assert.equal(r.status,'Draf')
  await assert.rejects(action(r.nik,'schedule',r.revision,{roomId:'room-2'}),/ALREADY_STARTED/)
  // A stale second schedule update rolls back the first update in the batch.
  await assert.rejects(db.query('select public.interview_schedule_batch($1)',[JSON.stringify([
   {nik:'2222222222222222',revision:1,schedule:{time:'09:00'}},
   {nik:'1111111111111111',revision:0,schedule:{time:'10:00'}}
  ])]),/CONFLICT/)
  assert.equal((await db.query("select revision from public.interview_cases where nik='2222222222222222'")).rows[0].revision,1)
  await actor(1);r=await action(r.nik,'start',r.revision);assert.deepEqual(r.started_at,start)
 }finally{await db.close()}
})
