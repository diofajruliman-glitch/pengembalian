import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectSp2dYears} from '../src/import/sp2dYears.js'
import {makeRecords} from '../src/import/batchTransport.js'
const nip='000000000000000001'
const header=['NIP','Tahun Sp2d','Nama sk','NAMA BANK','TGL PROSES DEBET']
const results=[{people:[{nip,nama:'Uji',bank:'Mandiri'}],obligations:[{nip,bank:'Mandiri',kind:'TUKIN',year:2025,amount:100}],payments:[]}]
test('SP2D source year review does not change master totals, dates or import payload',()=>{
 const before=JSON.stringify(results), payload=makeRecords(results)
 const review=inspectSp2dYears({Sheet1:[header,[nip,2025,'Uji','BANK MANDIRI',20260901]]},results)[0]
 assert.equal(review.matched,1);assert.deepEqual(review.years,{2025:1})
 assert.equal(JSON.stringify(results),before);assert.deepEqual(makeRecords(results),payload)
 assert.equal(review.tanggal,undefined);assert.equal(review.nomor,undefined)
})
test('numeric identifiers, missing years, duplicate rows and identity conflicts cannot corroborate a year',()=>{
 const review=inspectSp2dYears({Sheet1:[header,[123,2025,'Uji','BANK MANDIRI'],[nip,null,'Uji','BANK MANDIRI'],[nip,2025,'Uji','BANK MANDIRI'],[nip,2025,'Uji','BANK MANDIRI'],[nip,2026,'Uji','BANK MANDIRI'],['000000000000000002',2025,'Lain','BANK BRI']]},results)[0]
 assert.equal(review.rows,6);assert.equal(review.invalid,2);assert.equal(review.duplicateRows,2);assert.equal(review.held,4);assert.equal(review.matched,0)
})
test('repeated stages stay separate source observations and missing source columns are explicit',()=>{
 const row=[nip,'2025',' Uji ','Bank Mandiri']
 const report=inspectSp2dYears({Sheet1:[header,row],Sheet12:[header,row],Other:[['NIP'],[nip]]},results)
 assert.equal(report[0].matched,1);assert.equal(report[1].matched,1);assert.equal(report[2].missingHeaders,true)
})
