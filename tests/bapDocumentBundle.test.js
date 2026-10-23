import test from 'node:test'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {build} from 'vite'

test('document preview and PDF dependencies load with the editor before any document action',async()=>{
 const result=await build({
  configFile:false,logLevel:'silent',
  build:{write:false,minify:false,target:'es2022',lib:{entry:fileURLToPath(new URL('../src/bap/documents.js',import.meta.url)),formats:['es']}}
 })
 const chunks=(Array.isArray(result)?result:[result]).flatMap(output=>output.output).filter(item=>item.type==='chunk')
 const entry=chunks.find(chunk=>chunk.isEntry)
 assert.ok(entry.exports.includes('renderPreview'));assert.ok(entry.exports.includes('buildPdf'))
 const loaded=new Set()
 function visit(name){
  if(loaded.has(name))return
  loaded.add(name)
  const chunk=chunks.find(item=>item.fileName===name)
  for(const dependency of chunk?.imports||[])visit(dependency)
 }
 visit(entry.fileName)
 for(const dependency of ['docx-preview','html2canvas','jspdf']){
  const containing=chunks.filter(chunk=>Object.keys(chunk.modules).some(id=>id.replaceAll('\\','/').includes(`/node_modules/${dependency}/`)))
  assert.ok(containing.length,`${dependency} must be present in the bundle`)
  assert.ok(containing.every(chunk=>loaded.has(chunk.fileName)),`${dependency} must not wait for a document-action dynamic import`)
 }
})
