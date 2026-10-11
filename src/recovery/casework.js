import {obligationKey} from '../import/masterWorkbook.js'
export function caseworkClient(client,mode,url){
 if(!client||mode!=='production-casework')return null
 try{if(new URL(url).origin!=='https://tagokvlsirebfgltbxmq.supabase.co')return null}catch{return null}
 return {client,rpc:async(action,payload={})=>{if(!['summary','detail','record','import_review','commit_import'].includes(action))throw Error('Operasi tidak tersedia.');const q=await client.rpc('recovery_casework_rpc',{p_action:action,p_payload:payload});if(q.error)throw new Error(caseworkError(q.error.message));return q.data}}
}
export function applyCasework(snapshot,rows){
 const byNip=new Map(rows.map(r=>[r.nip,r]))
 const results=snapshot.results.map(result=>{
  const receipts=rows.flatMap(r=>(r.receipts||[]).filter(p=>p.verification==='verified').map(p=>({...p,nip:r.nip})))
  const included=new Map();for(const p of receipts.filter(p=>p.included)){const k=[obligationKey(p),p.stage].join('|');included.set(k,(included.get(k)||0)+p.amount)}
  const payments=result.payments.map(p=>{const amount=included.get([obligationKey(p),p.stage].join('|'))||0;if(amount>p.amount)throw Error('Setoran yang dicocokkan melebihi nominal workbook.');return {...p,amount:p.amount-amount,sourceAmount:p.amount}})
  const known=new Set(result.people.map(p=>p.nip))
  payments.push(...receipts.filter(p=>known.has(p.nip)).map(p=>({...p,source:'direct-receipt',paymentDate:p.paymentDate,ntpnReferences:[{code:p.ntpn,scope:'individual',verification:'verified'}]})))
  return {...result,payments,people:result.people.map(p=>{const work=byNip.get(p.nip);return work?{...p,casework:work,...((work.status||work.needsReview)?{sourceMetadata:{...p.sourceMetadata,status:work.status||p.sourceMetadata?.status||p.status_sdm||'Aktif',needsReview:!!work.needsReview}}:{})}:p})}
 })
 return {...snapshot,results,caseworkLoaded:true}
}
export async function attachCasework(snapshot,api){
 const rows=[];let after=''
 for(;;){const q=await api.rpc('summary',{after});if(q.revision!==snapshot.revision||q.rows.some((r,i)=>r.nip<=(i?q.rows[i-1].nip:after)))throw Error('Tindak lanjut berubah. Muat ulang master.');rows.push(...q.rows);if(q.rows.length<500)break;after=q.rows.at(-1).nip}
 const end=await api.rpc('summary',{after});if(end.revision!==snapshot.revision)throw Error('Tindak lanjut berubah. Muat ulang master.')
 return applyCasework(snapshot,rows)
}
export async function uploadEvidence(api,nip,file,requestId){
 if(!file||!['application/pdf','image/jpeg','image/png'].includes(file.type)||file.size>10*1024*1024)throw Error('Pilih PDF, JPG, atau PNG maksimal 10 MB.')
 const {data,error}=await api.client.auth.getUser();if(error||!data.user)throw Error('Sesi berakhir. Masuk kembali.')
 const ext={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'}[file.type],path=`${nip}/${data.user.id}/${requestId}.${ext}`
 const q=await api.client.storage.from('recovery-evidence').upload(path,file,{contentType:file.type,upsert:false});if(q.error)throw q.error;return path
}
export async function evidenceUrl(api,path){const q=await api.client.storage.from('recovery-evidence').createSignedUrl(path,60);if(q.error)throw q.error;return q.data.signedUrl}
export const eventLabels={note:'Tindak lanjut',status_report:'Laporan SDM nonaktif',status_verified:'Status nonaktif diperiksa',status_rejected:'Laporan status ditolak',receipt_submitted:'Bukti setoran diterima',receipt_verified:'Setoran diverifikasi',receipt_rejected:'Bukti ditolak',workbook_match:'Setoran dicocokkan ke workbook'}
export function caseworkError(message=''){const messages={SECOND_REVIEWER_REQUIRED:'Setoran harus diverifikasi admin berbeda dari petugas yang mencatat bukti.',WORKBOOK_CHANGED_RECHECK_RECEIPT:'Nominal tahap ini berubah sejak bukti dicatat. Periksa apakah setoran sudah masuk workbook sebelum memverifikasi.',DIRECT_RECEIPT_OVERPAYMENT:'Total pengembalian melebihi kewajiban. Periksa duplikasi atau alokasi setoran.',DIRECT_RECEIPTS_REVIEW_REQUIRED:'Cocokkan setoran langsung dengan workbook sebelum menyimpan.',MATCH_EXCEEDS_WORKBOOK_INCREASE:'Setoran yang dipilih melebihi kenaikan nominal tahap dalam workbook.',MATCHED_RECEIPT_CORRECTION_REQUIRES_REVIEW:'Koreksi menurunkan tahap yang sudah memiliki bukti individual. Rekonsiliasi bukti diperlukan sebelum koreksi.',ADMIN_REQUIRED:'Pemeriksaan ini hanya dapat disahkan admin.',EVIDENCE_NOT_FOUND:'Lampiran belum tersedia atau tidak sesuai dengan SDM dan petugas.',FORBIDDEN:'Akun tidak memiliki hak untuk tindakan ini.'};return Object.entries(messages).find(([code])=>message.includes(code))?.[1]||message}
export function caseworkExport(selection){return [['NIP','Nama','Status sumber','Status tindak lanjut','PIC','Tenggat','Hasil terakhir','NTPN setoran langsung','Nominal setoran langsung','Status verifikasi','Sudah dalam workbook'],...selection.rows.flatMap(p=>{const note=p.casework?.lastNote||{},receipts=p.casework?.receipts||[];return (receipts.length?receipts:[{}]).map(r=>[p.nip,p.nama,p.sourceMetadata?.status||p.status_sdm||'',note.status||'Belum dicatat',note.pic||'',note.deadline||'',note.note||'',r.ntpn||'',r.amount??'',r.verification||'',r.id?(r.included?'Ya':'Belum'):''])})]}
