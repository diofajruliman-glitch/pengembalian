import test from 'node:test'
import assert from 'node:assert/strict'
import {summarizeSp2dYears} from '../src/import/sp2dYears.js'
import {makeRecords} from '../src/import/batchTransport.js'
import {indexSnapshot,selectProgress,exportRows,detailBalances} from '../src/recovery/progress.js'
const people=[{nip:'000000000000000001',nama:'Dua tahun',bank:'BRI'},{nip:'000000000000000002',nama:'Hanya 2026',bank:'BRI'},{nip:'000000000000000003',nama:'Kosong',bank:'BRI'}]
const obligation=(i,year,amount,kind='TUKIN')=>({nip:people[i].nip,bank:'BRI',year,amount,kind})
const results=[{people,obligations:[obligation(0,2025,100),obligation(0,2026,200),obligation(0,2025,0,'UM'),obligation(1,2025,0),obligation(1,2026,50,'UM'),obligation(2,2025,0)],payments:[{...obligation(0,2025,20),stage:1},{...obligation(0,2026,30),stage:2},{...obligation(1,2026,10,'UM'),stage:1}]}]
test('positive year columns establish SP2D years; zero-only and blank years do not count as SDM',()=>{
 const index=indexSnapshot(results)
 assert.equal(selectProgress(index,{year:2025}).totals.people,1)
 assert.equal(selectProgress(index,{year:2026}).totals.people,2)
 assert.equal(selectProgress(index,{year:2025,kind:'UM'}).totals.people,0)
 assert.equal(selectProgress(index).totals.people,2)
 assert.equal(selectProgress(index,{year:2024}).totals.people,0)
 assert.equal(detailBalances(index.people[2]).length,0)
})
test('one SDM can belong to both years while annual payments and balances remain separate',()=>{
 const years=summarizeSp2dYears(results)
 assert.deepEqual(years.map(y=>[y.year,y.people,y.obligation,y.payment,y.remaining]),[[2025,1,100,20,80],[2026,2,250,40,210]])
 assert.equal(years.reduce((s,y)=>s+y.obligation,0),selectProgress(indexSnapshot(results)).totals.obligation)
 const selected=selectProgress(indexSnapshot(results),{year:2026,kind:'UM',stage:1})
 assert.equal(selected.totals.obligation,50);assert.equal(selected.totals.payment,10)
 const exported=exportRows(selected,1)
 assert.equal(exported.transactions[0][4],'Tahun SP2D');assert.equal(exported.transactions[1][4],2026)
})
test('year selection preserves ledger zero corrections and does not change import payload or source identity',()=>{
 const before=JSON.stringify(results),payload=makeRecords(results)
 summarizeSp2dYears(results);selectProgress(indexSnapshot(results),{year:2025})
 assert.equal(JSON.stringify(results),before);assert.deepEqual(makeRecords(results),payload)
 assert.ok(payload.some(r=>r.type==='obligation'&&r.data.amount===0))
 assert.deepEqual(summarizeSp2dYears([{people,obligations:[obligation(0,2025,0)],payments:[]}]),[])
})
