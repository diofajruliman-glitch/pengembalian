import React,{useReducer,useState} from 'react'
import {followupStatuses} from './storage.js'
import {createFollowupDraft,followupDraftReducer,followupFields,followupValues} from './followupDraft.js'

export default function FollowupForm({row,value,canEdit,archived,onSave,onReloadLatest,online=false,busy}){
 // The parent key identifies a dataset + SDM, not updatedAt. Incoming server
 // refreshes must not silently rebase an in-progress draft onto another edit.
 const [state,dispatch]=useReducer(followupDraftReducer,null,()=>createFollowupDraft(value,online))
 const [loadingLatest,setLoadingLatest]=useState(false)
 const {draft,expectedUpdatedAt,error,conflict,latest,notice}=state
 const disabled=!canEdit||archived||busy||loadingLatest
 const latestValues=latest?followupValues(latest.value):null
 const edit=e=>dispatch({type:'edit',field:e.target.name,value:e.target.value})
 async function submit(e){
  e.preventDefault()
  if(disabled||conflict)return
  dispatch({type:'clearError'})
  try{const saved=await onSave(draft,{expectedUpdatedAt});dispatch({type:'saved',value:saved||draft,online})}
  catch(err){dispatch({type:'failed',error:err})}
 }
 async function loadLatest(){
  if(!onReloadLatest||busy||loadingLatest)return
  setLoadingLatest(true);dispatch({type:'clearError'})
  try{dispatch({type:'latest',latest:await onReloadLatest()})}
  catch(err){dispatch({type:'failed',error:err})}
  finally{setLoadingLatest(false)}
 }
 return <form onSubmit={submit} className="panel">
  <h2>Tindak lanjut: {row.nama}</h2><p>Catat hasil pemeriksaan dan tindak lanjut. Keputusan hukuman diisi berdasarkan dokumen pemeriksaan, tidak dihasilkan otomatis dari skor.</p>
  {value?.pending&&<p role="alert" className="notice amber-notice">Catatan ini belum terkirim online. Simpan kembali sebelum mengarsipkan dataset.</p>}
  <fieldset className="discipline-fields" disabled={disabled}>
   <legend>Catatan penanganan</legend>
   <div className="discipline-rule-grid">
    <label>Status<select name="status" value={draft.status} onChange={edit}>{followupStatuses.map(s=><option key={s}>{s}</option>)}</select></label>
    <label>PIC<input name="pic" maxLength={200} value={draft.pic} onChange={edit}/></label>
    <label>Referensi BAP / dokumen<input name="documentReference" maxLength={2000} value={draft.documentReference} onChange={edit}/></label>
   </div>
   <label>Catatan pemeriksaan<textarea name="notes" maxLength={10000} rows={4} value={draft.notes} onChange={edit}/></label>
   <label>Hasil keputusan sesuai dokumen<textarea name="decisionNote" maxLength={10000} rows={3} value={draft.decisionNote} onChange={edit}/></label>
  </fieldset>
  {error&&<p role="alert" className="notice red-notice">{error}</p>}
  {conflict&&<section aria-label="Perbedaan catatan tindak lanjut">
   <p role="alert" className="notice amber-notice">Catatan online berubah sejak formulir ini dibuka. Draf Anda tetap tersedia. Muat catatan terbaru, bandingkan, lalu pilih isian yang akan digunakan sebelum menyimpan.</p>
   <button type="button" className="btn secondary" disabled={busy||loadingLatest} onClick={loadLatest}>{loadingLatest?'Memuat catatan…':'Muat catatan terbaru untuk dibandingkan'}</button>
  </section>}
  {latest&&<section aria-label="Perbandingan draf dengan catatan online">
   <h3>Catatan online dan draf Anda</h3>
   <p>{latest.value?.updatedAt?`Catatan online diperbarui ${new Date(latest.value.updatedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB.`:'Belum ada catatan tersimpan untuk SDM ini.'}</p>
   <div className="table-scroll"><table><thead><tr><th>Isian</th><th>Catatan online terbaru</th><th>Draf Anda</th></tr></thead><tbody>{followupFields.map(([key,label])=><tr key={key}><th scope="row">{label}</th><td style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{latestValues[key]||'—'}</td><td style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{draft[key]||'—'}</td></tr>)}</tbody></table></div>
   {latest.archived?<p role="alert">Dataset telah diarsipkan. Draf tetap ditampilkan, tetapi catatan tidak dapat diganti.</p>:conflict&&canEdit&&!archived&&<div className="discipline-toolbar">
    <button type="button" className="btn secondary" disabled={busy||loadingLatest} onClick={()=>dispatch({type:'useLatest'})}>Gunakan catatan terbaru di formulir</button>
    <button type="button" className="btn secondary" disabled={busy||loadingLatest} onClick={()=>dispatch({type:'keepDraft'})}>Gunakan draf saya untuk mengganti catatan terbaru</button>
   </div>}
  </section>}
  {notice&&<p role="status" className="notice discipline-message">{notice}</p>}
  {canEdit&&!archived&&<button className="btn primary" disabled={disabled||conflict} type="submit">Simpan tindak lanjut</button>}
  {archived&&<p>Dataset diarsipkan; tindak lanjut hanya dapat dibaca. Draf pada formulir tetap ditampilkan.</p>}
 </form>
}
