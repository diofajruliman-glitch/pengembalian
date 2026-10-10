import {BANK_SHEETS,mapColumns} from './masterWorkbook.js'
const clean=v=>String(v??'').replace(/\s+/g,' ').trim()
const norm=v=>clean(v).toUpperCase()
export function normalizeSdmStatus(value){
 const s=norm(value)
 if(!s||s==='AKTIF')return 'Aktif'
 if(['RESIGN','MENGUNDURKAN DIRI'].includes(s))return 'Mengundurkan Diri'
 if(s==='MENINGGAL DUNIA')return 'Meninggal Dunia'
 if(s==='BUP')return 'BUP'
 if(['SUDAH PENSIUN','PENSIUN'].includes(s))return 'Pensiun'
 return 'Perlu pemeriksaan'
}
export const isNonactiveStatus=s=>['Mengundurkan Diri','Meninggal Dunia','BUP','Pensiun'].includes(normalizeSdmStatus(s))
export const statusOf=p=>p.sourceMetadata?.status||normalizeSdmStatus(p.nonactive?.category||p.status_sdm)
export const isSpecialTarget=t=>/MENINGGAL|RESIGN|PENSIUN|BUP|MENGUNDURKAN/.test(norm(t.kegiatan||t.kategori))
export function targetStatuses(target){
 const text=norm(target?.kegiatan||target?.kategori),statuses=[]
 if(text.includes('MENINGGAL'))statuses.push('Meninggal Dunia')
 if(/RESIGN|MENGUNDURKAN|PHK/.test(text))statuses.push('Mengundurkan Diri')
 if(/PENSIUN|BUP/.test(text))statuses.push('BUP','Pensiun')
 return statuses
}
const family=s=>s==='BUP'?'Pensiun':s
export function extractSourceMetadata(results,bankRows,{pensionRows=[],nonactiveReview=[]}={}){
 const sources=new Map(),issues=[],ntpnReferences=[]
 const add=(nip,record)=>{if(!sources.has(nip))sources.set(nip,[]);sources.get(nip).push(record)}
 const people=new Map(results.flatMap(r=>r.people).map(p=>[p.nip,p]))
 for(const [sheet,bank] of Object.entries(BANK_SHEETS)){
  const rows=bankRows[sheet]||[],firstData=rows.findIndex(r=>/^\d{18}$/.test(String(r?.[0]||'')))
  const labels=rows.slice(0,Math.max(firstData,2));const named=[]
  for(const row of labels)row.forEach((v,i)=>{if(norm(v)==='STATUS AKTIF'||norm(v)==='STATUS SDM')named.push(i)})
  const cols=[...new Set(named)]
  // An unnamed trailing column is accepted only if it contains explicit SDM statuses.
  if(!cols.length){const lastFinancial=Math.max(-1,...mapColumns(rows).columns.map(c=>c.index));const found=new Set();for(const row of rows.slice(Math.max(firstData,2)))if(/^\d{18}$/.test(String(row?.[0]||'')))row.forEach((v,i)=>{if(i>lastFinancial&&clean(v)&&isNonactiveStatus(v))found.add(i)});cols.push(...found)}
  if(cols.length>1){issues.push({code:'AMBIGUOUS_STATUS_COLUMN',sheet});continue}
  if(cols.length===1)for(let i=Math.max(firstData,2);i<rows.length;i++){const row=rows[i],nip=String(row?.[0]||'');if(!people.has(nip))continue;add(nip,{sheet,row:i+1,column:cols[0]+1,raw:clean(row[cols[0]]),status:normalizeSdmStatus(row[cols[0]])})}
  for(const c of mapColumns(rows).columns.filter(c=>c.type==='payment'))for(let i=0;i<Math.max(firstData,0);i++){
   const raw=clean(rows[i]?.[c.index]);const codes=[...new Set(raw.match(/\b[A-Z0-9]{16}\b/g)||[])].filter(v=>/[A-Z]/.test(v)&&/\d/.test(v))
   for(const code of codes)ntpnReferences.push({bank,kind:c.kind,year:c.year,stage:c.stage,code,sheet,row:i+1,column:c.index+1,scope:'payment-stage',verification:'pending'})
  }
 }
 for(const r of nonactiveReview){if(!people.has(r.nip))continue;if(r.matchStatus==='Cocok')add(r.nip,{sheet:'master tidak aktif',raw:r.category,status:normalizeSdmStatus(r.category)});else if(r.matchStatus==='Nama berbeda'){issues.push({code:'NONACTIVE_NAME_MISMATCH',nip:r.nip});add(r.nip,{sheet:'master tidak aktif',raw:r.category,status:'Perlu pemeriksaan'})}}
 for(let i=0;i<pensionRows.length;i++){const row=pensionRows[i],nip=String(row?.[0]||'');if(!people.has(nip)||norm(row?.[17])!=='SUDAH PENSIUN')continue;const p=people.get(nip);if(norm(p.nama)!==norm(row[3])){issues.push({code:'PENSION_NAME_MISMATCH',nip,sheet:'Sheet1',row:i+1});continue}add(nip,{sheet:'Sheet1',row:i+1,column:18,raw:clean(row[17]),status:'Pensiun'})}
 const reviewed=results.map(r=>({...r,people:r.people.map(p=>{
  const records=sources.get(p.nip)||[],explicit=records.filter(r=>isNonactiveStatus(r.status)),families=new Set(explicit.map(r=>family(r.status)))
  const conflict=families.size>1,invalid=records.some(r=>r.status==='Perlu pemeriksaan')
  const status=conflict?'Perlu pemeriksaan':explicit.length?(explicit.some(r=>r.status==='Pensiun')?'Pensiun':explicit[0].status):invalid?'Perlu pemeriksaan':normalizeSdmStatus(p.nonactive?.category||p.status_sdm)
  if(conflict||invalid)issues.push({code:conflict?'STATUS_CONFLICT':'STATUS_SOURCE_ERROR',nip:p.nip})
  return {...p,sourceMetadata:{status,sources:records,needsReview:conflict||invalid}}
 }),payments:r.payments.map(p=>({...p,ntpnReferences:p.amount>0?ntpnReferences.filter(n=>n.bank===p.bank&&n.kind===p.kind&&n.year===p.year&&n.stage===p.stage):[]}))}))
 return {results:reviewed,issues,ntpnReferences,summary:{statusSources:sources.size,held:reviewed.flatMap(r=>r.people).filter(p=>p.sourceMetadata.needsReview).length,ntpnReferences:ntpnReferences.length}}
}
