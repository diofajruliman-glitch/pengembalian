import test from 'node:test'
import assert from 'node:assert/strict'
import {interviewEditorState,deferInterviewPayload} from '../src/bap/lifecycle.js'

const unstarted={status:'Terjadwal',started_at:null,locked_by:null}
const started={status:'Dalam wawancara',started_at:'2026-10-26T01:30:00Z',locked_by:'handler'}

test('BAP opens only after an explicit start; preparation permits start or reasoned pause',()=>{
 const state=interviewEditorState(unstarted,'interviewer','handler')
 assert.equal(state.showBap,false)
 assert.equal(state.readOnly,true)
 assert.equal(state.canStart,true)
 assert.equal(state.canDefer,true)
 assert.equal(interviewEditorState(started,'interviewer','handler').readOnly,false)
})

test('pausing keeps an existing BAP visible and read-only until its handler resumes',()=>{
 const state=interviewEditorState({...started,status:'Tertunda'},'interviewer','handler')
 assert.equal(state.showBap,true)
 assert.equal(state.readOnly,true)
 assert.equal(state.canStart,true)
 assert.equal(state.canDefer,false)
 const preStart=interviewEditorState({...unstarted,status:'Tertunda'},'interviewer','handler')
 assert.equal(preStart.showBap,false)
 assert.equal(preStart.canStart,true)
})

test('viewer, completed and other-handler cases do not expose lifecycle writes',()=>{
 for(const state of [interviewEditorState(started,'viewer','handler'),interviewEditorState({...started,status:'Selesai'},'interviewer','handler'),interviewEditorState(started,'interviewer','other')]){
  assert.equal(state.readOnly,true)
  assert.equal(state.canStart,false)
  assert.equal(state.canDefer,false)
 }
})

test('one pause payload carries pending answers atomically for the active handler',()=>{
 const identity={pangkat:'Penata'},answers={1:'Jawaban belum tersimpan',22:'Jawaban terakhir'}
 assert.deepEqual(deferInterviewPayload(started,identity,answers,'  Koneksi peserta terputus  ','handler'),{reason:'Koneksi peserta terputus',identity,answers})
 for(const row of [unstarted,{...started,status:'Tertunda'},{...started,locked_by:'other'}])assert.deepEqual(deferInterviewPayload(row,identity,answers,'Tidak dapat hadir','handler'),{reason:'Tidak dapat hadir'})
})
