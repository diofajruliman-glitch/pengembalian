import fs from 'node:fs'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {productionMasterClient} from '../../src/import/productionClient.js'
import {statusClient} from '../../src/recovery/nonactiveStatus.js'
import {followupClient} from '../../src/recovery/followups.js'
const admin='00000000-0000-0000-0000-000000000001',editor='00000000-0000-0000-0000-000000000002',viewer='00000000-0000-0000-0000-000000000003',url='https://tagokvlsirebfgltbxmq.supabase.co'
const readSql=path=>fs.readFileSync(path,'utf8')
export async function integratedDatabase({extensions=true}={}){
 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 insert into auth.users values('${admin}'),('${editor}'),('${viewer}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;`)
 await db.exec(readSql('supabase/schema.sql'))
 await db.exec(`insert into public.profiles(id,nama,role) values('${admin}','Admin simulasi','admin'),('${editor}','Editor simulasi','editor'),('${viewer}','Viewer simulasi','viewer');
 update public.action_plans set status='Selesai',progres=100 where no in (1,2);
 create schema recovery_test;create table recovery_test.sentinel(value int);insert into recovery_test.sentinel values(42);`)
 await db.exec(readSql('supabase/recovery-production-activation.sql'))
 if(extensions)await db.exec(readSql('supabase/recovery-integration-activation.sql'))
 return db
}
export function localApis(db){
 const transport={rpc:async(name,args)=>{
  assert.ok(['recovery_master_rpc','recovery_sdm_rpc','recovery_followup_rpc'].includes(name))
  try{return {data:(await db.query(`select public.${name}($1,$2) result`,[args.p_action,JSON.stringify(args.p_payload)])).rows[0].result}}catch(error){return {error}}
 }}
 return {master:productionMasterClient(transport,'production-master',url),sdm:statusClient(transport,'production-sdm',url),followup:followupClient(transport,'production-followup',url)}
}
