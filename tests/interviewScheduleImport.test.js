import test from 'node:test'
import assert from 'node:assert/strict'
import writeXlsxFile from 'write-excel-file/node'
import readXlsxFile from 'read-excel-file/node'
import { DOMParser } from '@xmldom/xmldom'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { parseScheduleRows, parseScheduleCsv, readScheduleFile } from '../src/interviews/scheduleImport.js'

const nik='0000000000000001',nip='000000000000000001'
const headers=['NIK','NIP','Nama','Tanggal','Jam Mulai','Sesi','Room','Pewawancara Utama','Durasi (menit)','Catatan']
const row=(patch={})=>Object.assign([nik,nip,'Peserta Simulasi','2026-10-19','08:00',1,'Room 1','Itjen 1',40,''],patch)
const parse=(patch={})=>parseScheduleRows([headers,row(patch)])
const csv=(delimiter=',')=>[headers.join(delimiter),row().join(delimiter)].join('\r\n')
const cells=rows=>rows.map(values=>values.map(value=>({value,...(value instanceof Date?{type:Date,format:'yyyy-mm-dd'}:{})})))
const workbook=async (rows,sheet='Jadwal')=>writeXlsxFile(cells(rows),{sheet}).toBuffer()
const withBrowserXml=async callback=>{
 const previous=globalThis.DOMParser
 globalThis.DOMParser=DOMParser
 try{return await callback()}finally{if(previous===undefined)delete globalThis.DOMParser;else globalThis.DOMParser=previous}
}

test('normalizes a complete schedule, preserving text identifiers and omitting irrelevant columns',()=>{
 const data=[headers.concat(['Kolom Rahasia']),row().concat(['abaikan'])],before=JSON.stringify(data)
 const result=parseScheduleRows(data)
 assert.deepEqual(result.errors,[])
 assert.deepEqual(result.warnings,[])
 assert.deepEqual(result.rows,[{rowNumber:2,nik,nip,nama:'Peserta Simulasi',date:'2026-10-19',time:'08:00',session:1,room:'Room 1',interviewer:'Itjen 1',duration:40}])
 assert.equal(JSON.stringify(data),before)
})

test('accepts Indonesian aliases, accents, punctuation, and a single identity column',()=>{
 const result=parseScheduleRows([['N.I.P.','Náma SDM','Tgl','Jadwal','Ruang'],[nip,'Peserta','19/10/2026','08:00–08:40',2]])
 assert.deepEqual(result.errors,[])
 assert.equal(result.rows[0].nip,nip)
 assert.equal(result.rows[0].room,'Room 2')
 assert.equal(result.rows[0].date,'2026-10-19')
 assert.equal(result.warnings.length,2)
 assert.ok(result.warnings.every(warning=>warning.rowNumber===1))
})

test('requires identity, date, time, and a destination header; duplicate aliases are rejected',()=>{
 for(const removed of [[0,1],[3],[4],[6,7]]) {
  const head=headers.filter((_,index)=>!removed.includes(index))
  assert.equal(parseScheduleRows([head]).errors.length,1)
 }
 for(const extra of ['N.I.K.','Tanggal Wawancara','jam.mulai','nama SDM']) {
  assert.match(parseScheduleRows([headers.concat([extra])]).errors[0].message,/lebih dari sekali/)
 }
 assert.match(parseScheduleRows([headers.concat(['Tak dikenal','Tak-dikenal'])]).errors[0].message,/lebih dari sekali/)
})

test('never repairs numeric, scientific, truncated, or doubled-apostrophe identifiers',()=>{
 for(const invalid of [1234567890123456,1.234e15,'1.234567890123456E+15','1234',"''0000000000000001",'000000000000000A']) {
  const result=parse({0:invalid})
  assert.equal(result.rows.length,0)
  assert.match(result.errors[0].message,/NIK/)
 }
 for(const invalid of [123456789012345678,'1e17','123'])assert.equal(parse({1:invalid}).rows.length,0)
 const result=parse({0:`'${nik}`,1:`'${nip}`})
 assert.equal(result.rows[0].nik,nik)
 assert.equal(result.rows[0].nip,nip)
 assert.equal(parse({0:'',1:''}).rows.length,0)
})

