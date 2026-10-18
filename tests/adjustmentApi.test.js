import test from 'node:test'
import assert from 'node:assert/strict'
import {adjustmentApi} from '../src/adjustments/api.js'

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
const turn=()=>new Promise(resolve=>setImmediate(resolve))

test('recap queries from different views share one connection lane; manifest and history remain available',async()=>{
 const pending=[],calls=[]
 const client={rpc(name,{p_action,p_payload}){
  calls.push(p_action)
  if(p_action!=='query')return Promise.resolve({data:p_action==='manifest'?{importId:1,preparedAt:'v1'}:{rows:[]}})
  const wait=deferred();pending.push(wait);return wait.promise
 }}
 const main=adjustmentApi(client),dialog=adjustmentApi(client)
 const first=main.query({},0),second=dialog.query({month:'Oktober'},0)
 assert.equal(pending.length,1)
 assert.equal((await main.manifest()).importId,1)
 assert.deepEqual((await dialog.history('000000000000000001')).rows,[])
 pending[0].resolve({data:{page:0}});assert.deepEqual(await first,{page:0})
 await turn();assert.equal(pending.length,2)
 pending[1].resolve({data:{page:1}});assert.deepEqual(await second,{page:1})
 assert.equal(calls.filter(action=>action==='query').length,2)
})

test('cancelled queued filters never reach the database and reject before the active query finishes',async()=>{
 const wait=deferred();let queries=0
 const client={rpc(){queries++;return queries===1?wait.promise:Promise.resolve({data:{ok:true}})}}
 const api=adjustmentApi(client),first=api.query({},0),controller=new AbortController()
 const obsolete=api.query({search:'old'},0,controller.signal)
 const rejected=assert.rejects(obsolete,{name:'AbortError'});controller.abort();await rejected
 assert.equal(queries,1)
 wait.resolve({data:{ok:true}});await first
 assert.deepEqual(await api.query({search:'new'},0),{ok:true});assert.equal(queries,2)
 const cancelled=new AbortController();cancelled.abort()
 await assert.rejects(api.query({},0,cancelled.signal),{name:'AbortError'});assert.equal(queries,2)
})

test('a failed recap releases the next request, preserves timeout code, and explains database timeout',async()=>{
 let calls=0
 const api=adjustmentApi({rpc:async()=>++calls===1?{error:{code:'57014',message:'canceling statement due to statement timeout'}}:{data:{ok:true}}})
 const first=api.query({},0),second=api.query({},1)
 await assert.rejects(first,error=>error.code==='57014'&&/batas waktu database/.test(error.message))
 assert.deepEqual(await second,{ok:true})
})

test('transport aborts stay AbortError and a different connection is not blocked',async()=>{
 const wait=deferred();let requestSignal
 const api=adjustmentApi({rpc:()=>({abortSignal(signal){requestSignal=signal;return wait.promise}})})
 const controller=new AbortController(),first=api.query({},0,controller.signal)
 const other=adjustmentApi({rpc:async()=>({data:{ok:true}})})
 assert.deepEqual(await other.query({},0),{ok:true});assert.equal(requestSignal,controller.signal)
 const rejected=assert.rejects(first,{name:'AbortError'});controller.abort()
 wait.resolve({error:{message:'Fetch aborted'}});await rejected
})
