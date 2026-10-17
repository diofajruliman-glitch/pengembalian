import test from 'node:test'
import assert from 'node:assert/strict'
import {loadWorkspace,saveWorkspace,validateWorkspace,recoverWorkspace} from '../src/interviews/storage.js'

class FakeStorage{
 constructor(){this.values=new Map();this.writes=0;this.readError=null;this.writeError=null}
 getItem(key){if(this.readError)throw this.readError;return this.values.get(key)??null}
 setItem(key,value){if(this.writeError)throw this.writeError;this.writes++;this.values.set(key,value)}
}
const account='account@example.test',source='dataset:source/version 1',nik='0012345678901234'
const draft=()=>({entries:{[nik]:{nik,status:'Menunggu',date:'2026-10-19',session:1,roomId:'room-1',time:'08:00',duration:40,verified:true,zoomName:'Zoom 001',notes:'Sudah di Main Room',startedAt:'',finishedAt:'',updatedAt:'2026-10-17T08:00:00.000Z'}},rooms:[{id:'room-1',name:'Room 1',interviewer:'Petugas',crossInterviewer:'',trafficOfficer:'Dio',enabled:true}],settings:{startDate:'2026-10-19',startTime:'08:00',duration:40,gap:5,perDay:11,skipWeekends:true},revision:0})
const isCode=code=>error=>error.code===code&&error.message.length>30

test('loading an absent account/source draft is read-only and returns independent defaults',()=>{
 const storage=new FakeStorage(),first=loadWorkspace(storage,account,source)
 assert.deepEqual(first,{entries:{},rooms:null,settings:null,revision:0})
 first.entries.extra={}
 assert.deepEqual(loadWorkspace(storage,account,source).entries,{})
 assert.equal(storage.writes,0)
 assert.equal(storage.values.size,0)
})

test('account and source scopes are encoded independently without delimiter collisions',()=>{
 const storage=new FakeStorage(),saved=saveWorkspace(storage,'user:a','source/b',draft(),0)
 assert.equal(saved.revision,1)
 assert.equal([...storage.values.keys()][0],'tlhp_interviews_v1:user%3Aa:source%2Fb')
 assert.deepEqual(loadWorkspace(storage,'user','a:source/b').entries,{})
 assert.deepEqual(loadWorkspace(storage,'user:a','different source').entries,{})
 assert.equal(loadWorkspace(storage,'user:a','source/b').entries[nik].nik,nik)
})

test('successful saves advance revision, preserve leading-zero identifiers, and detach caller data',()=>{
 const storage=new FakeStorage(),input=draft(),first=saveWorkspace(storage,account,source,input,0)
 assert.equal(first.revision,1)
 assert.equal(input.revision,0)
 first.entries[nik].notes='Returned object edited'
 input.rooms[0].name='Input edited'
 const loaded=loadWorkspace(storage,account,source)
 assert.equal(loaded.entries[nik].notes,'Sudah di Main Room')
 assert.equal(loaded.rooms[0].name,'Room 1')
 const second=saveWorkspace(storage,account,source,{...loaded,broadcast:'Sisa 5 menit',leader:{name:'Pimpinan',roomId:'main',notes:''}},1)
 assert.equal(second.revision,2)
 assert.equal(second.broadcast,'Sisa 5 menit')
 assert.equal(second.leader.roomId,'main')
})

test('a stale second tab cannot overwrite the first tab and receives an actionable conflict',()=>{
 const storage=new FakeStorage(),tabOne=loadWorkspace(storage,account,source),tabTwo=loadWorkspace(storage,account,source)
 saveWorkspace(storage,account,source,{...tabOne,...draft()},tabOne.revision)
 assert.throws(()=>saveWorkspace(storage,account,source,{...tabTwo,entries:{}},tabTwo.revision),isCode('INTERVIEW_WORKSPACE_CONFLICT'))
 assert.equal(storage.writes,1)
 assert.equal(loadWorkspace(storage,account,source).entries[nik].status,'Menunggu')
})

for(const raw of ['{broken','null','[]','{"entries":[],"revision":1}','{"entries":{},"revision":-1}','{"entries":{},"revision":null}','{"entries":{},"tokens":"private"}','{"entries":{"__proto__":{"status":"Menunggu"}}}']){
 test(`corrupt or unknown saved schema cannot be overwritten: ${raw.slice(0,35)}`,()=>{
  const storage=new FakeStorage(),key='tlhp_interviews_v1:'+encodeURIComponent(account)+':'+encodeURIComponent(source)
  storage.values.set(key,raw)
  assert.throws(()=>loadWorkspace(storage,account,source),isCode('INTERVIEW_STORAGE_CORRUPT'))
  assert.throws(()=>saveWorkspace(storage,account,source,draft(),0),isCode('INTERVIEW_STORAGE_CORRUPT'))
  assert.equal(storage.values.get(key),raw)
  assert.equal(storage.writes,0)
 })
}

