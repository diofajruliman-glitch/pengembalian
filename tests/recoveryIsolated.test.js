import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
test('same-project testing schema keeps production tables and API permissions isolated',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('00000000-0000-0000-0000-000000000001');create table public.profiles(id uuid primary key,role text);insert into public.profiles values('00000000-0000-0000-0000-000000000001','admin');create table public.bottlenecks(no integer);insert into public.bottlenecks values(42);create table public.action_plans(no integer);insert into public.action_plans values(99);create table public.sdm_cases(id integer);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function public.current_app_role() returns text language sql stable security definer as $$select role from public.profiles where id=auth.uid()$$;`)
  await db.exec(fs.readFileSync('supabase/recovery-isolated-test.sql','utf8'))
  await db.exec(fs.readFileSync('supabase/recovery-isolated-smoke.sql','utf8'))
  assert.deepEqual((await db.query('select no from public.bottlenecks')).rows,[{no:42}])
  assert.deepEqual((await db.query('select no from public.action_plans')).rows,[{no:99}])
  assert.equal((await db.query("select has_schema_privilege('authenticated','recovery_test','usage') allowed")).rows[0].allowed,false)
  assert.equal((await db.query("select has_function_privilege('authenticated','recovery_test.recovery_begin(text,text,integer,jsonb)','execute') allowed")).rows[0].allowed,false)
  assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='recovery_test' and c.relkind='r' and c.relrowsecurity")).rows[0].n,9)
  assert.equal((await db.query('select nominal from recovery_test.recovery_payments')).rows[0].nominal,0)
 }finally{await db.close()}
})
