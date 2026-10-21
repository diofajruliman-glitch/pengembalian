import fs from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'

const buf = fs.readFileSync('public/templates/sptjm-2026.docx')
const unzipped = unzipSync(new Uint8Array(buf))
const xml = strFromU8(unzipped['word/document.xml'])

// Print paragraphs outside tables
const pMatches = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || []
console.log('Total paragraphs:', pMatches.length)
pMatches.forEach((p, i) => {
  const text = (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')
  if (text.trim()) {
    console.log(`P ${i}: "${text}"`)
  }
})
