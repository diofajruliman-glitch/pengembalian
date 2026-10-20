import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {categoryState} from '../src/bap/categoryModel.js'

test('changed BAP invalidates submitted and decided categories in the comparison',()=>{
 assert.equal(categoryState({review_status:'Ditetapkan',decision_bap_revision:2},{revision:3}),'Perlu ditinjau ulang')
 assert.equal(categoryState({review_status:'Diajukan',proposal_bap_revision:2},{revision:3}),'Perlu ditinjau ulang')
 assert.equal(categoryState({review_status:'Ditetapkan',decision_bap_revision:2},{revision:2}),'Ditetapkan')
})

test('category workflow preserves initial snapshot, enforces room/reviewer permissions and tracks BAP revisions',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   create table public.profiles(id uuid primary key,nama text,role text);
   create function public.current_app_role() returns text language sql stable security definer set search_path=public as $$select role from profiles where id=auth.uid()$$;
   create table public.discipline_datasets(id uuid primary key,name text,version int,result jsonb);
   create table public.interviewer_assignments(user_id uuid primary key,room_id text unique);
   insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004');
   insert into profiles select id,'Petugas',case right(id::text,1) when '3' then 'admin' when '4' then 'viewer' else 'interviewer' end from auth.users;
   insert into interviewer_assignments values ('00000000-0000-4000-8000-000000000001','room-1'),('00000000-0000-4000-8000-000000000002','room-2');
   grant select on interviewer_assignments to authenticated;
   insert into discipline_datasets values ('10000000-0000-4000-8000-000000000001','Sumber awal',1,'{"rows":[{"nik":"1111111111111111","hasilPenilaian":"Terbukti","after":{"kategori":"Berat"},"historical":{"kategori":"Sedang"}}]}');`)
  await db.exec(await readFile(new URL('../supabase/interview-portal.sql',import.meta.url),'utf8'))
  await db.exec(`insert into interview_cases(nik,dataset_id,person,room_id,scheduled_date,scheduled_time,started_at,locked_by,status,answers) values
   ('1111111111111111','10000000-0000-4000-8000-000000000001','{}','room-1','2026-10-26','08:30',now(),'00000000-0000-4000-8000-000000000001','Draf','{"11":"Keterangan peserta","17":"Dokumen pendukung"}');`)
  await db.exec(await readFile(new URL('../supabase/interview-categories.sql',import.meta.url),'utf8'))
  // New schedule cases also get an initial snapshot automatically.
  await db.exec("insert into interview_cases(nik,person,room_id,scheduled_date,scheduled_time) values('2222222222222222','{}','room-2','2026-10-26','08:30')")
  const before=(await db.query("select initial_snapshot from interview_categories where nik='1111111111111111'")).rows[0].initial_snapshot
  assert.equal(before.afterCategory,'Berat');assert.equal(before.historicalCategory,'Sedang')
  await db.exec("update discipline_datasets set result='{}'")
  async function actor(n){await db.exec(`reset role;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000${n}',false);set role authenticated`)}
  const call=async(action,revision,bapRevision,payload,nik='1111111111111111')=>(await db.query('select * from public.interview_category_action($1,$2,$3,$4,$5)',[nik,action,revision,bapRevision,payload])).rows[0]
  const payload={category:'Ringan',reason:'Hasil wawancara dan dokumen pendukung telah diperiksa.',evidence:'Dokumen uji',questionRefs:[11,17]}
  await actor(1)
  assert.equal((await db.query('select * from interview_categories')).rows.length,1)
  await assert.rejects(call('draft',1,1,payload,'2222222222222222'),/FORBIDDEN/)
  await assert.rejects(call('draft',1,1,{...payload,questionRefs:[12]}),/UNANSWERED/)
  let r=await call('draft',1,1,payload);assert.deepEqual(r.initial_snapshot,before)
  await assert.rejects(call('submit',r.revision,1,payload),/SUBMISSION_INCOMPLETE/)
  await db.exec("reset role;update interview_cases set status='Selesai',revision=2 where nik='1111111111111111'")
  await actor(1);await assert.rejects(call('submit',r.revision,1,payload),/CONFLICT/)
  r=await call('submit',r.revision,2,payload);assert.equal(r.review_status,'Diajukan')
  await assert.rejects(call('approve',r.revision,2,{category:'Ringan',reason:payload.reason}),/ADMIN_REQUIRED/)
  await actor(4);await assert.rejects(call('draft',r.revision,2,payload),/FORBIDDEN/)
  await actor(3)
  await assert.rejects(db.exec("update interview_categories set initial_snapshot='{}'"),/permission denied/)
  r=await call('approve',r.revision,2,{category:'Sedang',reason:'Peninjau menilai bukti tambahan mendukung kategori sedang.'})
  assert.equal(r.final_category,'Sedang');assert.equal(r.proposed_category,'Ringan');assert.equal(r.review_status,'Ditetapkan');assert.deepEqual(r.initial_snapshot,before)
  await actor(1);await assert.rejects(call('draft',r.revision,2,payload),/FINALIZED/)
  assert.equal((await db.query('select * from interview_category_events')).rows.length,3)
  await db.exec("reset role;update interview_cases set status='Draf',revision=3 where nik='1111111111111111'")
  await actor(3);await assert.rejects(call('approve',r.revision,3,{category:'Ringan',reason:payload.reason}),/REVIEW_STALE/)
  await actor(1);r=await call('deepen',r.revision,3,{...payload,category:'Belum dapat disimpulkan'})
  assert.equal(r.review_status,'Perlu pendalaman');assert.equal(r.final_category,'');assert.deepEqual(r.initial_snapshot,before)
 }finally{await db.close()}
})
