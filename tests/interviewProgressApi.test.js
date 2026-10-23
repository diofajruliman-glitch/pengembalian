import test from 'node:test'
import assert from 'node:assert/strict'
import {activityAction,listInterviewActivity,watchInterviewProgress} from '../src/bap/api.js'

const flush=()=>new Promise(resolve=>setImmediate(resolve))
function harness(){
 const browser=new EventTarget(),document=new EventTarget(),intervals=new Set()
 document.visibilityState='visible'
 const env={document,addEventListener:browser.addEventListener.bind(browser),removeEventListener:browser.removeEventListener.bind(browser),setInterval(fn,ms){assert.equal(ms,5000);intervals.add(fn);return fn},clearInterval(fn){intervals.delete(fn)}}
 return {env,browser,document,tick:()=>[...intervals].forEach(fn=>fn()),intervals}
}
function fakeClient(load){
 return {from(table){return {select(){return this},order(){return this},range(a,b){return load(table,a,b)}}}}
}

test('activity listing paginates beyond the API row limit without losing leading-zero NIKs',async()=>{
 const rows=Array.from({length:1057},(_,i)=>({nik:String(i).padStart(16,'0')})),ranges=[]
 const client=fakeClient((table,a,b)=>{assert.equal(table,'interview_activity');ranges.push([a,b]);return {data:rows.slice(a,b+1),error:null}})
 assert.deepEqual(await listInterviewActivity(client),rows)
 assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]])
})

test('activity mutations use their own revision and keep errors visible',async()=>{
 const calls=[],row={nik:'0011111111111111',revision:2}
 const client={rpc:async(name,args)=>{calls.push([name,args]);return {data:row,error:null}}}
 assert.equal(await activityAction(client,row.nik,'report',{note:'Koneksi peserta terputus'},1),row)
 assert.deepEqual(calls[0],['interview_activity_action',{p_nik:row.nik,p_action:'report',p_revision:1,p_payload:{note:'Koneksi peserta terputus'}}])
 await activityAction(client,row.nik,'open')
 assert.equal(calls[1][1].p_revision,null)
 await assert.rejects(activityAction({rpc:async()=>({error:new Error('INTERVIEW_ACTIVITY_CONFLICT')})},row.nik,'resolve'),/CONFLICT/)
})

test('watcher synchronizes cases and obstacles, refreshes on reconnect, and stops after unmount',async()=>{
 const h=harness(),seen=[],errors=[]
 let complete=false,reads=0
 const client=fakeClient(table=>{reads++;return {data:table==='interview_cases'?[{nik:'01',status:complete?'Selesai':'Dalam wawancara'}]:[{nik:'01',obstacle_status:complete?'resolved':'open'}]}})
 const stop=watchInterviewProgress(client,{onData:data=>seen.push(data),onError:error=>errors.push(error)},h.env)
 await stop.refresh()
 assert.equal(seen[0].rows[0].status,'Dalam wawancara');assert.equal(seen[0].activity[0].obstacle_status,'open')
 assert.ok(Number.isFinite(Date.parse(seen[0].updatedAt)))
 complete=true;h.browser.dispatchEvent(new Event('online'));await stop.refresh()
 assert.equal(seen.at(-1).rows[0].status,'Selesai');assert.equal(seen.at(-1).activity[0].obstacle_status,'resolved')
 h.document.visibilityState='hidden';const before=reads;h.tick();await flush();assert.equal(reads,before)
 h.document.visibilityState='visible';h.document.dispatchEvent(new Event('visibilitychange'));await stop.refresh();assert.equal(reads,before+2)
 stop();assert.equal(h.intervals.size,0)
 h.browser.dispatchEvent(new Event('online'));h.browser.dispatchEvent(new Event('focus'));h.tick();await stop.refresh()
 assert.equal(reads,before+2);assert.deepEqual(errors,[])
})

test('watcher coalesces concurrent refreshes and suppresses late data after cleanup',async()=>{
 const h=harness(),seen=[],resolvers=[]
 let reads=0
 const client=fakeClient(()=>{reads++;return new Promise(resolve=>resolvers.push(()=>resolve({data:[]})))})
 const stop=watchInterviewProgress(client,{onData:data=>seen.push(data)},h.env)
 h.tick();h.browser.dispatchEvent(new Event('focus'));const request=stop.refresh()
 assert.equal(reads,2)
 stop();resolvers.forEach(resolve=>resolve());await request
 assert.deepEqual(seen,[])
})

test('activity outage returns valid cases separately and never pretends obstacles are empty',async()=>{
 const h=harness(),seen=[],errors=[],rows=[{nik:'01',status:'Draf'}]
 let failing=true
 const client=fakeClient(table=>table==='interview_activity'&&failing?{error:new Error('table missing')}:{data:table==='interview_cases'?rows:[]})
 const stop=watchInterviewProgress(client,{onData:data=>seen.push(data),onError:error=>errors.push(error)},h.env)
 await stop.refresh()
 assert.equal(seen.length,0);assert.equal(errors[0].phase,'activity');assert.deepEqual(errors[0].rows,rows);assert.match(errors[0].message,/kendala.*table missing/)
 failing=false;await stop.refresh();assert.deepEqual(seen[0].rows,rows)
 stop()
})

test('case outage is marked stale and does not publish a fresh snapshot',async()=>{
 const h=harness(),errors=[],seen=[]
 const client=fakeClient(table=>table==='interview_cases'?{error:new Error('offline')}:{data:[]})
 const stop=watchInterviewProgress(client,{onData:data=>seen.push(data),onError:error=>errors.push(error)},h.env)
 await stop.refresh();stop()
 assert.deepEqual(seen,[]);assert.equal(errors[0].phase,'cases');assert.match(errors[0].message,/offline/)
})
