import React,{useEffect,useId,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {maskNik} from './ComparisonTable.jsx'

const typeLabels={
 'invalid-time':'Format Jam Tidak Valid',
 'invalid-date':'Tanggal Transaksi Tidak Valid',
 'invalid-amount':'Nominal Transaksi Tidak Valid',
 'duplicate-transaction':'Nomor Transaksi Berulang',
 'identity-conflict':'Konflik NIK Pemain',
 'time-tie':'Aktivitas Waktu Seri (Perlu Validasi)',
 'nip-numeric':'Format NIP Numerik',
 'invalid-history':'Data Historis Perlu Validasi',
 'missing-transaction-details':'Rincian Transaksi Belum Tersedia'
}

export default function ValidationModal({finding,person,onSave,onRemove,onClose,canEdit=true,archived=false}){
 const dialog=useRef(null),title=useId()
 const existing=finding?.resolution||null
 const [correctedTime,setCorrectedTime]=useState(existing?.correctedTime||finding?.timeRaw||'')
 const [correctedDate,setCorrectedDate]=useState(existing?.correctedDate||finding?.date||'')
 const [correctedAmount,setCorrectedAmount]=useState(existing?.correctedAmount!=null?existing.correctedAmount:(finding?.amount!=null?finding.amount:''))
 const [correctedNik,setCorrectedNik]=useState(existing?.correctedNik||finding?.nik||'')
 const [ignoreDuplicate,setIgnoreDuplicate]=useState(Boolean(existing?.ignoreDuplicate))
 const [ignoreIdentityConflict,setIgnoreIdentityConflict]=useState(Boolean(existing?.ignoreIdentityConflict))
 const [tieDecision,setTieDecision]=useState(existing?.decision||'inside')
 const [reason,setReason]=useState(existing?.reason||'')
 const [evidenceRef,setEvidenceRef]=useState(existing?.evidenceRef||'')
 const [resolvedBy,setResolvedBy]=useState(existing?.resolvedBy||'')
 const [isResolved,setIsResolved]=useState(existing?.resolved!==false)
 const [error,setError]=useState('')

 useEffect(()=>{
  const element=dialog.current,overflow=document.body.style.overflow
  document.body.style.overflow='hidden'
  if(!element.open)element.showModal()
  return()=>{element.close();document.body.style.overflow=overflow}
 },[])

 function handleSubmit(e){
  e.preventDefault()
  setError('')
  if(!reason.trim()){setError('Alasan koreksi wajib diisi.');return}
  if(!evidenceRef.trim()){setError('Referensi bukti atau nomor dokumen wajib diisi.');return}

  const payload={
   id:existing?.id||`corr-${finding.row||finding.type}-${finding.nik||'global'}-${Date.now()}`,
   type:finding.type,
   row:finding.row??null,
   nik:finding.nik||null,
   reason:reason.trim(),
   evidenceRef:evidenceRef.trim(),
   resolvedBy:resolvedBy.trim()||'Petugas Pemeriksa',
   resolved:isResolved,
   resolvedAt:new Date().toISOString()
  }

  if(finding.type==='invalid-time'||finding.type==='time-from-pairing'){
   payload.correctedTime=correctedTime.trim()
  }
  if(finding.type==='invalid-date'){
   payload.correctedDate=correctedDate.trim()
  }
  if(finding.type==='invalid-amount'){
   payload.correctedAmount=Number(correctedAmount)
  }
  if(finding.type==='identity-conflict'){
   payload.ignoreIdentityConflict=ignoreIdentityConflict
   payload.correctedNik=correctedNik.trim()
  }
  if(finding.type==='duplicate-transaction'){
   payload.ignoreDuplicate=ignoreDuplicate
  }
  if(finding.type==='time-tie'){
   payload.decision=tieDecision
   payload.key=`time-tie-${finding.nik}`
  }

  // Riwayat perubahan
  const historyEntry={
   updatedAt:new Date().toISOString(),
   updatedBy:payload.resolvedBy,
   reason:payload.reason,
   evidenceRef:payload.evidenceRef,
   correctedValue:payload.correctedTime||payload.correctedDate||payload.correctedAmount||payload.decision||(payload.resolved?'Diselesaikan':'Diperbarui')
  }
  payload.history=[...(existing?.history||[]),historyEntry]

  onSave(payload)
 }

 function handleReset(){
  if(window.confirm('Batalkan koreksi ini dan kembalikan ke nilai sumber asli?')){
   onRemove(existing?.id||finding)
  }
 }

 return createPortal(
  <dialog ref={dialog} className="discipline-detail-dialog validation-modal" aria-labelledby={title} aria-modal="true" onCancel={onClose}>
   <div className="discipline-detail-header">
    <div>
     <span className="eyebrow">TANGANI TEMUAN VALIDASI</span>
     <h2 id={title}>{typeLabels[finding.type]||finding.type}</h2>
    </div>
    <button type="button" className="btn secondary" onClick={onClose}>Tutup</button>
   </div>
   <div className="discipline-detail-content">
    {person&&<div className="validation-person-card">
     <div>
      <strong>{person.nama}</strong>
      <small> NIK: {maskNik(person.nik)} · NIP: {person.nip||'—'}</small>
     </div>
     <div>
      <span className="validation-tag-status">Data Olah: <b>{person.hasilPenilaian}</b> (Tetap)</span>
     </div>
    </div>}

    <div className="validation-finding-box">
     <p><b>Pesan Temuan:</b> {finding.message}</p>
     {finding.row!=null&&<p><b>Lokasi Sumber:</b> Baris ke-{finding.row} pada sheet <i>data transaksi 2025</i></p>}
     {finding.resolutionNote&&<p className="validation-prev-note"><b>Catatan sebelumnya:</b> {finding.resolutionNote}</p>}
    </div>

    <form onSubmit={handleSubmit} className="validation-form">
     <fieldset disabled={!canEdit||archived}>
      <legend>Formulir Penyesuaian Data</legend>

      {(finding.type==='invalid-time'||finding.type==='time-from-pairing')&&<div className="form-group">
       <label>Jam Transaksi yang Benar (HH:mm:ss)
        <input type="text" pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$" placeholder="Contoh: 08:30:00" value={correctedTime} onChange={e=>setCorrectedTime(e.target.value)} required/>
       </label>
       <div className="validation-presets">
        <span>Pilihan cepat jam kerja:</span>
        {['07:30:00','08:00:00','12:00:00','16:00:00','16:30:00'].map(t=>
         <button key={t} type="button" className="btn secondary btn-small" onClick={()=>setCorrectedTime(t)}>{t}</button>
        )}
       </div>
      </div>}

      {finding.type==='invalid-date'&&<div className="form-group">
       <label>Tanggal Transaksi yang Benar (YYYY-MM-DD)
        <input type="date" value={correctedDate} onChange={e=>setCorrectedDate(e.target.value)} required/>
       </label>
      </div>}

      {finding.type==='invalid-amount'&&<div className="form-group">
       <label>Nominal Deposit Transaksi (Rp)
        <input type="number" min="0" step="1000" placeholder="Nominal angka rupiah" value={correctedAmount} onChange={e=>setCorrectedAmount(e.target.value)} required/>
       </label>
      </div>}

      {finding.type==='duplicate-transaction'&&<div className="form-group">
       <label className="checkbox-label">
        <input type="checkbox" checked={ignoreDuplicate} onChange={e=>setIgnoreDuplicate(e.target.checked)}/>
        <span>Konfirmasi transaksi ini sah terpisah (abaikan tanda duplikat nomor)</span>
       </label>
      </div>}

      {finding.type==='identity-conflict'&&<div className="form-group">
       <label className="checkbox-label">
        <input type="checkbox" checked={ignoreIdentityConflict} onChange={e=>setIgnoreIdentityConflict(e.target.checked)}/>
        <span>Konfirmasi pairing identitas telah terverifikasi</span>
       </label>
       <label>NIK yang Digunakan
        <input type="text" maxLength={16} value={correctedNik} onChange={e=>setCorrectedNik(e.target.value)} required/>
       </label>
      </div>}

      {finding.type==='time-tie'&&<div className="form-group">
       <label>Keputusan Penetapan Waktu Aktivitas Seri
        <select value={tieDecision} onChange={e=>setTieDecision(e.target.value)}>
         <option value="inside">Tetapkan Dalam Jam Kerja</option>
         <option value="outside">Tetapkan Luar Jam Kerja</option>
        </select>
       </label>
      </div>}

      <div className="form-group">
       <label>Alasan Koreksi / Penjelasan Validasi <span className="req">*</span>
        <textarea rows={3} placeholder="Jelaskan dasar perbaikan data, konfirmasi rekening koran, atau hasil klarifikasi..." value={reason} onChange={e=>setReason(e.target.value)} required/>
       </label>
      </div>

      <div className="discipline-rule-grid">
       <label>Referensi Bukti / Nomor Dokumen <span className="req">*</span>
        <input type="text" placeholder="Contoh: BAP No. 24/KP.06/2026 atau Rek Koran Mandiri" value={evidenceRef} onChange={e=>setEvidenceRef(e.target.value)} required/>
       </label>
       <label>Petugas Pemeriksa (PIC)
        <input type="text" placeholder="Nama pemeriksa" value={resolvedBy} onChange={e=>setResolvedBy(e.target.value)}/>
       </label>
      </div>

      <div className="form-group">
       <label className="checkbox-label">
        <input type="checkbox" checked={isResolved} onChange={e=>setIsResolved(e.target.checked)}/>
        <span>Tandai temuan validasi ini sebagai <b>Sudah Diselesaikan</b></span>
       </label>
      </div>
     </fieldset>

     {error&&<p role="alert" className="notice red-notice">{error}</p>}

     {existing?.history?.length>0&&<div className="validation-history-section">
      <h3>Riwayat Perubahan Validasi</h3>
      <div className="table-scroll">
       <table>
        <thead>
         <tr>
          <th>Waktu (WIB)</th>
          <th>Pemeriksa</th>
          <th>Nilai / Aksi</th>
          <th>Alasan</th>
          <th>Bukti</th>
         </tr>
        </thead>
        <tbody>
         {existing.history.map((h,idx)=><tr key={idx}>
          <td>{new Date(h.updatedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})}</td>
          <td>{h.updatedBy}</td>
          <td>{String(h.correctedValue)}</td>
          <td>{h.reason}</td>
          <td>{h.evidenceRef}</td>
         </tr>)}
        </tbody>
       </table>
      </div>
     </div>}

     <div className="discipline-toolbar" style={{marginTop:'20px'}}>
      {canEdit&&!archived&&<button type="submit" className="btn primary">Simpan Koreksi & Terapkan</button>}
      {existing&&canEdit&&!archived&&<button type="button" className="btn secondary" onClick={handleReset}>Batalkan Koreksi</button>}
      <button type="button" className="btn secondary" onClick={onClose}>Batal</button>
     </div>
    </form>
   </div>
  </dialog>,
  document.body
 )
}
