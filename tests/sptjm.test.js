import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {unzipSync,strFromU8} from 'fflate'
import {initialStatement,statementMissing,statementTemplateData} from '../src/bap/sptjmModel.js'
import {fillWord} from '../src/bap/documents.js'
const row={nik:'1111111111111111',person:{nik:'1111111111111111',nip:'123456789012345678',nama:'Peserta Uji',jabatan:'Jabatan uji',unitKerja:'PSNK'},identity_details:{kota:'Jakarta'},started_at:'2026-10-26T01:00:00Z',status:'Selesai',revision:2}
const details={...initialStatement(row,null),provinsi:'Aceh',kabKota:'Kabupaten Uji',noHp:'081234567890',admission:'Mengakui',activityState:'stopped',startMonth:'2024-01',endMonth:'2025-02'}

test('SPTJM does not assume admission or a historical period',()=>{
 assert.equal(initialStatement(row,null).admission,'')
 assert.ok(statementMissing(row,initialStatement(row,null)).includes('Pilihan pengakuan'))
 assert.equal(statementMissing(row,details).length,0)
 assert.ok(statementMissing(row,{...details,startMonth:'2025-03'}).includes('Urutan periode'))
 const denied=statementTemplateData(row,{...details,admission:'Tidak mengakui',activityState:'',startMonth:'',endMonth:''})
 assert.equal(denied.pengakuan,'TIDAK MENGAKUI');assert.ok(!denied.periode.includes('Saya mulai'))
 assert.equal(denied.lampiran,'Dokumen pendukung belum dilampirkan.')
 assert.ok(statementTemplateData(row,{...details,activityState:'ongoing'}).periode.includes('masih berlangsung'))
 assert.ok(statementTemplateData(row,{...details,activityState:'unknown',periodNote:'Tidak ingat periode secara pasti'}).periode.includes('Tidak ingat'))
})

test('SPTJM Word uses the original package and fills identity and declaration',async()=>{
 const original=await readFile(new URL('../public/templates/sptjm-2026.docx',import.meta.url));const previous=globalThis.fetch;globalThis.fetch=async()=>new Response(original)
 try{
  const blob=await fillWord('/templates/sptjm-2026.docx',statementTemplateData(row,details));const files=unzipSync(new Uint8Array(await blob.arrayBuffer()));const xml=strFromU8(files['word/document.xml'])
  for(const text of ['Peserta Uji','MENGAKUI','Januari tahun 2024','Februari tahun 2025','081234567890','materai','(PPATK) Tahun 2025','PPATK Tahun 2025'])assert.ok(xml.includes(text),text)
  assert.ok(!xml.includes('PPATK Tahun 2026'));assert.ok(!xml.includes('(PPATK) Tahun 2026'));assert.ok(!/\{\w+\}/.test(xml));assert.deepEqual(Object.keys(files).sort(),Object.keys(unzipSync(original)).sort())
 }finally{globalThis.fetch=previous}
})

test('SPTJM database guards room, BAP revision and explicit confirmation',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   create table profiles(id uuid primary key,nama text,role text);
   create function public.current_app_role() returns text language sql stable security definer set search_path=public as $$select role from profiles where id=auth.uid()$$;
   create table discipline_datasets(id uuid primary key);create table interviewer_assignments(user_id uuid primary key,room_id text unique);
   insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000004');
   insert into profiles select id,'Petugas',case right(id::text,1) when '4' then 'viewer' else 'interviewer' end from auth.users;
   insert into interviewer_assignments values('00000000-0000-4000-8000-000000000001','room-1'),('00000000-0000-4000-8000-000000000002','room-2');grant select on interviewer_assignments to authenticated;`)
  await db.exec(await readFile(new URL('../supabase/interview-portal.sql',import.meta.url),'utf8'))
  await db.query("insert into interview_cases(nik,person,room_id,scheduled_date,scheduled_time,started_at,locked_by,status) values($1,$2,'room-1','2026-10-26','08:30','2026-10-26T01:00:00Z','00000000-0000-4000-8000-000000000001','Draf')",[row.nik,JSON.stringify(row.person)])
  await db.exec("insert into interview_cases(nik,person,room_id,scheduled_date,scheduled_time) values('2222222222222222','{}','room-2','2026-10-26','08:30')")
  await db.exec(await readFile(new URL('../supabase/interview-statements.sql',import.meta.url),'utf8'))
  async function actor(n){await db.exec(`reset role;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000${n}',false);set role authenticated`)}
  const save=async(rev,bapRev,data=details,confirm=false,nik=row.nik)=>(await db.query('select * from public.interview_statement_save($1,$2,$3,$4,$5)',[nik,rev,bapRev,data,confirm])).rows[0]
  await actor(1);assert.equal((await db.query('select * from interview_statements')).rows.length,1)
  await assert.rejects(save(1,1,details,false,'2222222222222222'),/FORBIDDEN/)
  await assert.rejects(save(1,1,details,true),/FINALIZE_BAP_FIRST/)
  let s=await save(1,1);assert.equal(s.confirmed_at,null)
  await db.exec("reset role;update interview_cases set status='Selesai',revision=2 where nik='1111111111111111'")
  await actor(1);await assert.rejects(save(s.revision,1,details,true),/CONFLICT/)
  await assert.rejects(save(s.revision,2,{...details,admission:''},true),/ADMISSION_REQUIRED/)
  await assert.rejects(save(s.revision,2,{...details,startMonth:'2025-03'},true),/INVALID_PERIOD/)
  s=await save(s.revision,2,details,true);assert.ok(s.confirmed_at);assert.equal(s.bap_revision,2)
  s=await save(s.revision,2,{...details,admission:'Tidak mengakui',activityState:'',startMonth:'',endMonth:''},true);assert.ok(s.confirmed_at)
  await assert.rejects(db.exec("update interview_statements set details='{}'"),/permission denied/)
  await actor(4);await assert.rejects(save(s.revision,2,details,true),/FORBIDDEN/)
  await db.exec("reset role;update interview_cases set status='Draf',revision=3 where nik='1111111111111111'")
  await actor(1);await assert.rejects(save(s.revision,3,details,true),/FINALIZE_BAP_FIRST/)
  s=await save(s.revision,3,details,false);assert.equal(s.confirmed_at,null)
 }finally{await db.close()}
})
