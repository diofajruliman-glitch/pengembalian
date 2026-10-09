import {indexSnapshot,selectProgress} from './progress.js'
const normal=v=>String(v??'').trim().replace(/\s+/g,' ').toUpperCase()
export function previewCaseLinks(snapshot,cases){
 const counts=new Map();for(const r of snapshot.results)for(const p of r.people)counts.set(p.nip,(counts.get(p.nip)||0)+1)
 const master=new Map(selectProgress(indexSnapshot(snapshot.results)).rows.map(p=>[p.nip,p]))
 const caseCounts=new Map();for(const c of cases)caseCounts.set(c.nip,(caseCounts.get(c.nip)||0)+1)
 const rows=cases.map(c=>{
  const candidate=master.get(c.nip),p=counts.get(c.nip)>1?null:candidate,issues=[]
  if(typeof c.nip!=='string'||!/^\d{18}$/.test(c.nip))issues.push('NIP kasus tidak valid')
  if(caseCounts.get(c.nip)>1)issues.push('Kasus ganda pada NIP yang sama')
  if(!candidate)issues.push('NIP belum ditemukan di master')
  if(counts.get(c.nip)>1)issues.push('NIP master ambigu')
  if(c.deleted_at)issues.push('Kasus diarsipkan; tidak dipulihkan otomatis')
  if(p&&normal(c.nama)!==normal(p.nama))issues.push('Nama kasus berbeda dari master')
  if(p&&c.bank&&c.bank!==p.bank)issues.push('Bank kasus berbeda dari master')
  if(p?.nonactive&&normal(p.nonactive.nama)!==normal(p.nama))issues.push('Nama sumber nonaktif perlu ditinjau')
  if(p&&c.status==='Lunas Terverifikasi'&&(p.remaining>0||p.verified<p.obligation))issues.push('Status lunas manual belum sesuai nominal/bukti master')
  return {nip:c.nip,manual:{...c},master:p||null,issues,action:issues.length?'Perlu tinjauan':'Hubungkan kasus yang ada'}
 })
 const candidates=[]
 for(const r of snapshot.nonactiveReview||[]){if(caseCounts.has(r.nip))continue;const p=counts.get(r.nip)===1?master.get(r.nip):null;candidates.push({nip:r.nip,nama:r.nama,category:r.category,master:p||null,action:r.matchStatus==='Cocok'&&p?'Belum ada kasus; tinjau kebutuhan tindak lanjut':'Tahan untuk pemeriksaan sumber',matchStatus:r.matchStatus})}
 return {rows,candidates,summary:{cases:rows.length,linkable:rows.filter(r=>!r.issues.length).length,held:rows.filter(r=>r.issues.length).length,candidates:candidates.length}}
}
export async function loadManualCases(client){
 const count=async()=>{const q=await client.from('sdm_cases').select('id',{count:'exact',head:true});if(q.error)throw q.error;if(q.count===null)throw Error('Jumlah kasus belum dapat dipastikan.');return q.count}
 const before=await count(),rows=[]
 for(let offset=0;offset<before;offset+=500){const q=await client.from('sdm_cases').select('*').order('id').range(offset,offset+499);if(q.error)throw q.error;rows.push(...q.data)}
 if(rows.length!==before||await count()!==before)throw Error('Daftar kasus berubah selama pemuatan. Muat ulang pratinjau.')
 return rows
}
export function caseLinkExport(plan){
 return {cases:[['NIP','Nama kasus','Nama master','Hasil pratinjau','Masalah','Kewajiban manual','Pengembalian manual','Kewajiban master','Pengembalian master','Sisa master','Status manual (dipertahankan)','PIC manual (dipertahankan)','Deadline manual (dipertahankan)','Catatan manual (dipertahankan)'],...plan.rows.map(r=>[r.nip,r.manual.nama,r.master?.nama||'',r.action,r.issues.join('; '),r.manual.kewajiban_total??'',r.manual.realisasi_total??'',r.master?.obligation??'',r.master?.payment??'',r.master?.remaining??'',r.manual.status||'',r.manual.pic||'',r.manual.deadline||'',r.manual.catatan||''])],candidates:[['NIP','Nama sumber','Kategori sumber','Hasil pencocokan','Tinjauan diperlukan'],...plan.candidates.map(r=>[r.nip,r.nama,r.category,r.matchStatus,r.action])]}
}
export const simulationCases=[{id:'sim-1',nip:'000000000000000901',nama:'SDM SIMULASI 1',bank:'Mandiri',kewajiban_total:999,realisasi_total:0,status:'Proses Penagihan',pic:'PIC SIMULASI',deadline:'2026-12-15',catatan:'Catatan manual simulasi dipertahankan'},{id:'sim-2',nip:'000000000000000902',nama:'SDM SIMULASI 2',bank:'BRI',kewajiban_total:400,realisasi_total:10,status:'Belum Lunas',pic:'PIC SIMULASI',deadline:'2026-12-15',catatan:'Tidak ditimpa oleh master'},{id:'sim-3',nip:'000000000000000999',nama:'SDM BELUM COCOK',bank:'BSI',status:'Perlu Telaah',pic:'PIC SIMULASI'}]
