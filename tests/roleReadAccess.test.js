import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {integratedDatabase} from './helpers/recoveryHarness.js'

test('editor/viewer read identical master, metadata and links but cannot import or mutate master',async()=>{
 const db=await integratedDatabase()
 try{
  await db.exec(fs.readFileSync('supabase/recovery-source-metadata-activation.sql','utf8'))
  await db.exec("insert into recovery_live.recovery_people(nip,nama,provinsi,bank,status_sdm) values('000000000000000001','Simulasi','Simulasi','BRI','Aktif')")
  const migration=fs.readFileSync('supabase/recovery-role-read-access.sql','utf8')
  await db.exec(migration);await db.exec(migration)
  const rpc=async(name,action,payload={})=>(await db.query(`select public.${name}($1,$2) result`,[action,JSON.stringify(payload)])).rows[0].result
  const reads=[['recovery_master_rpc','recovery_read_meta'],['recovery_master_rpc','recovery_read_page'],['recovery_master_rpc','recovery_linked_meta'],['recovery_master_rpc','recovery_linked_cases'],['recovery_metadata_rpc','meta'],['recovery_metadata_rpc','page'],['recovery_metadata_rpc','references'],['recovery_followup_rpc','meta',{type:'action',target:1}],['recovery_followup_rpc','page',{type:'action',target:1}]]
  await db.exec("set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)")
  const expected=[];for(const args of reads)expected.push(await rpc(...args))
  const tables=['bottlenecks','action_plans','bank_recap','sdm_cases']
  const readTables=async()=>Promise.all(tables.map(async table=>(await db.query(`select * from public.${table} order by 1`)).rows))
  const expectedTables=await readTables()
  for(const id of ['00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003']){
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
   for(let i=0;i<reads.length;i++)assert.deepEqual(await rpc(...reads[i]),expected[i])
   assert.deepEqual(await readTables(),expectedTables)
   for(const action of ['recovery_begin','recovery_append','recovery_validate','recovery_diff','recovery_commit','case_prepare','case_commit'])await assert.rejects(rpc('recovery_master_rpc',action),/FORBIDDEN/)
   for(const action of ['prepare','commit'])await assert.rejects(rpc('recovery_metadata_rpc',action),/FORBIDDEN/)
   await assert.rejects(rpc('recovery_followup_rpc','save'),/FORBIDDEN/)
   await assert.rejects(rpc('recovery_sdm_rpc','prepare'),/FORBIDDEN/)
   await assert.rejects(db.query('select * from recovery_live.recovery_people'),/permission denied/)
  }
  await db.query("select set_config('request.jwt.claim.sub','',false)")
  await assert.rejects(rpc('recovery_master_rpc','recovery_read_meta'),/FORBIDDEN/)
 }finally{await db.close()}
})
