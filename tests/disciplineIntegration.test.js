import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {integratedDatabase} from './helpers/recoveryHarness.js'

test('discipline activation and writes preserve populated recovery tables, functions and permissions',async()=>{
 const db=await integratedDatabase()
 try{
  const tables=(await db.query(`select n.nspname,c.relname,c.relrowsecurity,c.relacl::text
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','recovery_live','recovery_test') and c.relkind='r'
   order by n.nspname,c.relname`)).rows
  const tableState=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>{
   const name=`"${table.nspname}"."${table.relname}"`
   return [name,(await db.query(`select to_jsonb(t) value from ${name} t order by 1`)).rows]
  })))
  const functionState=async()=>(await db.query(`select p.oid::regprocedure::text signature,
   pg_get_functiondef(p.oid) definition,p.proacl::text
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','recovery_live') and p.proname not like 'discipline_%'
   order by 1`)).rows
  const beforeTables=await tableState(),beforeFunctions=await functionState()
  const migration=fs.readFileSync('supabase/discipline-module.sql','utf8')
  await db.exec(migration)
  await db.exec(migration)
  const period={frekuensi:1,nominal:10000,dalam:0,luar:1,unknown:0,total:21,kategori:'Ringan',status:'Lengkap'}
  const result={rows:[{nik:'0000000000000001',nama:'SDM simulasi',nip:'',hasilPenilaian:'Terbukti',historical:{...period},before:{...period},after:{...period},audits:[]}],rules:{frequencyWeight:60,depositWeight:30,timeWeight:10},audits:[],stats:{total:1}}
  const rpc=async(action,payload)=>(await db.query('select public.discipline_rpc($1,$2) result',[action,JSON.stringify(payload)])).rows[0].result
  await db.exec("set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)")
  const saved=await rpc('save_version',{name:'Simulasi terpisah',filename:'simulasi.xlsx',result,requestId:'10000000-0000-0000-0000-000000000001'})
  await rpc('save_followup',{datasetId:saved.id,nik:'0000000000000001',patch:{notes:'Catatan simulasi'},expectedUpdatedAt:null})
  await rpc('archive',{id:saved.id})
  assert.equal((await rpc('load',{id:saved.id})).status,'archived')
  await db.exec('reset role')
  assert.deepEqual(await tableState(),beforeTables)
  assert.deepEqual(await functionState(),beforeFunctions)
  const existingMetadata=(await db.query(`select n.nspname,c.relname,c.relrowsecurity,c.relacl::text
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','recovery_live','recovery_test') and c.relkind='r' and c.relname not like 'discipline_%'
   order by n.nspname,c.relname`)).rows
  assert.deepEqual(existingMetadata,tables)
  assert.equal((await db.query('select count(*)::int count from public.action_plans')).rows[0].count,15)
 }finally{await db.close()}
})
