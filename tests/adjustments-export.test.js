import test from 'node:test'
import assert from 'node:assert/strict'
import {adjustmentExport,collectFilteredRows,latestHistoryRows} from '../src/adjustments/export.js'
import write from 'write-excel-file/node'
import {unzipSync,strFromU8} from 'fflate'
const row=(n,extra={})=>({sourceRow:n,nip:'000000000000000001',name:'Uji',periodYear:2025,month:'Oktober',initial:100,final:80,delta:-20,changed:true,statusChanged:false,reasons:['WITA'],evidence:[{reason:'WITA',origin:'aturan'}],...extra})
test('export preserves text NIP and missing amounts, groups people, and newest history excludes previous imports',()=>{
 const rows=[row(2),row(3,{initial:null,final:5,delta:null})],tables=adjustmentExport(rows,{month:'Oktober'})
 assert.equal(tables.detail[1][0],'000000000000000001');assert.equal(tables.detail[2][7],null)
 assert.deepEqual(tables.summary[1].slice(2),[2,100,85,-20,1,0,1])
 assert.deepEqual(latestHistoryRows([row(2,{importId:1}),row(2,{importId:2})]).map(r=>r.importId),[2])
})
test('export collects all pages and rejects snapshot changes or incomplete data',async()=>{
 const api={manifest:async()=>({sha256:'same',preparedAt:'version'}),query:async(f,page)=>({rows:page===0?[row(2),row(3)]:[row(4)],page,pageSize:2,summary:{rows:3,initial:300,final:240,delta:-60}})}
 assert.equal((await collectFilteredRows(api,{},new AbortController().signal)).length,3)
 await assert.rejects(collectFilteredRows({...api,query:async(f,page)=>({rows:[row(2)],page,pageSize:2,summary:{rows:3,initial:300,final:240,delta:-60}})},{}),/tidak lengkap/)
 let calls=0
 await assert.rejects(collectFilteredRows({...api,manifest:async()=>({sha256:String(calls++)})},{}),/Versi data berubah/)
 const controller=new AbortController();controller.abort()
 await assert.rejects(collectFilteredRows(api,{},controller.signal),{name:'AbortError'})
})
test('generated Excel contains text identifiers and numeric amounts across three sheets',async()=>{
 const tables=adjustmentExport([row(2)],{})
 const data=Object.entries(tables).map(([sheet,rows])=>({sheet,data:rows.map(r=>r.map(v=>({value:v??'',type:typeof v==='number'?Number:String})))}))
 const zip=unzipSync(await write(data).toBuffer())
 const xml=Object.entries(zip).filter(([key])=>key.endsWith('.xml')).map(([,bytes])=>strFromU8(bytes)).join('\n')
 assert.match(xml,/000000000000000001/)
 assert.equal(Object.keys(zip).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).length,3)
 assert.match(strFromU8(zip['xl/worksheets/sheet1.xml']),/<v>100<\/v>/)
})
