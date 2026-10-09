import test from 'node:test'
import assert from 'node:assert/strict'
import {loadStoredSnapshot} from '../src/import/batchTransport.js'
const person=n=>({nip:String(n).padStart(18,'0'),nama:'Simulasi',bank:'BRI'})
test('stored master fetches every page with text NIPs and consistent revision',async()=>{
 const calls=[];const client={rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='recovery_read_meta'?{revision:7,people:501}:{revision:7,people:args.p_after?[person(501)]:Array.from({length:500},(_,i)=>person(i+1)),obligations:[],payments:[]}}}}
 const snapshot=await loadStoredSnapshot(client)
 assert.equal(snapshot.source,'database');assert.equal(snapshot.results[0].people.length,501)
 assert.equal(calls[2][1].p_after,person(500).nip);assert.equal(calls.at(-1)[0],'recovery_read_meta')
})
test('changed revision never returns a mixed snapshot',async()=>{
 const client={rpc:async name=>({data:name==='recovery_read_meta'?{revision:1,people:1}:{revision:2,people:[person(1)],obligations:[],payments:[]}})}
 await assert.rejects(loadStoredSnapshot(client),/Data berubah/)
})
test('incomplete results and network failures are surfaced instead of showing zero',async()=>{
 const incomplete={rpc:async name=>({data:name==='recovery_read_meta'?{revision:1,people:2}:{revision:1,people:[person(1)],obligations:[],payments:[]}})}
 await assert.rejects(loadStoredSnapshot(incomplete),/Data berubah/)
 await assert.rejects(loadStoredSnapshot({rpc:async()=>({error:Error('Network failed')})}),/Network failed/)
})
