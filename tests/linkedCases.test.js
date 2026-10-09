import test from 'node:test'
import assert from 'node:assert/strict'
import {linkedCaseRows,linkedCaseExport,loadLinkedCaseRows} from '../src/recovery/linkedCases.js'
const nip='000000000000000001',manual={id:1,nip,nama:'Simulasi',bank:'BRI',kewajiban_total:999,realisasi_total:0,status:'Proses Penagihan',pic:'PIC manual',catatan:'Tetap'},links=[{case_id:1,nip,master_revision:1}]
const snapshot=payment=>({source:'database',revision:payment,results:[{people:[{nip,nama:'Simulasi',bank:'BRI'}],obligations:[{nip,bank:'BRI',kind:'TUKIN',year:2025,amount:100000}],payments:[{nip,bank:'BRI',kind:'TUKIN',year:2025,stage:1,amount:payment,verification:'pending'}]}]})
test('stored references show new master payments while every manual field stays unchanged',()=>{
 const before=structuredClone(manual),first=linkedCaseRows(snapshot(25000),[manual],links)[0],later=linkedCaseRows(snapshot(35000),[manual],links)[0]
 assert.equal(first.finance.remaining,75000);assert.equal(later.finance.remaining,65000);assert.equal(later.finance.verified,0);assert.equal(later.reference.master_revision,1)
 assert.deepEqual(later.manual,manual);assert.deepEqual(manual,before);assert.equal(linkedCaseExport([later])[1][7],'Proses Penagihan')
})
test('unlinked cases stay manual; invalid references never silently fall back to stale manual amounts',()=>{
 assert.equal(linkedCaseRows(snapshot(25000),[manual],[])[0].finance.obligation,999)
 const changed=linkedCaseRows(snapshot(25000),[{...manual,nip:'000000000000000002'}],links)[0]
 assert.equal(changed.finance,null);assert.equal(changed.source,'Referensi perlu ditinjau')
 const conflict=linkedCaseRows(snapshot(25000),[{...manual,status:'Lunas Terverifikasi'}],links)[0]
 assert.equal(conflict.manual.status,'Lunas Terverifikasi');assert.ok(conflict.warnings.length)
})
test('loading linked monitoring rejects concurrent edits to cases or references',async()=>{
 let metaCalls=0;const client={rpc:async name=>({data:name==='recovery_linked_meta'?{revision:1,cases:1,caseToken:++metaCalls===1?'before':'changed',linkToken:'same'}:{revision:1,rows:[{manual:{...manual,id:'1'},finance:{},source:'Manual',warnings:[]}]}})}
 await assert.rejects(loadLinkedCaseRows(client),/kasus berubah/)
})
