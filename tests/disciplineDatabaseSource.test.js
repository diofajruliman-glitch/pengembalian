import test from 'node:test'
import assert from 'node:assert/strict'
import {activeDatasetId,loadDatabaseDisciplineSnapshot,operationalDisciplineSnapshot} from '../src/judol/databaseSource.js'

const selection=id=>({kind:'analysis',active:0,versions:[{id,result:{rows:[{nik:'local-draft'}]}}]})
const databaseRecord={id:'saved-1',name:'Saved source',filename:'source.xlsx',version:2,status:'active',result:{rows:[{nik:'database-row'}]}}
const makeVerified=()=>({accountId:'account-a',datasetId:'saved-1',snapshot:selection('saved-1')})

test('online operational source rejects unsaved or merely cached analysis',()=>{
 assert.equal(activeDatasetId(selection(undefined)),null)
 for(const selectedSnapshot of [selection(undefined),selection('saved-1')]){
  assert.equal(operationalDisciplineSnapshot({online:true,accountId:'account-a',selectedSnapshot,verified:null}),null)
 }
})

test('online operational source returns verified database result, not edited local rows',async()=>{
 const calls=[]
 const snapshot=await loadDatabaseDisciplineSnapshot({loadDataset:async id=>{calls.push(id);return databaseRecord},loadFollowups:async()=>[]},'saved-1')
 const selectedSnapshot=selection('saved-1')
 const actual=operationalDisciplineSnapshot({online:true,accountId:'account-a',selectedSnapshot,verified:{accountId:'account-a',datasetId:'saved-1',snapshot}})
 assert.deepEqual(calls,['saved-1'])
 assert.deepEqual(actual.versions[0].result.rows,[{nik:'database-row'}])
 assert.equal(actual.source,null)
})

test('account switch, signout, or dataset switch immediately hides previous verified rows',()=>{
 const verified=makeVerified()
 for(const input of [
  {accountId:'account-b',selectedSnapshot:selection('saved-1')},
  {accountId:null,selectedSnapshot:selection('saved-1')},
  {accountId:'account-a',selectedSnapshot:selection('saved-2')},
  {accountId:'account-a',selectedSnapshot:selection(undefined)}
 ])assert.equal(operationalDisciplineSnapshot({online:true,verified,...input}),null)
})

test('mismatched database response cannot certify selected source',async()=>{
 await assert.rejects(loadDatabaseDisciplineSnapshot({loadDataset:async()=>({...databaseRecord,id:'different'}),loadFollowups:async()=>[]},'saved-1'),/tidak valid/)
 await assert.rejects(loadDatabaseDisciplineSnapshot({loadDataset:async()=>({...databaseRecord,result:{}}),loadFollowups:async()=>[]},'saved-1'),/tidak valid/)
 assert.equal(operationalDisciplineSnapshot({online:true,accountId:'account-a',selectedSnapshot:selection('saved-1'),verified:{...makeVerified(),snapshot:selection('different')}}),null)
})

test('database failure fails closed without restoring local draft or static fallback',async()=>{
 await assert.rejects(loadDatabaseDisciplineSnapshot({loadDataset:async()=>{throw Error('unavailable')}},'saved-1'),/unavailable/)
 const actual=operationalDisciplineSnapshot({online:true,accountId:'account-a',selectedSnapshot:selection('saved-1'),verified:null})
 assert.equal(actual,null)
})

test('local demo keeps reversible workbook analysis workflow',()=>{
 const draft=selection(undefined)
 assert.equal(operationalDisciplineSnapshot({online:false,selectedSnapshot:draft}),draft)
})
