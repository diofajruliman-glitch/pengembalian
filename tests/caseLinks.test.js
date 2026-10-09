import test from 'node:test'
import assert from 'node:assert/strict'
import {previewCaseLinks,loadManualCases,caseLinkExport} from '../src/recovery/caseLinks.js'
import {stageWorkbook,fixtures} from '../scripts/create_stage_fixtures.mjs'
import {openSnapshot} from '../src/import/xlsxSnapshot.js'
import {BANK_SHEETS,parseBankSheet} from '../src/import/masterWorkbook.js'
const wb=openSnapshot(stageWorkbook(fixtures[1])),snapshot={fileName:'Simulasi',results:Object.entries(BANK_SHEETS).map(([s,b])=>parseBankSheet(wb.read(s),b,{keepZeroPayments:false}))}
const manual={id:1,nip:'000000000000000901',nama:'SDM SIMULASI 1',bank:'Mandiri',status:'Proses Penagihan',pic:'PIC manual',deadline:'2026-12-15',catatan:'Pertahankan',bukti:'Bukti manual',kewajiban_total:999,realisasi_total:12}
test('case linking previews all years/stages while preserving every manual field without mutation',()=>{
 const input=structuredClone(manual),plan=previewCaseLinks(snapshot,[input])
 assert.deepEqual(input,manual);assert.deepEqual(plan.rows[0].manual,manual)
 assert.equal(plan.summary.linkable,1);assert.equal(plan.rows[0].master.obligation,100000);assert.equal(plan.rows[0].master.payment,30000)
 assert.equal(plan.rows[0].master.payments.length,2)
 assert.equal(caseLinkExport(plan).cases[1][10],manual.status);assert.equal(caseLinkExport(plan).cases[1][13],manual.catatan)
})
test('differences, archived cases, duplicates and unverified paid status cannot be linked automatically',()=>{
 const variants=[{...manual,nama:'Berbeda'},{...manual,bank:'BSI'},{...manual,deleted_at:'2026-01-01'},{...manual,status:'Lunas Terverifikasi'},{...manual,nip:'000000000000000999'}]
 for(const variant of variants)assert.equal(previewCaseLinks(snapshot,[variant]).summary.linkable,0)
 const duplicate=previewCaseLinks(snapshot,[manual,{...manual,id:2}]);assert.ok(duplicate.rows.every(r=>r.issues.includes('Kasus ganda pada NIP yang sama')))
 const ambiguous=structuredClone(snapshot);ambiguous.results[1].people.push({...ambiguous.results[0].people[0]})
 const row=previewCaseLinks(ambiguous,[manual]).rows[0];assert.equal(row.master,null);assert.ok(row.issues.includes('NIP master ambigu'))
})
test('nonactive sources without a case remain review candidates and never create cases',()=>{
 const source={...snapshot,nonactiveReview:[{nip:manual.nip,nama:manual.nama,category:'BUP',matchStatus:'Cocok'},{nip:'000000000000000999',nama:'Sumber lain',category:'SP3',matchStatus:'Belum cocok'}]}
 const plan=previewCaseLinks(source,[]);assert.equal(plan.rows.length,0);assert.equal(plan.candidates.length,2)
 assert.match(plan.candidates[1].action,/Tahan/)
 assert.equal(previewCaseLinks(source,[manual]).candidates.length,1)
})
test('manual case reader loads every page, including archived cases, without writes',async()=>{
 const data=Array.from({length:501},(_,i)=>({id:i,deleted_at:i===500?'2026-01-01':null})),ranges=[]
 const client={from:table=>{assert.equal(table,'sdm_cases');return {select:(fields,options)=>options?.head?Promise.resolve({count:501}):{order:()=>({range:async(a,b)=>{ranges.push([a,b]);return {data:data.slice(a,b+1)}}})}}}}
 const rows=await loadManualCases(client);assert.equal(rows.length,501);assert.ok(rows[500].deleted_at);assert.deepEqual(ranges,[[0,499],[500,999]])
})
