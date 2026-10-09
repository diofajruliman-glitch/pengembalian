// Read-only view: authoritative master amounts require a valid stored reference.
import {indexSnapshot,selectProgress} from './progress.js'
const normal=v=>String(v??'').trim().replace(/\s+/g,' ').toUpperCase()
const amount=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:null}
export function linkedCaseRows(snapshot,cases,links,{simulation=false}={}){
 const masters=new Map(selectProgress(indexSnapshot(snapshot.results)).rows.map(p=>[p.nip,p])),references=new Map()
 for(const l of links){const key=String(l.case_id);if(!references.has(key))references.set(key,[]);references.get(key).push(l)}
 return cases.map(c=>{
  const refs=references.get(String(c.id))||[],reference=refs.length===1?refs[0]:null,warnings=[];let finance=null,source='Manual'
  if(c.deleted_at)warnings.push('Kasus diarsipkan')
  if(!refs.length){const obligation=amount(c.kewajiban_total),payment=amount(c.realisasi_total);finance={obligation,payment,remaining:obligation!==null&&payment!==null&&payment<=obligation?obligation-payment:null,verified:null};if(finance.remaining===null)warnings.push('Nominal manual belum lengkap atau perlu ditinjau')}
  else{
   source=simulation?'Simulasi master':'Master tersimpan'
   const p=reference&&masters.get(reference.nip)
   if(refs.length!==1)warnings.push('Referensi kasus ganda')
   if(!simulation&&snapshot.source!=='database')warnings.push('Master tersimpan belum dimuat')
   if(reference&&reference.nip!==c.nip)warnings.push('NIP kasus berubah setelah penghubungan')
   if(!p)warnings.push('Master referensi belum tersedia')
   if(p&&(normal(p.nama)!==normal(c.nama)||p.bank!==c.bank))warnings.push('Nama atau bank berubah setelah penghubungan')
   if(!warnings.length)finance={obligation:p.obligation,payment:p.payment,remaining:p.remaining,verified:p.verified}
   if(!finance)source='Referensi perlu ditinjau'
  }
  if(c.status==='Lunas Terverifikasi'&&source!=='Manual'&&finance&&(finance.remaining>0||finance.verified<finance.obligation))warnings.push('Status lunas manual belum didukung nominal/verifikasi master')
  return {manual:{...c},reference,source,finance,warnings,currentRevision:snapshot.revision??null}
 })
}
export function linkedCaseExport(rows){return [['NIP','Nama','Sumber nominal','Kewajiban tampil','Pengembalian sumber','Sisa tampil','Penerimaan terverifikasi master','Status manual','PIC manual','Deadline manual','Catatan manual','Peringatan','Revisi master saat dibaca'],...rows.map(r=>[String(r.manual.nip),r.manual.nama,r.source,r.finance?.obligation??'',r.finance?.payment??'',r.finance?.remaining??'',r.finance?.verified??'',r.manual.status||'',r.manual.pic||'',r.manual.deadline||'',r.manual.catatan||'',r.warnings.join('; '),r.currentRevision??''])]}
export async function loadLinkedCaseRows(client){
 const meta=async()=>{const q=await client.rpc('recovery_linked_meta',{});if(q.error)throw q.error;return q.data}
 const start=await meta(),rows=[];let after='0',revision=start.revision
 for(;;){const q=await client.rpc('recovery_linked_cases',{p_after:after,p_limit:100});if(q.error)throw q.error
  if(revision!==null&&q.data.revision!==revision)throw Error('Master berubah selama pemuatan. Muat ulang monitoring.');revision=q.data.revision
  for(const r of q.data.rows){if(typeof r.manual.id==='number'&&!Number.isSafeInteger(r.manual.id))throw Error('Identitas kasus server tidak valid.');if(BigInt(r.manual.id)<=BigInt(after))throw Error('Urutan kasus server tidak valid.');after=String(r.manual.id);rows.push({...r,currentRevision:revision})}
  if(q.data.rows.length<100)break
 }
 const end=await meta();if(end.revision!==revision||end.caseToken!==start.caseToken||end.linkToken!==start.linkToken||rows.length!==start.cases)throw Error('Master, referensi, atau kasus berubah selama pemuatan. Muat ulang monitoring.')
 return {revision,rows}
}