test('validation rejects population fields, credentials, nonplain values, and prototype keys',()=>{
 const invalid=[
  {...draft(),rows:[{name:'Population record'}]},
  {...draft(),entries:{[nik]:{name:'Population record',status:'Menunggu'}}},
  {...draft(),settings:{token:'secret'}},
  {...draft(),entries:Object.create({inherited:{}})},
  {...draft(),entries:{[nik]:new Date()}},
  {...draft(),entries:{[nik]:{nik:'different'}}},
  JSON.parse('{"entries":{},"settings":{"constructor":{}}}'),
  {...draft(),entries:{[nik]:{notes:undefined}}},
  {...draft(),entries:{[nik]:{status:'Unrecognized status'}}},
  {...draft(),entries:{[nik]:{verified:'true'}}},
  {...draft(),entries:{[nik]:{date:'2026-02-31'}}}
 ]
 for(const payload of invalid)assert.throws(()=>validateWorkspace(payload),isCode('INTERVIEW_WORKSPACE_INVALID'))
 assert.equal({}.polluted,undefined)
})

test('normalization allows unscheduled operational entries and does not mutate backup input',()=>{
 const payload={entries:{[nik]:{date:'',time:'',session:null,status:'Belum dijadwalkan',verified:false}}}
 const normalized=validateWorkspace(payload)
 assert.deepEqual(normalized,{...payload,rooms:null,settings:null,revision:0})
 normalized.entries[nik].status='Terjadwal'
 assert.equal(payload.entries[nik].status,'Belum dijadwalkan')
})

test('payload limits count UTF-8 bytes and prevent writes beyond the 3 MiB budget',()=>{
 const storage=new FakeStorage(),entries={}
 for(let index=0;index<400;index++)entries[String(index).padStart(16,'0')]={notes:'界'.repeat(3000)}
 assert.throws(()=>saveWorkspace(storage,account,source,{entries,rooms:null,settings:null,revision:0},0),isCode('INTERVIEW_WORKSPACE_TOO_LARGE'))
 assert.equal(storage.writes,0)
})

test('blocked reads and failed writes never report a successful save or erase earlier data',()=>{
 const storage=new FakeStorage()
 saveWorkspace(storage,account,source,draft(),0)
 const previous=[...storage.values.values()][0]
 storage.readError=new Error('internal browser details')
 assert.throws(()=>loadWorkspace(storage,account,source),isCode('INTERVIEW_STORAGE_UNAVAILABLE'))
 assert.throws(()=>saveWorkspace(storage,account,source,draft(),1),isCode('INTERVIEW_STORAGE_UNAVAILABLE'))
 storage.readError=null
 storage.writeError=new Error('QuotaExceededError internal browser details')
 assert.throws(()=>saveWorkspace(storage,account,source,draft(),1),error=>isCode('INTERVIEW_STORAGE_WRITE_FAILED')(error)&&!error.message.includes('internal browser details'))
 assert.equal([...storage.values.values()][0],previous)
 assert.equal(storage.writes,1)
 assert.equal(loadWorkspace(storage,account,source).revision,1)
})

test('missing account or source never reads or writes an unscoped draft',()=>{
 const storage=new FakeStorage()
 for(const [id,key] of [['',source],[account,''],[null,source],[account,null]]){
  assert.throws(()=>loadWorkspace(storage,id,key),isCode('INTERVIEW_STORAGE_SCOPE'))
  assert.throws(()=>saveWorkspace(storage,id,key,draft(),0),isCode('INTERVIEW_STORAGE_SCOPE'))
 }
 assert.equal(storage.values.size,0)
})

const scopedKey='tlhp_interviews_v1:'+encodeURIComponent(account)+':'+encodeURIComponent(source)

