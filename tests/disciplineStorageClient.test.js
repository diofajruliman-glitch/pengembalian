import test from 'node:test'
import assert from 'node:assert/strict'
import {disciplineStorage} from '../src/judol/storage.js'

const makeClient=()=>{
 const calls=[]
 const client=disciplineStorage({rpc:async(name,payload)=>{calls.push({name,...payload});return {data:{ok:true},error:null}}})
 return {client,calls}
}

test('version save sends the stable request key and strips directories from the source filename',async()=>{
 const {client,calls}=makeClient(),requestId='00000000-0000-4000-8000-000000000001',result={rows:[]}
 await client.saveVersion({name:'Dataset',filename:'C:\\sumber\\final.xlsx',result,parentId:'parent',requestId})
 assert.deepEqual(calls,[{name:'discipline_rpc',p_action:'save_version',p_payload:{name:'Dataset',filename:'final.xlsx',result,parentId:'parent',requestId}}])
})

test('legacy save calls omit the request key rather than sending null',async()=>{
 const {client,calls}=makeClient()
 await client.saveVersion({name:'Dataset',filename:'final.xlsx',result:{rows:[]}})
 assert.equal(Object.hasOwn(calls[0].p_payload,'requestId'),false)
 assert.equal(calls[0].p_payload.parentId,null)
})

test('followup expectations distinguish explicit create, known revision, and legacy omission',async()=>{
 const {client,calls}=makeClient(),base={datasetId:'dataset',nik:'0000000000000001',patch:{notes:'Draft',updatedAt:'not-a-revision',pending:true,expectedUpdatedAt:'not-from-patch'}}
 await client.saveFollowup(base)
 await client.saveFollowup({...base,expectedUpdatedAt:null})
 await client.saveFollowup({...base,expectedUpdatedAt:'2026-10-16T00:00:00Z'})
 assert.equal(Object.hasOwn(calls[0].p_payload,'expectedUpdatedAt'),false)
 assert.equal(calls[1].p_payload.expectedUpdatedAt,null)
 assert.equal(calls[2].p_payload.expectedUpdatedAt,'2026-10-16T00:00:00Z')
 for(const call of calls)assert.deepEqual(call.p_payload.patch,{notes:'Draft'})
})

for(const code of ['DISCIPLINE_REQUEST_CONFLICT','DISCIPLINE_FOLLOWUP_CONFLICT']){
 test(`${code} remains identifiable with a friendly message`,async()=>{
  const client=disciplineStorage({rpc:async()=>({error:{code:'P0001',message:`${code}: private backend details`}})})
  await assert.rejects(client.saveVersion({name:'X',result:{}}),error=>error.code===code&&!error.message.includes('private backend details')&&error.message.length>30)
 })
}

test('a rejected transport is wrapped without discarding a recognized conflict code',async()=>{
 const client=disciplineStorage({rpc:async()=>{throw Error('DISCIPLINE_FOLLOWUP_CONFLICT')}})
 await assert.rejects(client.saveFollowup({datasetId:'dataset',nik:'0000000000000001',patch:{notes:'Draft'}}),error=>error.code==='DISCIPLINE_FOLLOWUP_CONFLICT')
})