test('validates calendar dates and accepts date-only Excel values',()=>{
 for(const valid of ['2028-02-29','29/02/2028',new Date('2028-02-29T00:00:00.000Z'),46812]) {
  assert.equal(parse({3:valid}).errors.length,0)
 }
 for(const invalid of ['2026-02-29','31/04/2026','2026-13-01','19/10/26','2026-1-1','2026-10-19T08:00:00Z',new Date('invalid'),new Date('2026-10-19T08:00:00Z'),46314.5,60,Infinity]) {
  assert.equal(parse({3:invalid}).rows.length,0,String(invalid))
 }
 assert.equal(parse({3:46314}).rows[0].date,'2026-10-19')
 assert.equal(parse({3:1}).rows[0].date,'1900-01-01')
 assert.equal(parse({3:59}).rows[0].date,'1900-02-28')
 assert.equal(parse({3:61}).rows[0].date,'1900-03-01')
})

test('accepts exact-minute times and rejects silently truncated seconds and overnight ranges',()=>{
 for(const valid of ['08:00','08:00:00',1/3,new Date('1899-12-30T08:00:00Z'),'08:00 - 08:40','08:00—08:40']) {
  const result=parse({4:valid})
  assert.equal(result.errors.length,0,String(valid))
  assert.equal(result.rows[0].time,'08:00')
 }
 for(const invalid of ['8:00','08.00','08:00:01',0.33334,1,-0.25,Infinity,'23:40–00:20','08:00–08:45'])assert.equal(parse({4:invalid}).rows.length,0,String(invalid))
 assert.equal(parse({4:'08:00–08:45',8:45}).errors.length,0)
 assert.equal(parse({4:'23:40'}).rows.length,0)
})

test('defaults only missing session/duration with visible warnings and rejects invalid integers',()=>{
 const result=parse({5:'',8:''})
 assert.equal(result.rows[0].session,1)
 assert.equal(result.rows[0].duration,40)
 assert.equal(result.warnings.length,2)
 assert.ok(result.warnings.every(warning=>warning.rowNumber===2))
 for(const invalid of [0,-1,1.5,'1e1',true,1441])assert.equal(parse({5:invalid}).rows.length,0)
 for(const invalid of [0,-1,40.5,'40 menit',true,481])assert.equal(parse({8:invalid}).rows.length,0)
})

test('validates row destinations, reports bad row numbers, and retains independently valid rows',()=>{
 const result=parseScheduleRows([headers,row(),[],row({0:'rusak'}),row({0:'0000000000000002',6:'',7:'Itjen 2'})])
 assert.equal(result.rows.length,2)
 assert.deepEqual(result.rows.map(item=>item.rowNumber),[2,5])
 assert.equal(result.errors[0].rowNumber,4)
 assert.equal(parse({6:'',7:''}).rows.length,0)
 assert.equal(parse({6:201}).rows.length,0)
 assert.equal(parse({7:123}).rows.length,0)
 assert.equal(parse({9:'x'.repeat(4001)}).rows.length,0)
 assert.equal(parseScheduleRows([headers,row().concat(['tanpa judul'])]).rows.length,0)
})

test('CSV supports comma, semicolon, tab, BOM, CRLF, exact text identifiers and escaped quotes',()=>{
 for(const delimiter of [',',';','\t']) {
  const input=`\uFEFF${csv(delimiter)}`
  const result=parseScheduleCsv(input)
  assert.deepEqual(result.errors,[])
  assert.equal(result.rows[0].nik,nik)
 }
 const result=parseScheduleCsv(`NIK,Tanggal,Jam Mulai,Room,Catatan\r\n'${nik},2026-10-19,08:00,Room 1,"Bawa berkas, lalu \"\"konfirmasi\"\""\r\n`)
 assert.equal(result.rows[0].nik,nik)
 assert.equal(result.rows[0].notes,'Bawa berkas, lalu "konfirmasi"')
})

test('quoted newlines retain their content and map errors to physical CSV lines',()=>{
 const result=parseScheduleCsv(`NIK;Tanggal;Jam Mulai;Room;Catatan\r\n${nik};2026-10-19;08:00;Room 1;"baris satu\r\nbaris dua"\r\nrugit;2026-10-19;08:40;Room 1;`)
 assert.equal(result.rows[0].notes,'baris satu\nbaris dua')
 assert.equal(result.rows[0].rowNumber,2)
 assert.equal(result.errors[0].rowNumber,4)
})

