import fs from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'

const buf = fs.readFileSync('public/templates/sptjm-2026.docx')
const unzipped = unzipSync(new Uint8Array(buf))
const xml = strFromU8(unzipped['word/document.xml'])

const tblMatch = xml.match(/<w:tbl[\s\S]*?<\/w:tbl>/)
if (tblMatch) {
  const tbl = tblMatch[0]
  const trs = tbl.match(/<w:tr[\s\S]*?<\/w:tr>/g) || []
  console.log(`Found ${trs.length} rows in table:`)
  trs.forEach((tr, idx) => {
    const tcs = tr.match(/<w:tc[\s\S]*?<\/w:tc>/g) || []
    console.log(`--- Row ${idx} (${tcs.length} cells) ---`)
    tcs.forEach((tc, cIdx) => {
      const tcW = tc.match(/<w:tcW\s+w:w="([^"]+)"\s+w:type="([^"]+)"/)
      const text = (tc.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')
      console.log(`  Cell ${cIdx}: width=${tcW ? tcW[1] : 'none'}, text="${text}"`)
    })
  })
}
