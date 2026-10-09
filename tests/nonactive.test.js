import test from 'node:test'
import assert from 'node:assert/strict'
import {parseNonactive,matchNonactive} from '../src/import/nonactive.js'
import {makeRecords} from '../src/import/batchTransport.js'
import {indexSnapshot,selectProgress} from '../src/recovery/progress.js'
const header=['NIP','NAMA','KATEGORI','TANGGAL BERHENTI','ALASAN']
const nip='000000000000000001'
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