test('explicit corrupt-draft recovery preserves the exact old raw value before writing revision one',()=>{
 const events=[],raw='{damaged workspace',storage=new FakeStorage()
 storage.values.set(scopedKey,raw)
 const write=storage.setItem.bind(storage)
 storage.setItem=(key,value)=>{events.push({key,value});write(key,value)}
 const candidate={...draft(),revision:53},recovered=recoverWorkspace(storage,account,source,candidate)
 assert.equal(recovered.revision,1)
 assert.equal(candidate.revision,53)
 assert.equal(events.length,2)
 assert.match(events[0].key,new RegExp(':recovery:\\d+$'))
 assert.equal(events[0].value,raw)
 assert.equal(events[1].key,scopedKey)
 assert.deepEqual(loadWorkspace(storage,account,source),recovered)
 assert.equal(storage.getItem(events[0].key),raw)
})

test('recovery does not overwrite a prior recovery copy with the same timestamp',t=>{
 t.mock.method(Date,'now',()=>1234567)
 const storage=new FakeStorage(),oldCopy=scopedKey+':recovery:1234567'
 storage.values.set(scopedKey,'{broken')
 storage.values.set(oldCopy,'prior preserved copy')
 recoverWorkspace(storage,account,source,draft())
 assert.equal(storage.getItem(oldCopy),'prior preserved copy')
 assert.equal(storage.getItem(scopedKey+':recovery:1234568'),'{broken')
})

test('recovery cannot bypass optimistic revisions for valid drafts or initialize missing drafts',()=>{
 for(const raw of [null,JSON.stringify({...draft(),revision:7})]){
  const storage=new FakeStorage()
  if(raw!==null)storage.values.set(scopedKey,raw)
  assert.throws(()=>recoverWorkspace(storage,account,source,draft()),isCode('INTERVIEW_STORAGE_RECOVERY_NOT_NEEDED'))
  assert.equal(storage.writes,0)
  assert.equal(storage.getItem(scopedKey),raw)
 }
})

test('invalid candidates and unavailable reads cannot start corrupt-draft recovery',()=>{
 const storage=new FakeStorage()
 storage.values.set(scopedKey,'{broken')
 assert.throws(()=>recoverWorkspace(storage,account,source,{entries:[],revision:0}),isCode('INTERVIEW_WORKSPACE_INVALID'))
 assert.equal(storage.values.size,1)
 storage.readError=new Error('browser private details')
 assert.throws(()=>recoverWorkspace(storage,account,source,draft()),isCode('INTERVIEW_STORAGE_UNAVAILABLE'))
 assert.equal(storage.writes,0)
})

test('failure to preserve corrupt data leaves the scoped draft untouched and does not restore',()=>{
 const storage=new FakeStorage(),raw='{broken and must be retained'
 storage.values.set(scopedKey,raw)
 storage.writeError=new Error('QuotaExceededError private details')
 assert.throws(()=>recoverWorkspace(storage,account,source,draft()),error=>isCode('INTERVIEW_STORAGE_RECOVERY_FAILED')(error)&&!error.message.includes('private details'))
 assert.equal(storage.getItem(scopedKey),raw)
 assert.equal(storage.writes,0)
 assert.equal(storage.values.size,1)
})

test('failed replacement retains both the original draft and its recovery copy',()=>{
 const storage=new FakeStorage(),raw='{broken',write=storage.setItem.bind(storage)
 storage.values.set(scopedKey,raw)
 storage.setItem=(key,value)=>{if(key===scopedKey)throw Error('QuotaExceededError');write(key,value)}
 assert.throws(()=>recoverWorkspace(storage,account,source,draft()),error=>isCode('INTERVIEW_STORAGE_WRITE_FAILED')(error)&&/salinan pemulihannya tetap tersimpan/.test(error.message))
 assert.equal(storage.getItem(scopedKey),raw)
 const copies=[...storage.values].filter(([key])=>key.startsWith(scopedKey+':recovery:'))
 assert.equal(copies.length,1)
 assert.equal(copies[0][1],raw)
 assert.equal(storage.writes,1)
})

test('a draft changed by another tab during preservation cannot be overwritten by recovery',()=>{
 const storage=new FakeStorage(),raw='{broken',write=storage.setItem.bind(storage),other=JSON.stringify({...draft(),revision:8})
 storage.values.set(scopedKey,raw)
 storage.setItem=(key,value)=>{write(key,value);if(key.startsWith(scopedKey+':recovery:'))storage.values.set(scopedKey,other)}
 assert.throws(()=>recoverWorkspace(storage,account,source,draft()),isCode('INTERVIEW_WORKSPACE_CONFLICT'))
 assert.equal(storage.getItem(scopedKey),other)
 assert.equal(storage.writes,1)
 assert.equal([...storage.values].find(([key])=>key.startsWith(scopedKey+':recovery:'))[1],raw)
})
