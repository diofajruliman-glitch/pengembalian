import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {prepareCaseLinkPayload} from '../src/recovery/caseLinks.js';
test('reference payload requires a persisted revision and reviewed versioned cases; no manual updates',()=>{
 const row={manual:{id:1,updated_at:'2026-01-01T00:00:00Z',status:'Proses Penagihan',pic:'Tetap'},master:{nip:'000000000000000901'},issues:[]};
 assert.deepEqual(prepareCaseLinkPayload({source:'database',revision:1},[row]),{p_revision:'1',p_cases:[{caseId:'1',expectedUpdatedAt:'2026-01-01T00:00:00Z'}]});
 assert.throws(()=>prepareCaseLinkPayload({source:'local',revision:1},[row]),/master tersimpan/);
 assert.throws(()=>prepareCaseLinkPayload({source:'database',revision:1},[{...row,issues:['Perlu tinjauan']}]),/ditahan/);
 assert.throws(()=>prepareCaseLinkPayload({source:'database',revision:1},[row,row]),/ganda/);
 assert.throws(()=>prepareCaseLinkPayload({source:'database',revision:1},[{...row,manual:{...row.manual,id:'sim-1'}}]),/tidak valid/);
})
test('PostgreSQL reference commit preserves manual data, audits once and rolls back stale cases atomically',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,role text);insert into auth.users values('00000000-0000-0000-0000-000000000001','admin'),('00000000-0000-0000-0000-000000000002','editor');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function public.current_app_role() returns text language sql stable security definer as $$select role from auth.users where id=auth.uid()$$;create table public.sdm_cases(id bigint primary key,nip text,nama text,bank text,status text,pic text,deadline date,catatan text,bukti text,kewajiban_total numeric,realisasi_total numeric,updated_at timestamptz not null,deleted_at timestamptz);`);
 await db.exec(fs.readFileSync('supabase/recovery-isolated-test.sql','utf8'));await db.exec(fs.readFileSync('supabase/recovery-case-links.draft.sql','utf8'));
 await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);insert into recovery_test.recovery_imports(id,file_name,file_sha256,actor,status) values('00000000-0000-0000-0000-000000000010','SIMULASI.xlsx',repeat('1',64),'00000000-0000-0000-0000-000000000001','committed');update recovery_test.recovery_revision set revision=1;
 insert into recovery_test.recovery_people(nip,nama,bank) values('000000000000000901','SDM SIMULASI 1','Mandiri'),('000000000000000902','SDM SIMULASI 2','BRI'),('000000000000000903','SDM SIMULASI 3','BSI');
 insert into recovery_test.recovery_obligations(nip,bank,jenis,tahun_kewajiban,nominal,source_import) select nip,bank,'TUKIN',2025,100000,'00000000-0000-0000-0000-000000000010' from recovery_test.recovery_people;
 insert into public.sdm_cases select row_number() over(order by nip),nip,nama,bank,'Proses Penagihan','PIC manual','2026-12-15'::date,'Catatan dipertahankan','Bukti manual',999,0,'2026-01-01T00:00:00Z'::timestamptz,null from recovery_test.recovery_people;`);
 const revision=async()=>(await db.query('select revision from recovery_test.recovery_revision')).rows[0].revision;
 const prepare=async(ids)=>{const cases=ids.map(id=>({caseId:String(id),expectedUpdatedAt:'2026-01-01T00:00:00Z'}));return (await db.query('select recovery_test.prepare_case_links($1,$2) id',[await revision(),JSON.stringify(cases)])).rows[0].id};
 const commit=(id,reason='Alasan simulasi')=>db.query('select recovery_test.commit_case_links($1,$2) result',[id,reason]);
 const before=(await db.query('select to_jsonb(c) image from public.sdm_cases c where id=1')).rows[0].image;
 const first=await prepare([1]);await assert.rejects(commit(first,''),/REASON_REQUIRED/);await commit(first);await commit(first);
 assert.deepEqual((await db.query('select to_jsonb(c) image from public.sdm_cases c where id=1')).rows[0].image,before);
 assert.equal((await db.query('select count(*)::int n from recovery_test.case_link_audit')).rows[0].n,1);
 const again=await prepare([1]);assert.equal((await commit(again)).rows[0].result.alreadyLinked,1);assert.equal((await db.query('select count(*)::int n from recovery_test.case_link_audit')).rows[0].n,1);
 const staleMaster=await prepare([2]);await db.exec('update recovery_test.recovery_revision set revision=revision+1');await assert.rejects(commit(staleMaster),/STALE_MASTER/);
 const partial=await prepare([2,3]);await db.exec("update public.sdm_cases set catatan='Perubahan saat tinjauan' where id=3");await assert.rejects(commit(partial),/STALE_CASE/);
 assert.equal((await db.query('select count(*)::int n from recovery_test.case_master_links')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from recovery_test.case_link_audit')).rows[0].n,1);
 await db.exec("update public.sdm_cases set nama='Nama berbeda' where id=2");await assert.rejects(prepare([2]),/CASE_NAME_MISMATCH/);await db.exec("update public.sdm_cases set nama='SDM SIMULASI 2',deleted_at=now() where id=2");await assert.rejects(prepare([2]),/CASE_ARCHIVED/);await db.exec("update public.sdm_cases set deleted_at=null,status='Lunas Terverifikasi' where id=2");await assert.rejects(prepare([2]),/CASE_VERIFICATION_REQUIRES_REVIEW/);
 await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)");await assert.rejects(commit(first),/FORBIDDEN/);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from recovery_test.case_master_links'),/permission denied/);
 }finally{await db.close()}
})
