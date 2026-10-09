import test from 'node:test'
import assert from 'node:assert/strict'
import {stagingEnabled,stageBatch,batchChanges,commitBatch} from '../src/import/batchTransport.js'
test('production and invalid endpoints never enable staging imports',()=>{
 assert.equal(stagingEnabled('staging','https://tagokvlsirebfgltbxmq.supabase.co'),false)
 assert.equal(stagingEnabled('production','https://testing.supabase.co'),false)
 assert.equal(stagingEnabled('staging','https://testing.supabase.co.evil.test'),false)
 assert.equal(stagingEnabled('staging','http://testing.supabase.co'),false)
 assert.equal(stagingEnabled('staging','https://testing.supabase.co'),true)
})
const results=[{issues:[],people:[{nip:'000000000000000001'}],obligations:[],payments:[]}]
test('failed staging stops before validation and never commits',async()=>{
 const calls=[];const client={rpc:async(name)=>{calls.push(name);return name==='recovery_append'?{error:Error('Connection failed')}:{data:'batch'}}}
 await assert.rejects(stageBatch(client,{fileName:'test.xlsx',sha256:'a'.repeat(64),results,recap:{}}),/Connection failed/)
 assert.deepEqual(calls,['recovery_begin','recovery_append'])
})
test('staging, review and explicit commit remain separate operations',async()=>{
 const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='recovery_begin'?'batch':name==='recovery_diff'?[]:{}}}}
 const batch=await stageBatch(client,{fileName:'test.xlsx',sha256:'a'.repeat(64),results,recap:{}})
 assert.equal(batch.id,'batch');assert.deepEqual(calls.map(c=>c.name),['recovery_begin','recovery_append','recovery_validate'])
 await batchChanges(client,batch.id,50);assert.equal(calls.at(-1).args.p_offset,50)
 await assert.rejects(commitBatch(client,batch.id,'  '),/Alasan/)
 assert.equal(calls.at(-1).name,'recovery_diff')
 await commitBatch(client,batch.id,'Impor pengujian');assert.equal(calls.at(-1).name,'recovery_commit')
})
