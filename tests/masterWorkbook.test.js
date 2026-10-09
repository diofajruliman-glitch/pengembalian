import test from 'node:test'
import assert from 'node:assert/strict'
import {parseBankSheet,comparePayments,mapColumns} from '../src/import/masterWorkbook.js'
const headers=['NIP','Nama sk','Provinsi','Final Total Piutang Tukin',null,'Piutang Uang Makan Total',null,'Pengembalian Tukin Tahap VI',null,'Pengembalian Uang Makan Tahap VI',null]
const years=[null,null,null,2025,2026,2025,2026,2025,2026,2025,2026]
const person=['000000000000000001','Uji','Uji',100,200,50,60,10,20,5,6]
test('separates obligation years, kinds and historic stage',()=>{const r=parseBankSheet([headers,years,person],'Mandiri');assert.deepEqual(r.issues,[]);assert.equal(r.obligations.length,4);assert.equal(r.payments.length,4);assert.equal(r.totals.remaining,369);assert.equal(r.payments[0].verification,'pending')})
test('new stage survives shifted columns',()=>{const h=[...headers.slice(0,7),'Pengembalian Tukin Tahap VII',null,...headers.slice(7)];const y=[...years.slice(0,7),2025,2026,...years.slice(7)];const p=[...person.slice(0,7),3,4,...person.slice(7)];assert.deepEqual(parseBankSheet([h,y,p],'Mandiri').issues,[]);assert.equal(mapColumns([h,y]).columns.filter(c=>c.stage===7).length,2)})
test('numeric NIP is rejected, not coerced',()=>{const p=[...person];p[0]=198001012025211001;assert.equal(parseBankSheet([headers,years,p],'Mandiri').issues[0].code,'INVALID_NIP')})
test('duplicate header blocks import',()=>{assert.ok(mapColumns([[...headers,'Pengembalian Tukin Tahap VI'],[...years,2025]]).issues.some(x=>x.code==='DUPLICATE_COLUMN'))})
test('repeated snapshot is idempotent and zero is a correction',()=>{const r=parseBankSheet([headers,years,person],'Mandiri');assert.equal(comparePayments(r.payments,r.payments).added.length,0);assert.equal(comparePayments(r.payments,r.payments).unchanged,4);const changed={...r.payments[0],amount:0};assert.equal(comparePayments([changed],r.payments).corrections[0].delta,-10);assert.equal(comparePayments([],r.payments).missing.length,4)})
test('negative amounts and overpayment block import',()=>{const p=[...person];p[7]=101;assert.ok(parseBankSheet([headers,years,p],'Mandiri').issues.some(x=>x.code==='OVERPAYMENT'));p[7]=-1;assert.ok(parseBankSheet([headers,years,p],'Mandiri').issues.some(x=>x.code==='INVALID_AMOUNT'))})
