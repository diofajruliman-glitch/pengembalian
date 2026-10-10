const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
export const SP2D_YEAR_SHEETS = ['Sheet12','DATA DEBET TAHAP IV','Sheet1','Hasil debet tahap III']
// These auxiliary sheets establish a source year, not a numbered SP2D document
// or a verified receipt. Never add their amounts to the reconciled bank master.
export function inspectSp2dYears(sources, results) {
 const people = new Map(), obligations = new Set()
 for (const result of results) {
  for (const person of result.people) {
   const list = people.get(person.nip) || []
   list.push(person); people.set(person.nip,list)
  }
  for (const row of result.obligations) if (row.amount > 0) obligations.add(`${row.nip}|${row.bank}|${row.year}`)
 }
 return Object.entries(sources).map(([sheet, rows]) => {
  const labels = (rows[0] || []).map(normalize)
  const nipCol = labels.indexOf('NIP'), yearCol = labels.findIndex(v => /^TAHUN SP2D(?: UPDATE)?$/.test(v))
  const nameCol = labels.indexOf('NAMA SK'), bankCol = labels.indexOf('NAMA BANK')
  const report = {sheet, rows:0, years:{}, matched:0, held:0, invalid:0, duplicateRows:0, missingHeaders:false}
  if ([nipCol,yearCol,nameCol,bankCol].some(c=>c<0)) return {...report,missingHeaders:true}
  const parsed=[], counts=new Map()
  for (let i=1;i<rows.length;i++) {
   const row=rows[i] || [], raw=row[nipCol]
   if (raw===undefined || raw===null || raw==='') continue
   report.rows++
   const year=typeof row[yearCol]==='number'?row[yearCol]:/^\d{4}$/.test(String(row[yearCol]??'').trim())?Number(row[yearCol]):NaN
   if (typeof raw!=='string' || !/^\d{18}$/.test(raw.trim()) || !Number.isInteger(year) || year<2000 || year>2100) {report.invalid++;continue}
   const nip=raw.trim(), bank=normalize(row[bankCol]).replace(/^BANK /,'')
   const key=`${nip}|${bank}|${year}`
   counts.set(key,(counts.get(key)||0)+1)
   parsed.push({nip,year,bank,key,name:normalize(row[nameCol])})
   report.years[year]=(report.years[year]||0)+1
  }
  for (const row of parsed) {
   if (counts.get(row.key)>1) {report.duplicateRows++;report.held++;continue}
   const candidates=people.get(row.nip)||[], person=candidates[0]
   if (candidates.length===1 && normalize(person.bank)===row.bank && normalize(person.nama)===row.name && obligations.has(`${row.nip}|${person.bank}|${row.year}`)) report.matched++
   else report.held++
  }
  return report
 })
}
