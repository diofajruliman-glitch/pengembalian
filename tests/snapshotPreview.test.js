import test from 'node:test'
import assert from 'node:assert/strict'
import {zipSync,strToU8} from 'fflate'
import {openSnapshot} from '../src/import/xlsxSnapshot.js'
import {summarizeBank,readRecap} from '../src/import/snapshotPreview.js'
test('empty XML cells never swallow the next cell',()=>{
 const bytes=zipSync({'xl/workbook.xml':strToU8('<workbook><sheets><sheet name="Test" r:id="rId1"/></sheets></workbook>'),'xl/_rels/workbook.xml.rels':strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),'xl/sharedStrings.xml':strToU8('<sst><si><t>A &amp; B</t></si></sst>'),'xl/worksheets/sheet1.xml':strToU8('<worksheet><sheetData><row r="1"><c r="A1"/><c r="B1" t="s"><v>0</v></c><c r="C1"><v>2026</v></c></row></sheetData></worksheet>')})
 const rows=openSnapshot(bytes).read('Test');assert.equal(rows[0][1],'A & B');assert.equal(rows[0][2],2026)
})
test('recap selects latest first block instead of summing historical snapshot',()=>{const row=Array(12).fill(null);row[1]='MANDIRI';row[6]=100;row[11]=50;const previous=[...row];previous[11]=20;assert.deepEqual(readRecap([row,previous]),{Mandiri:{obligation:100,payment:50}})})
test('bank preview distinguishes corrections and newly added stage',()=>{
 const h=['NIP','Nama sk','Final Total Piutang Tukin',null,'Piutang Uang Makan Total',null,'Pengembalian Tukin Tahap I',null]
 const y=[null,null,2025,2026,2025,2026,2025,2026],p=['000000000000000001','Uji',100,100,100,100,10,0]
 const baseline=[h,y,p],current=[[...h,'Pengembalian Tukin Tahap II',null],[...y,2025,2026], [...p.slice(0,6),20,0,5,0]]
 const report=summarizeBank(current,'Mandiri',baseline).summary;assert.equal(report.issueCount,0);assert.equal(report.comparison.corrections,1);assert.equal(report.comparison.newPayments,1);assert.deepEqual(report.comparison.newStages,[2])
})
