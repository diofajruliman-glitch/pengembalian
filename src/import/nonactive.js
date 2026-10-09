const categories=new Map(['SP3','Mengundurkan Diri','Meninggal Dunia','BUP'].map(v=>[v.toUpperCase(),v]))
const normalized=v=>String(v??'').trim().replace(/\s+/g,' ').toUpperCase()
export function parseNonactive(rows){
 const header=rows.findIndex(r=>r.some(v=>normalized(v)==='NIP'))
 if(header<0)return {records:[],issues:[{code:'NONACTIVE_HEADER_MISSING'}]}
 const labels=rows[header].map(normalized),columns=['NIP','NAMA','KATEGORI','TANGGAL BERHENTI','ALASAN'].map(v=>labels.indexOf(v))
 if(columns.some(c=>c<0))return {records:[],issues:[{code:'NONACTIVE_REQUIRED_COLUMN_MISSING'}]}
 const [nipCol,nameCol,categoryCol,dateCol,reasonCol]=columns,records=[],issues=[],seen=new Set(),duplicates=new Set()
 for(let i=header+1;i<rows.length;i++){
  const r=rows[i],nip=r[nipCol];if(r.every(v=>v===null||v===undefined||v===''))continue
  if(typeof nip!=='string'||!/^\d{18}$/.test(nip)){issues.push({code:'NONACTIVE_INVALID_NIP',row:i+1});continue}
  if(seen.has(nip)){duplicates.add(nip);issues.push({code:'NONACTIVE_DUPLICATE_NIP',row:i+1});continue}seen.add(nip)
  const category=categories.get(normalized(r[categoryCol]));if(!category){issues.push({code:'NONACTIVE_UNKNOWN_CATEGORY',row:i+1});continue}
  records.push({nip,nama:String(r[nameCol]??'').trim(),category,endDateRaw:r[dateCol]??null,reasonRaw:r[reasonCol]??null})
 }
 return {records:records.filter(r=>!duplicates.has(r.nip)),issues}
}
export function matchNonactive(results,parsed){
 const byNip=new Map(),matches=new Map(),unmatched=[],nameMismatches=[]
 for(const result of results)for(const p of result.people){if(!byNip.has(p.nip))byNip.set(p.nip,[]);byNip.get(p.nip).push(p)}
 const counts={},issues=[...parsed.issues]
 for(const r of parsed.records){counts[r.category]=(counts[r.category]||0)+1;const candidates=byNip.get(r.nip)||[]
  if(candidates.length!==1){unmatched.push(r);if(candidates.length>1)issues.push({code:'NONACTIVE_AMBIGUOUS_BANK_NIP'});continue}
  if(normalized(candidates[0].nama)!==normalized(r.nama))nameMismatches.push(r.nip)
  matches.set(r.nip,r)
 }
 return {results:results.map(r=>({...r,people:r.people.map(p=>matches.has(p.nip)?{...p,nonactive:matches.get(p.nip)}:{...p})})),summary:{records:parsed.records.length,matched:matches.size,unmatched:unmatched.length,nameMismatches:nameMismatches.length,categories:counts,issues},unmatched}
}
