import test from 'node:test'
import assert from 'node:assert/strict'
import {createFollowupDraft,followupDraftReducer,followupRevision,followupValues} from '../src/judol/followupDraft.js'

const first='2026-10-16T05:00:00.123456+00:00'
const next='2026-10-16T05:01:00.654321+00:00'
const original={status:'Dalam pemeriksaan',pic:'Petugas awal',notes:'Catatan awal',updatedAt:first}
const server={...original,pic:'Petugas lain',notes:'Catatan petugas lain',updatedAt:next}
const reduce=(state,type,props={})=>followupDraftReducer(state,{type,...props})

test('followup revision uses the exact server token and ignores local session timestamps',()=>{
 assert.equal(followupRevision(original,true),first)
 assert.equal(followupRevision(original,false),null)
 assert.equal(followupRevision({...original,pending:true},true),null)
 assert.equal(followupRevision({...original,pending:true,expectedUpdatedAt:null},true),null)
 assert.equal(followupRevision({...original,pending:true,expectedUpdatedAt:next},true),next)
 assert.equal(followupRevision(null,true),null)
 assert.deepEqual(Object.keys(followupValues({...original,nik:'123',pending:true})).sort(),['decisionNote','documentReference','notes','pic','status'])
})

test('conflict preserves draft and base until an explicit choice after loading latest',()=>{
 let state=createFollowupDraft(original,true)
 state=reduce(state,'edit',{field:'notes',value:'Draf saya'})
 state=reduce(state,'failed',{error:Object.assign(new Error('Berubah'),{code:'DISCIPLINE_FOLLOWUP_CONFLICT'})})
 assert.equal(state.draft.notes,'Draf saya')
 assert.equal(state.expectedUpdatedAt,first)
 assert.equal(state.conflict,true)
 assert.strictEqual(reduce(state,'keepDraft'),state)
 state=reduce(state,'latest',{latest:{value:server,archived:false}})
 assert.equal(state.draft.notes,'Draf saya')
 assert.equal(state.expectedUpdatedAt,first)
 assert.equal(state.conflict,true)
 state=reduce(state,'keepDraft')
 assert.equal(state.draft.notes,'Draf saya')
 assert.equal(state.expectedUpdatedAt,next)
 assert.equal(state.conflict,false)
 assert.match(state.notice,/Tekan Simpan/)
})

test('using the reviewed server value explicitly replaces the draft and revision',()=>{
 let state=createFollowupDraft(original,true)
 state=reduce(state,'edit',{field:'pic',value:'PIC saya'})
 state=reduce(state,'failed',{error:{message:'Berubah',code:'DISCIPLINE_FOLLOWUP_CONFLICT'}})
 state=reduce(state,'latest',{latest:{value:server,archived:false}})
 state=reduce(state,'useLatest')
 assert.deepEqual(state.draft,followupValues(server))
 assert.equal(state.expectedUpdatedAt,next)
 assert.equal(state.conflict,false)
})

test('a second conflict requires a fresh comparison instead of reusing an earlier review',()=>{
 let state=createFollowupDraft(original,true)
 state=reduce(state,'latest',{latest:{value:server,archived:false}})
 state=reduce(state,'keepDraft')
 state=reduce(state,'failed',{error:{message:'Berubah lagi',code:'DISCIPLINE_FOLLOWUP_CONFLICT'}})
 assert.equal(state.latest,null)
 assert.equal(state.conflict,true)
 assert.equal(state.expectedUpdatedAt,next)
 assert.strictEqual(reduce(state,'useLatest'),state)
})

test('archived latest state never allows rebasing or replacing a preserved draft',()=>{
 let state=createFollowupDraft(original,true)
 state=reduce(state,'edit',{field:'notes',value:'Draf belum tersimpan'})
 state=reduce(state,'latest',{latest:{value:server,archived:true}})
 assert.strictEqual(reduce(state,'keepDraft'),state)
 assert.strictEqual(reduce(state,'useLatest'),state)
 assert.equal(state.draft.notes,'Draf belum tersimpan')
 assert.equal(state.expectedUpdatedAt,first)
})

test('pending conflict initializes review requirement and successful save advances to returned revision',()=>{
 let state=createFollowupDraft({...original,pending:true,pendingCode:'DISCIPLINE_FOLLOWUP_CONFLICT',expectedUpdatedAt:null},true)
 assert.equal(state.conflict,true)
 assert.equal(state.expectedUpdatedAt,null)
 state=reduce(state,'saved',{value:server,online:true})
 assert.equal(state.expectedUpdatedAt,next)
 assert.equal(state.conflict,false)
 assert.equal(state.latest,null)
 assert.deepEqual(state.draft,followupValues(server))
})
