import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {integratedDatabase} from './helpers/recoveryHarness.js'
const sql=fs.readFileSync('supabase/recovery-integration-activation.sql','utf8')
test('combined activation is atomic, preserves populated tables and rejects a repeat without side effects',async()=>{
 const db=await integratedDatabase({extensions:false})
 try{
  await db.exec("insert into recovery_live.recovery_people(nip,nama,bank,status_sdm) values('000000000000000001','Sentinel lokal','BRI','BUP')")
  const image=async()=>Object.fromEntries(await Promise.all(['public.profiles','public.bottlenecks','public.action_plans','public.bank_recap','public.audit_events','recovery_live.recovery_people','recovery_live.recovery_revision'].map(async table=>[table,(await db.query(`select to_jsonb(t) value from ${table} t order by 1`)).rows])))
  const before=await image()
  // Failure after creating all extensions must roll back their tables and RPCs.
  await assert.rejects(db.exec(sql.replace(/commit;\s*$/,'select 1/0;\ncommit;')),/division by zero/)
  await db.exec('rollback')
  for(const name of ['sdm_status_batches','followup_links'])assert.equal((await db.query('select to_regclass($1) value',['recovery_live.'+name])).rows[0].value,null)
  for(const name of ['recovery_sdm_rpc','recovery_followup_rpc'])assert.equal((await db.query('select to_regprocedure($1) value',['public.'+name+'(text,jsonb)'])).rows[0].value,null)
  assert.deepEqual(await image(),before)
  await db.exec(sql)
  assert.deepEqual(await image(),before)
  assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='recovery_live' and c.relkind='r' and c.relrowsecurity")).rows[0].n,19)
  assert.equal((await db.query('select count(*)::int n from recovery_live.followup_links')).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from recovery_live.sdm_status_changes')).rows[0].n,0)
  await assert.rejects(db.exec(sql),/INTEGRATION_ALREADY_PRESENT/);await db.exec('rollback')
  assert.deepEqual(await image(),before)
  for(const name of ['recovery_master_rpc','recovery_sdm_rpc','recovery_followup_rpc']){
   assert.equal((await db.query("select has_function_privilege('anon',$1,'execute') yes",['public.'+name+'(text,jsonb)'])).rows[0].yes,false)
  }
 }finally{await db.close()}
})
