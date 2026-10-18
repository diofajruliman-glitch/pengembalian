import test from 'node:test'
import assert from 'node:assert/strict'
import {chronologyFilters,loadChronology} from '../src/adjustments/chronology.js'

const deferred=()=>{
 let resolve,reject
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no})
 return {promise,resolve,reject}
}
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve))

test('chronology retains all navigation filters for the selected year',()=>{
 assert.deepEqual(chronologyFilters(2026),{
  initial:{sp2dOld:2026,bpk:'TAHAP 1 SEND BPK'},
  retained:{sp2dOld:2026,sp2dUpdated:2026,bpk:'TAHAP 1 SEND BPK'},
  moved:{sp2dOld:2026,sp2dUpdated:2027,bpk:'TAHAP 1 SEND BPK'},
  correction:{sp2dOld:2026,sp2dUpdated:2026,bpk:'TAHAP 1 SEND BPK',change:'amount'},
  added:{sp2dUpdated:2026,bpk:'BELUM MASUK BPK'},
  total:{sp2dUpdated:2026}
 })
})

test('chronology loads only five used presets serially and preserves summary and reason recaps',async()=>{
 const pending=[],calls=[],controller=new AbortController()
 let active=0,maxActive=0
 const api={query(filters,page,signal){
  calls.push({filters,page,signal})
  active++;maxActive=Math.max(maxActive,active)
  const request=deferred();pending.push(request)
  return request.promise.finally(()=>{active--})
 }}
 const loading=loadChronology(api,2025,controller.signal)
 const keys=['initial','retained','moved','added','total'],expected={}
 for(const [index,key] of keys.entries()){
  assert.equal(calls.length,index+1)
  assert.deepEqual(calls[index],{filters:chronologyFilters(2025)[key],page:0,signal:controller.signal})
  const summary={rows:index+1,people:index+1,initial:100+index,final:80+index,delta:-20}
  const reasons=[{values:['WITA','Oktober'],delta:-20}],sourcePriority=[{rows:index+1}]
  expected[key]={...summary,reasonGroups:reasons,sourcePriorityGroups:sourcePriority}
  pending[index].resolve({summary,recaps:{reasons,sourcePriority}})
  await nextTurn()
 }
 assert.deepEqual(await loading,expected)
 assert.equal(calls.length,5)
 assert.equal(maxActive,1)
 assert.equal(active,0)
})

test('chronology supports responses without optional reason recaps',async()=>{
 const data=await loadChronology({query:async()=>({summary:{initial:10,final:8}})},2025)
 assert.deepEqual(data.retained,{initial:10,final:8,reasonGroups:undefined,sourcePriorityGroups:undefined})
})

test('chronology stops on the first query failure without starting remaining presets',async()=>{
 const failure=new Error('canceling statement due to statement timeout')
 let calls=0
 const api={query:async()=>{if(++calls===2)throw failure;return {summary:{}}}}
 await assert.rejects(loadChronology(api,2025),error=>error===failure)
 assert.equal(calls,2)
})

test('chronology rejects before issuing a query when already aborted',async()=>{
 const controller=new AbortController();controller.abort()
 let calls=0
 await assert.rejects(loadChronology({query:()=>{calls++}},2025,controller.signal),{name:'AbortError'})
 assert.equal(calls,0)
})

test('chronology aborts promptly during a pending query even if the transport ignores abort',async()=>{
 const controller=new AbortController(),request=deferred()
 let calls=0
 const loading=loadChronology({query:()=>{calls++;return request.promise}},2025,controller.signal)
 const rejected=assert.rejects(loading,{name:'AbortError'})
 controller.abort()
 await rejected
 assert.equal(calls,1)
 request.resolve({summary:{initial:10,final:8}})
 await nextTurn()
 assert.equal(calls,1)
})

test('chronology handles a late transport rejection after abort without starting another query',async()=>{
 const controller=new AbortController(),request=deferred()
 let calls=0
 const loading=loadChronology({query:()=>{calls++;return request.promise}},2025,controller.signal)
 const rejected=assert.rejects(loading,{name:'AbortError'})
 controller.abort()
 await rejected
 request.reject(new Error('late transport failure'))
 await nextTurn()
 assert.equal(calls,1)
})
