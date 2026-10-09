import test from 'node:test'
import assert from 'node:assert/strict'
import {parseNonactive,matchNonactive,selectNonactiveReview,nonactiveReviewExport} from '../src/import/nonactive.js'
import write from 'write-excel-file/node'
import read from 'read-excel-file/node'
import {makeRecords} from '../src/import/batchTransport.js'
import {indexSnapshot,selectProgress} from '../src/recovery/progress.js'
const header=['NIP','NAMA','KATEGORI','TANGGAL BERHENTI','ALASAN']
const nip='000000000000000001'
test('review splits exact matches, name differences and unmatched records; Excel preserves NIP text',async()=>{
 const parsed=parseNonactive([header,[nip,'Sumber berbeda','SP3',45000,'Sumber'],['000000000000000002','Sama','BUP','tanggal sumber','Alasan'],['000000000000000003','Belum ada','BUP',null,null]])
 const result=matchNonactive([{people:[{nip,nama:'Master',bank:'BRI'},{nip:'000000000000000002',nama:'Sama',bank:'BSI'}]}],parsed)
 assert.equal(selectNonactiveReview(result.review,{status:'Nama berbeda'}).length,1)
 assert.equal(selectNonactiveReview(result.review,{status:'Cocok',category:'BUP'}).length,1)
 assert.equal(selectNonactiveReview(result.review,{status:'Belum cocok'})[0].bank,'')
 assert.equal(selectNonactiveReview(result.review,{search:'master'})[0].nip,nip)
 const exported=nonactiveReviewExport(selectNonactiveReview(result.review,{status:'Nama berbeda'}))
 const bytes=await write([{sheet:'Tinjauan SDM',data:exported.review.map(row=>row.map(v=>({value:v,type:typeof v==='number'?Number:String})))}]).toBuffer()
 const rows=await read(bytes,{sheet:'Tinjauan SDM'})
 assert.equal(rows.length,2);assert.equal(rows[1][0],nip);assert.equal(typeof rows[1][0],'string');assert.equal(rows[1][6],45000)
})
test('nonactive matching uses exact text NIP and never adds unmatched people or changes balances',()=>{
 const original=[{people:[{nip,nama:'Nama Bank',bank:'BRI'}],obligations:[{nip,bank:'BRI',kind:'TUKIN',year:2025,amount:100}],payments:[],issues:[]}]
 const parsed=parseNonactive([header,[nip,'Nama Sumber','Meninggal Dunia','tanggal belum dipetakan','Sumber'],['000000000000000002','Lain','BUP',45000,'Sumber']])
 const result=matchNonactive(original,parsed)
 assert.equal(result.summary.matched,1);assert.equal(result.summary.unmatched,1);assert.equal(result.summary.nameMismatches,1)
 assert.equal(original[0].people[0].nonactive,undefined);assert.equal(result.results[0].people[0].nama,'Nama Bank')
 assert.equal(selectProgress(indexSnapshot(result.results),{status:'Meninggal Dunia'}).totals.obligation,100)
 assert.equal(selectProgress(indexSnapshot(result.results),{status:'BUP'}).totals.people,0)
 assert.equal(makeRecords(result.results)[0].data.nonactive,undefined)
})
test('ambiguous and invalid nonactive records are excluded from tagging',()=>{
 const parsed=parseNonactive([header,[nip,'Uji','SP3',null,null],[nip,'Uji','BUP',null,null],[123,'Uji','SP3',null,null],['000000000000000003','Uji','Tidak diketahui',null,null]])
 assert.equal(parsed.records.length,0);assert.equal(parsed.issues.length,3)
 const valid=parseNonactive([header,[nip,'Uji','SP3',null,null]])
 assert.equal(matchNonactive([{people:[{nip,nama:'Uji'},{nip,nama:'Uji'}]}],valid).summary.matched,0)
})
