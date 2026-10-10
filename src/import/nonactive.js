const categories=new Map(['SP3','Mengundurkan Diri','Meninggal Dunia','BUP'].map(v=>[v.toUpperCase(),v]))
const normalized=v=>String(v??'').trim().replace(/\s+/g,' ').toUpperCase()
const normalizeNip = value => {
 if(value===null||value===undefined) return ''
 if(typeof value === 'number') return Number.isSafeInteger(value) ? String(value) : ''
 return String(value).replace(/\s+/g,'').trim()
}
export function parseNonactive(rows){
 const header=rows.findIndex(r=>r.some(v=>normalized(v)==='NIP'))
 if(header<0)return {records:[],issues:[{code:'NONACTIVE_HEADER_MISSING'}]}
 const labels=rows[header].map(normalized),columns=['NIP','NAMA','KATEGORI','TANGGAL BERHENTI','ALASAN'].map(v=>labels.indexOf(v))
 if(columns.some(c=>c<0))return {records:[],issues:[{code:'NONACTIVE_REQUIRED_COLUMN_MISSING'}]}
 const [nipCol,nameCol,categoryCol,dateCol,reasonCol]=columns,records=[],issues=[],seen=new Set(),duplicates=new Set()
 for(let i=header+1;i<rows.length;i++){
  const r=rows[i],nip=normalizeNip(r[nipCol]);if(r.every(v=>v===null||v===undefined||v===''))continue
  if(!/^\d{18}$/.test(nip)){issues.push({code:'NONACTIVE_INVALID_NIP',row:i+1});continue}
  if(seen.has(nip)){duplicates.add(nip);issues.push({code:'NONACTIVE_DUPLICATE_NIP',row:i+1});continue}seen.add(nip)
  const category=categories.get(normalized(r[categoryCol]));if(!category){issues.push({code:'NONACTIVE_UNKNOWN_CATEGORY',row:i+1});continue}
  records.push({nip,nama:String(r[nameCol]??'').trim(),category,endDateRaw:r[dateCol]??null,reasonRaw:r[reasonCol]??null})
 }
 return {records:records.filter(r=>!duplicates.has(r.nip)),issues}
}
export function matchNonactive(results,parsed){
 const byNip=new Map(),matches=new Map(),unmatched=[],nameMismatches=[]
 for(const result of results)for(const p of result.people){if(!byNip.has(p.nip))byNip.set(p.nip,[]);byNip.get(p.nip).push(p)}
 const counts={},issues=[...parsed.issues],review=[]
 for(const r of parsed.records){counts[r.category]=(counts[r.category]||0)+1;const candidates=byNip.get(r.nip)||[]
  if(candidates.length!==1){unmatched.push(r);if(candidates.length>1)issues.push({code:'NONACTIVE_AMBIGUOUS_BANK_NIP'});review.push({...r,masterName:'',bank:'',matchStatus:candidates.length?'NIP ambigu':'Belum cocok'});continue}
  const differentName=normalized(candidates[0].nama)!==normalized(r.nama)
  if(differentName)nameMismatches.push(r.nip)
  review.push({...r,masterName:candidates[0].nama,bank:candidates[0].bank,matchStatus:differentName?'Nama berbeda':'Cocok'})
  matches.set(r.nip,r)
 }
 return {results:results.map(r=>({...r,people:r.people.map(p=>matches.has(p.nip)?{...p,nonactive:matches.get(p.nip)}:{...p})})),summary:{records:parsed.records.length,matched:matches.size,unmatched:unmatched.length,nameMismatches:nameMismatches.length,categories:counts,issues},unmatched,review}
}
export function selectNonactiveReview(review,{status='',category='',search=''}={}){
 const term=normalized(search)
 return review.filter(r=>(!status||r.matchStatus===status)&&(!category||r.category===category)&&(!term||[r.nip,r.nama,r.masterName,r.bank].some(v=>normalized(v).includes(term))))
}
export function nonactiveReviewExport(rows,issues=[]){
 return {review:[['NIP','Nama sumber nonaktif','Nama master bank','Bank master','Kategori sumber','Hasil pencocokan','Tanggal berhenti (nilai mentah sumber)','Alasan sumber','Catatan tinjauan'],...rows.map(r=>[r.nip,r.nama,r.masterName,r.bank,r.category,r.matchStatus,r.endDateRaw??'',r.reasonRaw??'',r.matchStatus==='Cocok'?'Cocok berdasarkan NIP; status belum diverifikasi':r.matchStatus==='Nama berbeda'?'Periksa perbedaan nama; nama master dipertahankan':'Periksa sumber/master; jangan tambah kewajiban otomatis'])],issues:[['Masalah sumber','Baris Excel'],...issues.map(r=>[r.code,r.row??''])]}
}
