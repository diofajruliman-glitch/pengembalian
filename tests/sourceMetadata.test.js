import test from 'node:test'
import assert from 'node:assert/strict'
import {extractSourceMetadata,normalizeSdmStatus,statusOf,targetStatuses} from '../src/import/sourceMetadata.js'
import {parseBankSheet} from '../src/import/masterWorkbook.js'
import {indexSnapshot,selectProgress} from '../src/recovery/progress.js'
const a='000000000000000001',b='000000000000000002',c='000000000000000003'
const rows=[['NIP','Nama sk','PROVINSI','FINAL TOTAL PIUTANG TUKIN','PIUTANG UANG MAKAN TOTAL','PENGEMBALIAN TUKIN TAHAP I','STATUS AKTIF'],[null,null,null,2025,2025,2025],[null,null,null,null,null,'TESTNTPN00000001'],[a,'Satu','X',100,0,30,'Resign'],[b,'Dua','X',100,0,100,'BUP'],[c,'Tiga','X',100,0,0,'']]
const get=()=>extractSourceMetadata([parseBankSheet(rows,'Mandiri',{keepZeroPayments:false})],{'BNBA PENGEMBALIAN MANDIRI':rows})
test('status and stage NTPN metadata preserve amounts and never infer full repayment or verified receipts',()=>{
 const result=get(),index=indexSnapshot(result.results);assert.equal(result.ntpnReferences.length,1);assert.equal(result.results[0].payments[0].ntpnReferences[0].scope,'payment-stage');assert.equal(result.results[0].payments[0].verification,'pending');
 assert.equal(statusOf(index.people[0]),'Mengundurkan Diri');assert.equal(statusOf(index.people[2]),'Aktif');
 assert.deepEqual(selectProgress(index).totals,{people:3,obligation:300,payment:130,verified:0,stagePayment:130,remaining:170,pct:130/300*100});
 assert.equal(selectProgress(index,{worklist:'nonactive'}).totals.remaining,70);assert.equal(selectProgress(index,{worklist:'active'}).totals.remaining,100);assert.equal(selectProgress(index,{worklist:'paid'}).totals.people,1);
 assert.equal(selectProgress(index,{worklist:'nonactive',targetStatuses:targetStatuses({kegiatan:'Verifikasi meninggal dunia'})}).totals.people,0);
 assert.equal(selectProgress(index,{worklist:'nonactive',targetStatuses:targetStatuses({kegiatan:'Tagihan SDM resign / pensiun'})}).totals.people,1);
})
test('errors and conflicting employment categories are held rather than converted to active or overwritten',()=>{
 const data=structuredClone(rows);data[3][6]='#N/A';const pensionRows=[];pensionRows[0]=[b,null,null,'Dua'];pensionRows[0][17]='Sudah pensiun';pensionRows[1]=[a,null,null,'Satu'];pensionRows[1][17]='Sudah pensiun';
 const result=extractSourceMetadata([parseBankSheet(data,'Mandiri')],{'BNBA PENGEMBALIAN MANDIRI':data},{pensionRows,nonactiveReview:[{nip:a,category:'Mengundurkan Diri',matchStatus:'Cocok'}]});const index=indexSnapshot(result.results);
 assert.equal(statusOf(index.people[0]),'Perlu pemeriksaan');assert.equal(statusOf(index.people[1]),'Pensiun');assert.equal(selectProgress(index,{worklist:'review'}).totals.people,1);assert.equal(selectProgress(index,{worklist:'nonactive'}).totals.people,0);
 assert(result.issues.some(r=>r.code==='STATUS_CONFLICT'));
})
test('account status and codes on employee rows cannot become employment status or shared stage receipts',()=>{
 const data=structuredClone(rows);data[0][6]='STATUS REK';for(const r of data.slice(3))r[6]='Aktif';data[2][5]=null;data[3][7]='TESTNTPN00000001';
 const result=extractSourceMetadata([parseBankSheet(data,'Mandiri')],{'BNBA PENGEMBALIAN MANDIRI':data});assert.equal(result.summary.statusSources,0);assert.equal(result.ntpnReferences.length,0);assert.equal(normalizeSdmStatus('#N/A'),'Perlu pemeriksaan');
})
