import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {unzipSync,strFromU8} from 'fflate'

test('BAP template prints inline letterhead, aligned borderless identities and clean signatures',async()=>{
 const files=unzipSync(await readFile(new URL('../public/templates/bap-2026.docx',import.meta.url)))
 const xml=strFromU8(files['word/document.xml'])
 assert.ok(files['word/media/image1.png']?.length>10000,'original letterhead image retained')
 assert.ok(xml.includes('<wp:inline '),'letterhead participates in text flow')
 assert.ok(!xml.includes('<wp:anchor '),'no behind-text image omitted by PDF capture')
 assert.ok(!/<w:color\b[^>]*w:val="(?!000000)[^"]+"/.test(xml),'body text has no theme tint')
 const tables=xml.match(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g)
 assert.equal(tables.length,4)
 const rowCount=t=>[...t.matchAll(/<w:tr\b/g)].length
 assert.deepEqual(tables.slice(0,3).map(rowCount),[4,5,88])
 assert.ok(rowCount(tables[3])>=9,'each signature has writing room')
 for(const table of tables){
  assert.ok(!/<w:(?:top|left|right|bottom|insideH|insideV)\b[^>]*w:val="single"/.test(table),'layout cells do not print gridlines')
  assert.ok(!/w:fill="(?!FFFFFF)[0-9A-Fa-f]{6}"/.test(table),'layout cells have white background')
 }
 for(const identity of tables.slice(0,2)){
  assert.ok(identity.includes('<w:gridCol w:w="1900"/>'))
  assert.ok(identity.includes('<w:gridCol w:w="220"/>'))
  assert.equal([...identity.matchAll(/<w:t[^>]*>:</g)].length,rowCount(identity),'one aligned colon cell per identity row')
 }
 const signature=tables[3]
 assert.ok(signature.includes('19761106 200502 1 001'))
 assert.equal([...signature.matchAll(/>Faisal<\/w:t>/g)].length,1)
 assert.equal([...signature.matchAll(/>Nama<\/w:t>/g)].length,3,'participant, Faisal and assigned interviewer')
 assert.equal([...signature.matchAll(/>Tanda tangan<\/w:t>/g)].length,3)
 assert.ok(!signature.includes('Pewawancara:'),'interviewer block has no extra heading')
 assert.ok(signature.includes('{pewawancaraNama}'))
 assert.ok(signature.includes('{pewawancaraNip}'))
 const signatureRows=signature.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g)
 assert.ok(signatureRows.findIndex(r=>r.includes('{pewawancaraNama}'))>signatureRows.findIndex(r=>r.includes('>Faisal</w:t>')),'interviewer block sits below Faisal')
 assert.equal([...signature.matchAll(/w:val="800"/g)].length,2,'separate blank space for both right signatures')
 assert.equal([...tables[2].matchAll(/w:leader="hyphen"/g)].length,22,'answer ends use Word dash leaders')
 assert.ok(!/>{?_{3,}/.test(tables[2]),'spacer rows contain no placeholder underlines')
})

test('BAP retains the original paraf boxes in a repeating footer with a live page number',async()=>{
 const files=unzipSync(await readFile(new URL('../public/templates/bap-2026.docx',import.meta.url)))
 const document=strFromU8(files['word/document.xml']),footer=strFromU8(files['word/footer1.xml'])
 assert.ok(document.includes('<w:footerReference w:type="default"'),'footer repeats on every page')
 assert.ok(/<w:fldSimple\b[^>]*w:instr=" PAGE "/.test(footer))
 assert.equal([...footer.matchAll(/<w:tc\b/g)].length,7,'page box, spacer and five paraf boxes')
 for(const n of ['1','2','3','4','5'])assert.ok(footer.includes(`>${n}</w:t>`))
 assert.ok(footer.includes('w:val="single"'),'paraf boxes remain visibly bordered')
})
