import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('metadata preflight works before activation and verifies isolation after migration without writes',async()=>{
 const db=new PGlite()
 const check=fs.readFileSync('supabase/discipline-preflight.sql','utf8')
 const migration=fs.readFileSync('supabase/discipline-module.sql','utf8')
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
   create function public.current_app_role() returns text language sql stable as $$select null::text$$;
   create table public.recovery_preflight_sentinel(value integer);
   insert into public.recovery_preflight_sentinel values(42);`)
  const before=await db.exec(check)
  assert.ok(before[1].rows.every(row=>row.ready))
  assert.equal(before[2].rows.length,3)
  assert.ok(before[2].rows.every(row=>!row.installed))
  assert.deepEqual(before[3].rows,[])
  assert.equal(before[4].rows[0].installed,false)
  await db.exec(migration)
  const after=await db.exec(check)
  assert.ok(after[2].rows.every(row=>row.installed&&row.rls_enabled))
  assert.equal(after[3].rows.length,6)
  assert.ok(after[3].rows.every(row=>row.direct_table_access===false))
  const rpc=after[4].rows[0]
  assert.equal(rpc.installed,true)
  assert.equal(rpc.security_definer,true)
  assert.equal(rpc.authenticated_can_call,true)
  assert.equal(rpc.anonymous_can_call,false)
  assert.ok(rpc.function_settings.includes('search_path=pg_catalog, public'))
  assert.equal((await db.query('select count(*)::int as count from public.discipline_datasets')).rows[0].count,0)
  assert.equal((await db.query('select value from public.recovery_preflight_sentinel')).rows[0].value,42)
 }finally{await db.close()}
})
