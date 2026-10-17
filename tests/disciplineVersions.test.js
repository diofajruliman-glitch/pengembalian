import test from 'node:test'
import assert from 'node:assert/strict'
import {persistVersionChain,removeVersionFromSnapshot} from '../src/judol/versions.js'
const snapshot=()=>({name:'Uji',filename:'sumber.xlsx',active:2,versions:[{number:1,result:{rules:{threshold:1}},followups:[]},{number:2,parentIndex:0,result:{rules:{threshold:2}},followups:[]},{number:3,parentIndex:1,result:{rules:{threshold:3}},followups:[]}]})
const requestIds=()=>{let number=0;return()=>`00000000-0000-4000-8000-${String(++number).padStart(12,'0')}`}
test('saving unsaved version 3 saves its ancestors in order and preserves parameter snapshots',async()=>{
 const input=snapshot(),calls=[],saved=new Map()
 const storage={saveVersion:async p=>{calls.push(p);const value={id:`id-${calls.length}`,version:p.parentId?saved.get(p.parentId).version+1:1,status:'active',createdAt:'2026-10-16T00:00:00Z'};saved.set(value.id,value);return value}}
 const result=await persistVersionChain({snapshot:input,storage,createRequestId:requestIds()})
 assert.deepEqual(calls.map(p=>p.parentId),[null,'id-1','id-2'])
 assert.deepEqual(result.versions.map(v=>v.number),[1,2,3])
 assert.deepEqual(calls.map(p=>p.result.rules.threshold),[1,2,3])
 assert.equal(new Set(calls.map(p=>p.requestId)).size,3)
 assert.deepEqual(result.versions.map(v=>v.requestId),calls.map(p=>p.requestId))
 assert.equal(input.versions[0].id,undefined)
 assert.equal(input.versions[0].requestId,undefined)
})
test('session cancellation after response preserves only the preflight retry key and prevents further writes',async()=>{
 let live=true,writes=0
 const progress=[]
 const storage={saveVersion:async()=>{writes++;live=false;return {id:'old-user-id',version:1}}}
 const result=await persistVersionChain({snapshot:snapshot(),storage,isActive:()=>live,onProgress:value=>progress.push(value),createRequestId:requestIds()})
 assert.equal(result.cancelled,true);assert.equal(writes,1);assert.equal(progress.length,1)
 assert.ok(progress[0][0].requestId);assert.equal(progress[0][0].id,undefined)
 assert.equal(result.versions.some(v=>v.id),false)
})
test('saved parents are reused and failed followups remain explicitly pending',async()=>{
 const input=snapshot();input.versions[0].id='existing';input.active=1;input.versions[1].followups=[{nik:'0000000000000001',notes:'Catatan'}]
 let calls=0
 const storage={saveVersion:async p=>{calls++;assert.equal(p.parentId,'existing');return {id:'next',version:2,status:'active'}},saveFollowup:async()=>{throw Error('Koneksi terputus')}}
 const result=await persistVersionChain({snapshot:input,storage,createRequestId:requestIds()})
 assert.equal(calls,1);assert.equal(result.pending,true);assert.equal(result.versions[1].followups[0].pending,true)
 assert.equal(result.versions[1].followups[0].expectedUpdatedAt,null)
})
test('a committed save with a lost response reuses the published request key on retry',async()=>{
 const input=snapshot();input.active=0
 let current=input,lost=true,created=0
 const requests=[],records=new Map(),createRequestId=requestIds()
 const storage={saveVersion:async payload=>{
  assert.equal(current.versions[0].requestId,payload.requestId,'key must be published before the request')
  requests.push(payload)
  if(!records.has(payload.requestId))records.set(payload.requestId,{id:`id-${++created}`,version:1,status:'active'})
  if(lost){lost=false;throw Error('Response lost after commit')}
  return records.get(payload.requestId)
 }}
 const persist=()=>persistVersionChain({snapshot:current,storage,createRequestId,onProgress:versions=>{current={...current,versions}}})
 await assert.rejects(persist(),/Response lost/)
 assert.ok(current.versions[0].requestId);assert.equal(current.versions[0].id,undefined)
 const result=await persist()
 assert.equal(created,1);assert.equal(requests.length,2)
 assert.equal(requests[0].requestId,requests[1].requestId)
 assert.equal(result.versions[0].id,'id-1')
})
test('retry after an ancestor response loss reuses saved parents and the failed ancestor key',async()=>{
 let current=snapshot(),lost=true,created=0
 const records=new Map(),requests=[],createRequestId=requestIds()
 const storage={saveVersion:async payload=>{
  requests.push(payload)
  if(!records.has(payload.requestId))records.set(payload.requestId,{id:`id-${++created}`,version:payload.result.rules.threshold,status:'active'})
  if(payload.result.rules.threshold===2&&lost){lost=false;throw Error('Ancestor response lost')}
  return records.get(payload.requestId)
 }}
 const persist=()=>persistVersionChain({snapshot:current,storage,createRequestId,onProgress:versions=>{current={...current,versions}}})
 await assert.rejects(persist(),/Ancestor response lost/)
 assert.equal(current.versions[0].id,'id-1')
 assert.ok(current.versions[1].requestId);assert.equal(current.versions[1].id,undefined)
 const result=await persist()
 assert.equal(created,3)
 assert.deepEqual(requests.map(p=>p.result.rules.threshold),[1,2,2,3])
 assert.equal(requests[1].requestId,requests[2].requestId)
 assert.deepEqual(requests.map(p=>p.parentId),[null,'id-1','id-1','id-2'])
 assert.deepEqual(result.versions.map(v=>v.id),['id-1','id-2','id-3'])
})
test('an inactive session creates no retry key, writes, or progress',async()=>{
 let progress=0,writes=0,keys=0
 const result=await persistVersionChain({snapshot:snapshot(),isActive:()=>false,onProgress:()=>progress++,createRequestId:()=>{keys++;return 'unused'},storage:{saveVersion:async()=>{writes++}}})
 assert.equal(result.cancelled,true);assert.equal(keys,0);assert.equal(writes,0);assert.equal(progress,0)
})
test('cancellation during retry-key publication prevents the outgoing write',async()=>{
 let live=true,writes=0
 const result=await persistVersionChain({snapshot:snapshot(),isActive:()=>live,onProgress:()=>{live=false},createRequestId:requestIds(),storage:{saveVersion:async()=>{writes++}}})
 assert.equal(result.cancelled,true);assert.equal(writes,0)
})
test('saved versions retry pending followups only, retaining the original concurrency expectation',async()=>{
 const input=snapshot();input.active=0
 const savedAt='2026-10-16T01:00:00Z',calls=[]
 input.versions[0]={...input.versions[0],id:'existing',followups:[
  {nik:'0000000000000001',notes:'Saved',updatedAt:savedAt},
  {nik:'0000000000000002',notes:'Retry create',pending:true,updatedAt:'client-local-time'},
  {nik:'0000000000000003',notes:'Retry edit',pending:true,expectedUpdatedAt:savedAt}
 ]}
 const storage={saveVersion:async()=>assert.fail('saved versions must not be duplicated'),saveFollowup:async payload=>{calls.push(payload);return {nik:payload.nik,notes:payload.patch.notes,updatedAt:'2026-10-16T02:00:00Z'}}}
 const result=await persistVersionChain({snapshot:input,storage})
 assert.equal(result.pending,false)
 assert.deepEqual(calls.map(p=>[p.nik,p.expectedUpdatedAt]),[['0000000000000002',null],['0000000000000003',savedAt]])
 assert.equal(result.versions[0].followups.some(f=>f.pending),false)
 assert.equal(result.versions[0].followups[1].expectedUpdatedAt,undefined)
 assert.equal(input.versions[0].followups[1].pending,true)
})
test('a followup conflict retains the draft and original expectation without rebasing',async()=>{
 const input=snapshot();input.active=0
 const expectedUpdatedAt='2026-10-16T01:00:00Z'
 input.versions[0]={...input.versions[0],id:'existing',followups:[{nik:'0000000000000001',notes:'Local draft',pending:true,expectedUpdatedAt}]}
 const error=Object.assign(Error('Catatan sudah berubah'),{code:'DISCIPLINE_FOLLOWUP_CONFLICT'})
 const result=await persistVersionChain({snapshot:input,storage:{saveFollowup:async()=>{throw error}}})
 const draft=result.versions[0].followups[0]
 assert.equal(result.pending,true);assert.equal(draft.pending,true)
 assert.equal(draft.notes,'Local draft');assert.equal(draft.expectedUpdatedAt,expectedUpdatedAt)
 assert.equal(draft.pendingCode,'DISCIPLINE_FOLLOWUP_CONFLICT');assert.equal(draft.pendingError,error.message)
})
test('an archive response preserves pending drafts and stops further followup writes',async()=>{
 const input=snapshot();input.active=0
 input.versions[0]={...input.versions[0],id:'existing',followups:[{nik:'0000000000000001',notes:'First draft',pending:true},{nik:'0000000000000002',notes:'Second draft',pending:true}]}
 let calls=0
 const storage={saveFollowup:async()=>{calls++;throw Object.assign(Error('Dataset diarsipkan'),{code:'DISCIPLINE_ARCHIVED'})}}
 const result=await persistVersionChain({snapshot:input,storage})
 assert.equal(calls,1);assert.equal(result.pending,true);assert.equal(result.versions[0].status,'archived')
 assert.equal(result.versions[0].followups.every(f=>f.pending),true)
 assert.deepEqual(result.versions[0].followups.map(f=>f.notes),['First draft','Second draft'])
 const retry=await persistVersionChain({snapshot:{...input,versions:result.versions},storage})
 assert.equal(calls,1);assert.equal(retry.pending,true)
})
test('saved id and pending draft are published before followup requests, and followup cancellation cannot restore data',async()=>{
 const input=snapshot();input.active=0;input.versions[0].followups=[{nik:'0000000000000001',updatedAt:'client-time',notes:'Local'}]
 let live=true,current=input,progress=0
 const storage={saveVersion:async()=>({id:'saved',version:1,status:'active'}),saveFollowup:async payload=>{
  assert.equal(current.versions[0].id,'saved');assert.equal(current.versions[0].followups[0].pending,true)
  assert.equal(payload.expectedUpdatedAt,null)
  live=false;return {nik:payload.nik,notes:'Server result',updatedAt:'server-time'}
 }}
 const result=await persistVersionChain({snapshot:input,storage,isActive:()=>live,createRequestId:requestIds(),onProgress:versions=>{current={...current,versions};progress++}})
 assert.equal(result.cancelled,true);assert.equal(progress,2)
 assert.equal(current.versions[0].followups[0].notes,'Local')
 assert.equal(current.versions[0].followups[0].pending,true)
})
test('removeVersionFromSnapshot removes a version, reparents descendants, and updates active index',()=>{
 const input=snapshot()
 const res1=removeVersionFromSnapshot(input,1)
 assert.equal(res1.versions.length,2)
 assert.equal(res1.versions[0].number,1)
 assert.equal(res1.versions[1].number,3)
 assert.equal(res1.versions[1].parentIndex,0)
 assert.equal(res1.active,1)

 const res2=removeVersionFromSnapshot(input,2)
 assert.equal(res2.versions.length,2)
 assert.equal(res2.active,1)

 const single={name:'Uji',versions:[{number:1}],active:0}
 const res3=removeVersionFromSnapshot(single,0)
 assert.equal(res3,null)
})
