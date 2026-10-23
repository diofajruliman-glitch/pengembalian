import test from 'node:test'
import assert from 'node:assert/strict'
import {act,reviseCase} from '../src/bap/api.js'

const row={nik:'1111111111111111',revision:3,status:'Selesai',locked_by:'petugas-1',answers:{1:'Keterangan awal'}}
const payload={reason:'Perbaikan BAP setelah selesai'}
function clientFor(rpc,latest={...row,revision:4},readError=null){
 const calls=[],reads=[]
 return {calls,reads,
  async rpc(name,args){calls.push({name,...args});return rpc(args,calls.length)},
  from(table){assert.equal(table,'interview_cases');return {
   select(columns){assert.equal(columns,'*');return this},
   eq(key,value){assert.equal(key,'nik');assert.equal(value,row.nik);reads.push(value);return this},
   async single(){return {data:typeof latest==='function'?latest(reads.length):latest,error:readError}}
  }}
 }
}

test('revision conflict reopens the latest completed BAP and returns its latest answers',async()=>{
 const latest={...row,revision:4,answers:{1:'Keterangan terbaru dari server'}}
 const client=clientFor((args,n)=>n===1?{error:{message:'INTERVIEW_CONFLICT'}}:{data:{...latest,revision:5,status:'Draf'}},latest)
 const result=await reviseCase(client,row,'petugas-1',payload)
 assert.equal(result.status,'Draf');assert.deepEqual(result.answers,latest.answers)
 assert.deepEqual(client.calls.map(c=>c.p_revision),[3,4]);assert.deepEqual(client.calls.map(c=>c.p_payload),[payload,payload])
})

test('lost revise response resumes the owned draft without another write or audit',async()=>{
 const latest={...row,revision:4,status:'Draf'}
 const client=clientFor(()=>({error:{message:'TypeError: Failed to fetch'}}),latest)
 assert.deepEqual(await reviseCase(client,row,'petugas-1',payload),latest)
 assert.equal(client.calls.length,1)
})

test('a request that never reached the server retries once with the server revision',async()=>{
 const client=clientFor((args,n)=>n===1?{error:new TypeError('Failed to fetch')}:{data:{...row,status:'Draf',revision:4}},row)
 assert.equal((await reviseCase(client,row,'petugas-1',payload)).status,'Draf')
 assert.equal(client.calls.length,2)
})

test('a delayed commit or lost retry response is reconciled without a third write',async()=>{
 for(const retryMessage of ['INTERVIEW_CONFLICT','TypeError: Failed to fetch']){
  const latest={...row,status:'Draf',revision:4}
  const client=clientFor((args,n)=>({error:{message:n===1?'TypeError: Failed to fetch':retryMessage}}),n=>n===1?row:latest)
  assert.deepEqual(await reviseCase(client,row,'petugas-1',payload),latest)
  assert.equal(client.calls.length,2);assert.equal(client.reads.length,2)
 }
})

test('revision recovery never takes over another handler draft or retries access denials',async()=>{
 const client=clientFor(()=>({error:{message:'INTERVIEW_CONFLICT'}}),{...row,revision:4,status:'Draf',locked_by:'petugas-2'})
 await assert.rejects(reviseCase(client,row,'petugas-1',payload),/petugas lain/);assert.equal(client.calls.length,1)
 for(const message of ['INTERVIEW_FORBIDDEN','INTERVIEW_LOCKED','INTERVIEW_INVALID_ACTION']){
  const denied=clientFor(()=>({error:{message}}))
  await assert.rejects(reviseCase(denied,row,'petugas-1',payload),e=>e.message===message)
  assert.equal(denied.reads.length,0);assert.equal(denied.calls.length,1)
 }
})

test('a second conflict or failed refresh stops recovery without changing the revision again',async()=>{
 const client=clientFor(()=>({error:{message:'INTERVIEW_CONFLICT'}}))
 await assert.rejects(reviseCase(client,row,'petugas-1',payload),e=>e.message==='INTERVIEW_CONFLICT');assert.equal(client.calls.length,2)
 const failed=clientFor(()=>({error:{message:'INTERVIEW_CONFLICT'}}),null,{message:'Failed to fetch'})
 await assert.rejects(reviseCase(failed,row,'petugas-1',payload),e=>e.message==='Failed to fetch');assert.equal(failed.calls.length,1)
})

test('answer saves keep their expected revision and never use revision recovery',async()=>{
 const client=clientFor(()=>({error:{message:'INTERVIEW_CONFLICT'}}))
 await assert.rejects(act(client,row,'save',{answers:row.answers,identity:{}}),e=>e.message==='INTERVIEW_CONFLICT')
 assert.equal(client.calls.length,1);assert.equal(client.reads.length,0)
})
