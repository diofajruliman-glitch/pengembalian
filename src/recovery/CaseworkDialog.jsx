import React,{useEffect,useRef,useState} from 'react'
import {eventLabels,evidenceUrl,uploadEvidence} from './casework.js'
const rp=n=>'Rp '+Number(n||0).toLocaleString('id-ID')
export default function CaseworkDialog({person,target,type,api,isAdmin,canWrite,onClose,onSaved}){
 const [detail,setDetail]=useState(null),[mode,setMode]=useState('note'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[done,setDone]=useState(false)
 const [draft,setDraft]=useState({note:'',pic:target?.pic||'',deadline:target?.deadline||'',status:'Proses Penagihan',statusSdm:'Mengundurkan Diri',obligation:'',stage:'7',amount:'',ntpn:'',paymentDate:'',notInWorkbook:false}),[file,setFile]=useState(null)
 const request=useRef(null),uploaded=useRef(null)
 useEffect(()=>{let live=true;api.rpc('detail',{nip:person.nip}).then(q=>{if(live)setDetail(q)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[api,person.nip])
 const field=(key,value)=>setDraft(old=>({...old,[key]:value}))
 const refresh=async()=>{setDetail(await api.rpc('detail',{nip:person.nip}));try{await onSaved?.()}catch{setError('Data tersimpan, tetapi master belum berhasil dimuat ulang. Muat ulang sebelum melanjutkan.')}}
 const submit=async()=>{
  setBusy(true);setError('')
  try{
   if(!request.current){
    if(draft.note.trim().length<3)throw Error('Isi hasil atau alasan tindak lanjut minimal 3 karakter.')
    const id=uploaded.current?.id||crypto.randomUUID();let data={note:draft.note.trim(),targetType:type,targetNo:target.no}
    if(mode==='note'){if(!draft.pic.trim()||!draft.deadline)throw Error('Isi PIC dan tanggal tindak lanjut berikutnya.');data={...data,pic:draft.pic.trim(),deadline:draft.deadline,status:draft.status}}
    if(mode==='status_report')data={...data,status:draft.statusSdm}
    if(mode==='receipt_submitted'){
     const obligation=person.obligations[Number(draft.obligation)],amount=Number(draft.amount),stage=Number(draft.stage)
     if(draft.obligation===''||!obligation||!Number.isSafeInteger(amount)||amount<=0||!Number.isInteger(stage)||stage<1||stage>100||!draft.paymentDate||!/^[A-Z0-9]{16}$/.test(draft.ntpn.toUpperCase())||!draft.notInWorkbook)throw Error('Lengkapi jenis/tahun, tahap, nominal, tanggal, NTPN 16 karakter, dan konfirmasi pembayaran belum masuk master.')
     data={...data,bank:obligation.bank,kind:obligation.kind,year:obligation.year,amount,stage,ntpn:draft.ntpn.toUpperCase(),paymentDate:draft.paymentDate,notInWorkbook:true}
    }
    if(mode!=='note'&&!file)throw Error('Lampirkan dokumen status atau bukti setoran.')
    if(file){if(!uploaded.current)uploaded.current={id,path:await uploadEvidence(api,person.nip,file,id)};data.evidencePath=uploaded.current.path}
    request.current={requestId:id,nip:person.nip,type:mode,data}
   }
   await api.rpc('record',request.current);setDone(true);setMessage(mode==='receipt_submitted'?'Bukti tersimpan untuk diperiksa admin lain. Saldo belum berubah.':'Tindak lanjut tersimpan dalam riwayat.');await refresh()
  }catch(e){setError(e.message||'Belum berhasil disimpan. Coba kembali dengan permintaan yang sama.')}finally{setBusy(false)}
 }
 const decision=async(eventType,data)=>{
  const reason=window.prompt('Isi hasil pemeriksaan dan alasan keputusan:');if(!reason?.trim())return
  setBusy(true);setError('')
  try{await api.rpc('record',{requestId:crypto.randomUUID(),nip:person.nip,type:eventType,data:{...data,note:reason.trim()}});setMessage('Keputusan tersimpan. Saldo dan riwayat dimuat ulang.');await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const openProof=async path=>{setError('');const proofTab=window.open('about:blank','_blank');try{if(!proofTab)throw Error('Izinkan pop-up untuk membuka lampiran, lalu coba kembali.');proofTab.opener=null;const url=await evidenceUrl(api,path);proofTab.location.replace(url);return true}catch(e){proofTab?.close();setError(e.message);return false}}
 return <div className="modal-mask"><section className="modal" role="dialog" aria-modal="true" aria-label={`Tindak lanjut ${person.nama}`}><div className="modal-top"><h3>Tindak lanjut SDM</h3><button className="btn secondary" disabled={busy} onClick={onClose}>Tutup</button></div><div className="modal-main">
  <h3>{person.nama}</h3><p>{person.nip} • {person.bank} • {target.kegiatan||target.kategori}</p>
  <div className="notice demo-notice">Sisa master: {rp(person.remaining)}. Catatan dan bukti diterima tidak mengurangi saldo. Setoran langsung mengurangi saldo setelah diverifikasi admin lain.</div>
  {canWrite&&<><h4>Catat tindakan baru</h4><label className="form-field"><span>Yang ingin dicatat</span><select disabled={busy||done||!!request.current||!!uploaded.current} value={mode} onChange={e=>{setMode(e.target.value);setFile(null)}}><option value="note">Hasil tindak lanjut / penagihan</option><option value="status_report">SDM baru diketahui nonaktif</option><option value="receipt_submitted">Setoran langsung dan bukti NTPN</option></select></label>
  <fieldset disabled={busy||done||!!request.current} className="casework-fields">
   {mode==='note'&&<div className="form-grid"><label className="form-field"><span>PIC penanganan</span><input value={draft.pic} onChange={e=>field('pic',e.target.value)}/></label><label className="form-field"><span>Tanggal tindak lanjut berikutnya</span><input type="date" value={draft.deadline} onChange={e=>field('deadline',e.target.value)}/></label><label className="form-field"><span>Status penanganan</span><select value={draft.status} onChange={e=>field('status',e.target.value)}>{['Belum Ditindaklanjuti','Proses Penagihan','Menunggu Respons','Perlu Telaah','Bukti Diterima','Selesai Penanganan'].map(s=><option key={s}>{s}</option>)}</select></label></div>}
   {mode==='status_report'&&<><p>Lampirkan sumber resmi status nonaktif. Admin memeriksa laporan sebelum SDM masuk kelompok tindak lanjut. Identitas dan kewajiban tetap memakai master yang ada.</p><label className="form-field"><span>Status yang dilaporkan</span><select value={draft.statusSdm} onChange={e=>field('statusSdm',e.target.value)}>{['Mengundurkan Diri','Meninggal Dunia','BUP','Pensiun'].map(s=><option key={s}>{s}</option>)}</select></label></>}
   {mode==='receipt_submitted'&&<><div className="form-grid"><label className="form-field"><span>Kewajiban yang dibayar</span><select value={draft.obligation} onChange={e=>field('obligation',e.target.value)}><option value="">Pilih jenis dan tahun SP2D</option>{person.obligations.map((o,i)=><option key={i} value={i}>{o.kind==='UM'?'Uang Makan':'Tukin'} / {o.year} / {rp(o.amount)}</option>)}</select></label><label className="form-field"><span>Tahap dalam workbook berikutnya</span><input type="number" min="1" max="100" value={draft.stage} onChange={e=>field('stage',e.target.value)}/></label><label className="form-field"><span>Nominal setoran (Rp)</span><input type="number" min="1" step="1" value={draft.amount} onChange={e=>field('amount',e.target.value)}/></label><label className="form-field"><span>Tanggal setoran</span><input type="date" value={draft.paymentDate} onChange={e=>field('paymentDate',e.target.value)}/></label><label className="form-field"><span>NTPN setoran langsung (16 karakter)</span><input maxLength={16} value={draft.ntpn} onChange={e=>field('ntpn',e.target.value.toUpperCase())}/></label></div><label><input type="checkbox" checked={draft.notInWorkbook} onChange={e=>field('notInWorkbook',e.target.checked)}/> Saya telah memeriksa bahwa setoran ini belum termasuk pengembalian di master.</label><p>Jika satu bukti mencakup Tukin dan Uang Makan, catat alokasi nominal masing-masing secara terpisah.</p></>}
   <label className="form-field"><span>Hasil tindakan / sumber informasi / alasan</span><textarea rows="3" value={draft.note} onChange={e=>field('note',e.target.value)} placeholder="Contoh: surat diterima, respons SDM, hasil pemeriksaan dokumen, dan langkah berikutnya."/></label>
   <label className="form-field"><span>Lampiran {mode==='note'?'(opsional)':'(wajib)'} · PDF/JPG/PNG maksimal 10 MB</span><input disabled={!!uploaded.current} type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
  </fieldset><button className="btn primary" disabled={busy||done||!detail} onClick={submit}>{busy?'Menyimpan…':done?'Tersimpan':request.current?'Coba simpan kembali':'Simpan catatan & bukti'}</button></>}
  <h4>Riwayat tindakan dan bukti</h4>{!detail&&<p>Memuat riwayat…</p>}{detail&&!detail.events.length&&<p>Belum ada catatan tindak lanjut.</p>}
  {isAdmin&&import.meta.env.VITE_RECOVERY_CASEWORK_DIAGNOSTICS==='on'&&<EvidenceDiagnostic api={api} nip={person.nip}/>}
  {detail?.events.map(e=><article key={e.id} className="casework-event"><b>{eventLabels[e.event_type]}</b><small>{new Date(e.created_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})}</small><p>{e.payload.note||e.payload.reason}</p>{e.payload.targetNo&&<small>{e.payload.targetType==='action'?'Rencana Aksi':'Bottleneck'} nomor {e.payload.targetNo}</small>}{e.payload.pic&&<p>PIC: {e.payload.pic} • Berikutnya: {e.payload.deadline} • {e.payload.status}</p>}{e.payload.ntpn&&<p>NTPN: {e.payload.ntpn} • {rp(e.payload.amount)} • {e.payload.kind} / {e.payload.year} / Tahap {e.payload.stage}</p>}{e.payload.evidencePath&&<button className="btn secondary" onClick={()=>openProof(e.payload.evidencePath)}>Buka lampiran</button>}{isAdmin&&e.event_type==='status_report'&&!detail.events.some(x=>['status_verified','status_rejected'].includes(x.event_type)&&x.payload.report===e.id)&&<div className="toolbar"><button className="btn secondary" disabled={busy} onClick={()=>decision('status_verified',{report:e.id,status:e.payload.status})}>Sahkan status nonaktif setelah pemeriksaan</button><button className="btn secondary" disabled={busy} onClick={()=>decision('status_rejected',{report:e.id})}>Tolak laporan dengan alasan</button></div>}</article>)}
  {isAdmin&&detail?.receipts.filter(r=>r.verification==='pending').map(r=><article key={r.id} className="casework-event"><b>Periksa setoran {r.ntpn}</b><p>{r.kind} / {r.year} / Tahap {r.stage} • {rp(r.amount)} • {r.payment_date}</p><p>Periksa keaslian NTPN, nominal, identitas, alokasi, dan pastikan belum masuk workbook. Bukti wajib dibuka sebelum menyetujui.</p><ReceiptDecision receipt={r} busy={busy} openProof={openProof} decision={decision}/></article>)}
  {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="notice red-notice">{error}</p>}
 </div></section></div>
}
function EvidenceDiagnostic({api,nip}){
 const [busy,setBusy]=useState(false),[result,setResult]=useState('')
 const run=async()=>{setBusy(true);setResult('Memeriksa unggah dan akses lampiran…');try{
  const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII='),c=>c.charCodeAt(0))
  const file=new File([bytes],'diagnostic-storage.png',{type:'image/png'}),path=await uploadEvidence(api,nip,file,`diagnostic-${crypto.randomUUID()}`)
  const signed=await evidenceUrl(api,path),read=await fetch(signed,{cache:'no-store'}),loaded=new Uint8Array(await read.arrayBuffer())
  if(!read.ok||loaded.length!==bytes.length||loaded.some((b,i)=>b!==bytes[i]))throw Error('Unduhan bukti tidak sesuai unggahan uji.')
  const publicUrl=api.client.storage.from('recovery-evidence').getPublicUrl(path).data.publicUrl
  const anonymous=await fetch(publicUrl,{cache:'no-store'})
  if(anonymous.ok)throw Error('Lampiran dapat dibuka lewat URL publik; hentikan penggunaan dan periksa kebijakan bucket.')
  setResult(`Uji berhasil: unggah dan unduh bertanda tangan cocok; URL publik ditolak (HTTP ${anonymous.status}). Tidak ada catatan tindakan atau pembayaran dibuat. Objek diagnostik privat tersimpan untuk pemeriksaan teknis.`)
 }catch(e){setResult(`Uji belum berhasil: ${e.message}`)}finally{setBusy(false)}}
 return <section className="notice demo-notice"><div><b>Uji teknis penyimpanan — hanya pratinjau</b><p>Mengunggah gambar diagnostik satu piksel, tanpa mencatat setoran atau mengubah saldo.</p><button className="btn secondary" disabled={busy} onClick={run}>Uji unggah & akses bukti privat</button>{result&&<p role="status">{result}</p>}</div></section>
}
function ReceiptDecision({receipt,busy,openProof,decision}){const [opened,setOpened]=useState(false),[checked,setChecked]=useState(false),[included,setIncluded]=useState(false);return <><button className="btn secondary" onClick={async()=>setOpened(await openProof(receipt.evidence_path))}>Buka bukti setoran</button><label><input type="checkbox" disabled={!opened||busy} checked={checked} onChange={e=>setChecked(e.target.checked)}/> Bukti dan penerimaan telah diperiksa</label><label><input type="checkbox" disabled={busy} checked={included} onChange={e=>setIncluded(e.target.checked)}/> Setoran ini sudah termasuk nominal tahap yang sama di workbook tersimpan</label><div className="toolbar"><button className="btn primary" disabled={busy||!checked} onClick={()=>decision('receipt_verified',{receipt:receipt.id,includedExisting:included})}>{included?'Verifikasi bukti tanpa menambah pembayaran':'Verifikasi & kurangi sisa'}</button><button className="btn secondary" disabled={busy} onClick={()=>decision('receipt_rejected',{receipt:receipt.id})}>Tolak bukti dengan alasan</button></div></>}
