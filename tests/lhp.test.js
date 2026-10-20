import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {unzipSync,strFromU8} from 'fflate'
import {generatedReport,reportReadiness,reportTemplateData,sameVersions} from '../src/bap/lhpModel.js'
import {fillWord} from '../src/bap/documents.js'
const row={nik:'1111111111111111',person:{nik:'1111111111111111',nip:'123456789012345678',nama:'Peserta Uji',jabatan:'Jabatan uji',unitKerja:'PSNK'},identity_details:{kota:'Jakarta'},started_at:'2026-10-26T01:00:00Z',status:'Selesai',revision:2,answers:{11:'Tidak mengakui',22:'Penutup lengkap & benar'}}
const source={case:row,category:{initial_snapshot:{afterCategory:'Berat'},review_status:'Ditetapkan',decision_bap_revision:2,final_category:'Tidak terbukti'},statement:{confirmed_at:'2026-10-26',bap_revision:2},versions:{bap:2,category:3,statement:4}}
test('LHP preserves testimony, missing metrics and explicit recommendation',async()=>{
 const sections=generatedReport(source)
 assert.equal(sections.rekomendasi,'');assert.ok(sections.temuan.includes('Belum tersedia pada sumber'));assert.ok(!sections.temuan.includes('Rp 0'));assert.ok(sections.fakta.includes(row.answers[22]));assert.ok(sections.kesimpulan.includes('Tidak terbukti'));assert.equal(reportReadiness(source).length,0)
 assert.equal(reportReadiness({...source,case:{...row,revision:3}}).length,2);assert.equal(sameVersions(source.versions,{...source.versions,statement:5}),false)
 const previous=globalThis.fetch;globalThis.fetch=async()=>new Response(await readFile(new URL('../public/templates/lhp-draft-2026.docx',import.meta.url)))
 try{const blob=await fillWord('',reportTemplateData(source,{sections,kota:'Jakarta'}));const files=unzipSync(new Uint8Array(await blob.arrayBuffer())),xml=strFromU8(files['word/document.xml']);assert.ok(xml.includes('DRAF'));assert.ok(xml.includes('PPATK Tahun 2025'));assert.ok(xml.includes('Penutup lengkap &amp; benar'));assert.ok(!/\{\w+\}/.test(xml))}finally{globalThis.fetch=previous}
})
test('LHP enforces room, source versions, review readiness and manual recommendations',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   create table profiles(id uuid primary key,nama text,role text);
   create function public.current_app_role() returns text language sql stable security definer set search_path=public as $$select role from profiles where id=auth.uid()$$;
   create table discipline_datasets(id uuid primary key,name text,version integer,result jsonb);create table interviewer_assignments(user_id uuid primary key,room_id text unique);
   insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000004');
   insert into profiles select id,'Petugas',case right(id::text,1) when '4' then 'viewer' else 'interviewer' end from auth.users;
   insert into interviewer_assignments values('00000000-0000-4000-8000-000000000001','room-1'),('00000000-0000-4000-8000-000000000002','room-2');grant select on interviewer_assignments to authenticated;`)
  await db.exec(await readFile(new URL('../supabase/interview-portal.sql',import.meta.url),'utf8'))
  await db.query("insert into interview_cases(nik,person,room_id,scheduled_date,scheduled_time,started_at,locked_by,status) values($1,$2,'room-1','2026-10-26','08:30','2026-10-26T01:00:00Z','00000000-0000-4000-8000-000000000001','Draf')",[row.nik,JSON.stringify(row.person)])
  await db.exec("insert into interview_cases(nik,person,room_id,scheduled_date,scheduled_time) values('2222222222222222','{}','room-2','2026-10-26','08:30')")
  await db.exec(await readFile(new URL('../supabase/interview-categories.sql',import.meta.url),'utf8'))
  await db.exec(await readFile(new URL('../supabase/interview-statements.sql',import.meta.url),'utf8'))
  await db.exec(await readFile(new URL('../supabase/interview-reports.sql',import.meta.url),'utf8'))

 async function actor(n){await db.exec(`reset role;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000${n}',false);set role authenticated`)}
 const load=async(nik=row.nik)=>(await db.query('select interview_report_source($1) as source',[nik])).rows[0].source
 const sections={...generatedReport(source),rekomendasi:'Pemeriksaan bukti pendukung lebih lanjut oleh tim berwenang.'}
 const save=async(rev,versions,review=false,content=sections)=>(await db.query('select * from interview_report_save($1,$2,$3,$4,$5,$6,$7)',[row.nik,rev,versions,content,'','Jakarta',review])).rows[0]
 await actor(1);assert.equal((await db.query('select * from interview_reports')).rows.length,1)
 await assert.rejects(load('2222222222222222'),/FORBIDDEN/)
 let current=await load();assert.deepEqual(current.metrics,{})
 await assert.rejects(save(1,current.versions,true),/SOURCES_NOT_READY/)
 let report=await save(1,current.versions);assert.equal(report.reviewed_at,null)
 await assert.rejects(save(1,current.versions),/CONFLICT/)
 await assert.rejects(save(report.revision,{...current.versions,bap:9}),/CONFLICT/)
 await db.exec("reset role;update interview_cases set status='Selesai' where nik='1111111111111111';update interview_categories set review_status='Ditetapkan',decision_bap_revision=1,final_category='Ringan' where nik='1111111111111111';update interview_statements set bap_revision=1,confirmed_at=now() where nik='1111111111111111'")
 await actor(1);current=await load()
 await assert.rejects(save(report.revision,current.versions,true,{...sections,rekomendasi:''}),/INCOMPLETE/)
 await assert.rejects(save(report.revision,current.versions,true,{...sections,rekomendasi:'Teguran'}),/RECOMMENDATION_REQUIRED/)
 report=await save(report.revision,current.versions,true);assert.ok(report.reviewed_at)
 await assert.rejects(db.exec("update interview_reports set sections='{}'"),/permission denied/)
 await actor(4);await assert.rejects(save(report.revision,current.versions),/FORBIDDEN/)
 await db.exec("reset role;update interview_statements set revision=revision+1 where nik='1111111111111111'");await actor(1)
 await assert.rejects(save(report.revision,current.versions,true),/CONFLICT/)
 current=await load();report=await save(report.revision,current.versions);assert.equal(report.reviewed_at,null)
 }finally{await db.close()}
})