test('rejects malformed CSV quoting atomically',()=>{
 for(const bad of [`${csv()}\n"not closed`,`${csv()}\nabc"bad`,`${csv()}\n"closed"oops`,`${csv()}\n"closed" "again"`]) {
  const result=parseScheduleCsv(bad)
  assert.equal(result.rows.length,0)
  assert.equal(result.errors.length,1)
  assert.match(result.errors[0].message,/kutip/)
 }
 assert.equal(parseScheduleCsv('\0').rows.length,0)
})

test('caps file size, table rows, and columns before any application mutation',async()=>{
 assert.equal(parseScheduleRows([headers,...Array.from({length:5000},()=>row())]).rows.length,5000)
 assert.equal(parseScheduleRows([headers,...Array.from({length:5001},()=>row())]).rows.length,0)
 assert.match(parseScheduleRows([Array(101).fill('NIK')]).errors[0].message,/100 kolom/)
 assert.match(parseScheduleCsv('a'.repeat(8*1024*1024+1)).errors[0].message,/8 MiB/)
 const tooBig={name:'jadwal.csv',size:8*1024*1024+1,text(){throw Error('must not read')}}
 assert.match((await readScheduleFile(tooBig)).errors[0].message,/8 MiB/)
 assert.match((await readScheduleFile(new File(['x'],'jadwal.xls'))).errors[0].message,/Format/)
 assert.equal((await readScheduleFile(null)).rows.length,0)
 assert.equal((await readScheduleFile(new File([csv()],'jadwal.csv'))).rows.length,1)
})

test('real XLSX round trip preserves long text identities, native dates, times, and typed numeric identity errors',async()=>{
 const bytes=await workbook([headers,row({3:new Date('2026-10-19T00:00:00Z'),4:1/3}),row({0:1234567890123456})])
 const raw=await readXlsxFile(bytes)
 assert.equal(typeof raw[1][0],'string')
 assert.equal(typeof raw[2][0],'number')
 assert.equal(raw[1][3] instanceof Date,true)
 const result=parseScheduleRows(raw)
 assert.equal(result.rows.length,1)
 assert.equal(result.rows[0].nik,nik)
 assert.equal(result.rows[0].time,'08:00')
 assert.equal(result.errors[0].rowNumber,3)
 const browserResult=await withBrowserXml(()=>readScheduleFile(new File([bytes],'jadwal.xlsx')))
 assert.deepEqual(browserResult,result)
})

test('XLSX import chooses the named Jadwal sheet and rejects ambiguous workbooks',async()=>{
 const sheets=[{sheet:'Petunjuk',data:cells([['Baca petunjuk']])},{sheet:'Jadwal',data:cells([headers,row()])}]
 const bytes=await writeXlsxFile(sheets).toBuffer()
 await withBrowserXml(async()=>{
  const result=await readScheduleFile(new File([bytes],'jadwal.xlsx'))
  assert.equal(result.rows.length,1)
  sheets[1].sheet='ASN'
  const ambiguous=await writeXlsxFile(sheets).toBuffer()
  assert.match((await readScheduleFile(new File([ambiguous],'jadwal.xlsx'))).errors[0].message,/beberapa sheet/)
  assert.match((await readScheduleFile(new File(['rusak'],'jadwal.xlsx'))).errors[0].message,/tidak dapat dibaca/)
 })
})

test('XLSX numeric date serials follow the workbook 1904 epoch',async()=>{
 const bytes=await workbook([headers,row({3:46314-1462})]),entries=unzipSync(bytes)
 const xml=strFromU8(entries['xl/workbook.xml']).replace('<workbookPr/>','<workbookPr date1904="1"/>')
 // The writer may omit workbookPr entirely; insert it explicitly in that case.
 entries['xl/workbook.xml']=strToU8(xml.includes('date1904')?xml:xml.replace('<sheets>','<workbookPr date1904="1"/><sheets>'))
 const result=await withBrowserXml(()=>readScheduleFile(new File([zipSync(entries)],'jadwal.xlsx')))
 assert.equal(result.rows[0]?.date,'2026-10-19',JSON.stringify(result))
})
