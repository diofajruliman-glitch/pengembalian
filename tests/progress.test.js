import test from 'node:test'
import assert from 'node:assert/strict'
import write from 'write-excel-file/node'
import read from 'read-excel-file/node'
import {indexSnapshot,selectProgress,detailBalances,exportRows} from '../src/recovery/progress.js'
const nip='000000000000000001'
const results=[{people:[{nip,nama:'Uji',provinsi:'Uji',bank:'Mandiri'}],obligations:[{nip,bank:'Mandiri',kind:'TUKIN',year:2025,amount:100},{nip,bank:'Mandiri',kind:'UM',year:2026,amount:80}],payments:[{nip,bank:'Mandiri',kind:'TUKIN',year:2025,stage:1,amount:20,verification:'pending'},{nip,bank:'Mandiri',kind:'TUKIN',year:2025,stage:2,amount:30,verification:'pending'},{nip,bank:'Mandiri',kind:'UM',year:2026,stage:1,amount:10,verification:'verified'}]}]
test('remaining filter uses selected ledger years and source status without treating pending payments as verified',()=>{
 const fixture=structuredClone(results);fixture[0].people[0].status_sdm='BUP';fixture[0].payments.push({nip,bank:'Mandiri',kind:'TUKIN',year:2025,stage:3,amount:50,verification:'pending'});
 const index=indexSnapshot(fixture);
 assert.equal(selectProgress(index,{remainingOnly:true,status:'BUP'}).totals.remaining,70);
 assert.equal(selectProgress(index,{remainingOnly:true,status:'BUP',year:2025}).totals.people,0);
 assert.equal(selectProgress(index,{remainingOnly:true,status:'Meninggal Dunia'}).totals.people,0);
 const zero=selectProgress(index,{status:'BUP',year:2025});assert.equal(zero.totals.people,1);assert.equal(zero.totals.verified,0);
})
test('filters distinguish years, kinds and verified receipt',()=>{const all=selectProgress(indexSnapshot(results));assert.equal(all.totals.obligation,180);assert.equal(all.totals.payment,60);assert.equal(all.totals.verified,10);assert.equal(all.totals.remaining,120);const tukin=selectProgress(indexSnapshot(results),{year:2025,kind:'TUKIN'});assert.equal(tukin.totals.obligation,100);assert.equal(tukin.totals.verified,0)})
test('stage filter does not miscalculate remaining balance',()=>{const r=selectProgress(indexSnapshot(results),{stage:2});assert.equal(r.totals.stagePayment,30);assert.equal(r.totals.remaining,120);assert.equal(detailBalances(r.rows[0])[0].remaining,50)})
test('export follows filters and NIP remains text after XLSX round trip',async()=>{const selection=selectProgress(indexSnapshot(results),{kind:'TUKIN',stage:2});const rows=exportRows(selection,2);assert.equal(rows.transactions.length,2);assert.equal(rows.transactions[1][5],2);const cells=rows=>rows.map(row=>row.map(value=>({value,type:typeof value==='number'?Number:String})));const buffer=await write([{sheet:'Monitoring SDM',data:cells(rows.summary)},{sheet:'Pengembalian per tahap',data:cells(rows.transactions)}]).toBuffer();const summary=await read(buffer,{sheet:'Monitoring SDM'}),payments=await read(buffer,{sheet:'Pengembalian per tahap'});assert.equal(summary[1][0],nip);assert.equal(typeof summary[1][0],'string');assert.equal(payments[1][6],30)})
