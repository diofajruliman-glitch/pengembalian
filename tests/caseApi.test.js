import test from 'node:test'
import assert from 'node:assert/strict'
import {caseTestClient,prepareReferences,commitReferences} from '../src/recovery/caseApi.js'
test('case test API stays off by default and never calls a generic write endpoint',async()=>{
 const calls=[],base={rpc:async(...args)=>{calls.push(args);return {data:'batch'}}}
 assert.equal(caseTestClient(base,'','https://tagokvlsirebfgltbxmq.supabase.co'),null)
 assert.equal(caseTestClient(base,'case-test','https://wrong.supabase.co'),null)
 const client=caseTestClient(base,'case-test','https://tagokvlsirebfgltbxmq.supabase.co')
 await client.rpc('recovery_linked_meta');assert.equal(calls[0][0],'recovery_case_test_rpc')
 assert.throws(()=>client.rpc('update_cases',{}),/tidak diizinkan/)
 const row={issues:[],master:{},manual:{id:1,updated_at:'2026-01-01T00:00:00Z'}}
 await prepareReferences(client,{source:'database',revision:1},[row]);assert.deepEqual(calls.at(-1)[1].p_payload.p_cases,[{caseId:'1',expectedUpdatedAt:'2026-01-01T00:00:00Z'}])
 await assert.rejects(commitReferences(client,'batch',''),/alasan/);assert.equal(calls.at(-1)[1].p_action,'case_prepare')
 await commitReferences(client,'batch','Persetujuan simulasi');assert.equal(calls.at(-1)[1].p_action,'case_commit')
})
