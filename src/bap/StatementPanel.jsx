import React,{useEffect,useRef,useState} from 'react'
import {flushSync} from 'react-dom'
import {SPTJM_FIELDS,initialStatement,statementMissing,statementTemplateData} from './sptjmModel.js'
import {fillWord,renderPreview,buildPdf,download} from './documents.js'
import './portal.css'
export default function StatementPanel({client,row,profile,userId,bapDirty,bapBusy,onDirty}){
 const [record,setRecord]=useState(null),[details,setDetails]=useState(()=>initialStatement(row,null)),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(false),[word,setWord]=useState(null)
 const dirty=useRef(false),alive=useRef(true),target=useRef(null),recordRef=useRef(null)
 async function load(){try{
  const {data,error}=await client.from('interview_statements').select('*').eq('nik',row.nik).single();if(error)throw error;if(!alive.current)return
  if(dirty.current&&recordRef.current?.revision!==data.revision){setError('SPTJM berubah di perangkat lain. Salin perubahan sebelum membuka ulang.');return}
  setRecord(data);recordRef.current=data
  if(!dirty.current){setDetails(initialStatement(row,data));setConfirmed(Boolean(data.confirmed_at&&data.bap_revision===row.revision))}
 }catch(e){if(alive.current)setError(e.message)}}
 useEffect(()=>{alive.current=true;load();return()=>{alive.current=false}},[row.nik,row.revision])
 const canEdit=row.started_at&&profile.role!=='viewer'&&(profile.role==='admin'||row.locked_by===userId)
 const missing=statementMissing(row,details),stale=record?.confirmed_at&&record.bap_revision!==row.revision
 const downloadable=!bapDirty&&!bapBusy&&word&&record?.confirmed_at&&record.bap_revision===row.revision&&!dirty.current&&!missing.length
 function change(key,value){dirty.current=true;onDirty(true);setWord(null);setPreview(false);setConfirmed(false);setDetails(d=>({...d,[key]:value,...(['admission','activityState'].includes(key)?{startMonth:'',endMonth:'',periodNote:''}:{} )}));setNotice('Perubahan SPTJM belum tersimpan')}
 async function save(){
  const {data,error}=await client.rpc('interview_statement_save',{p_nik:row.nik,p_revision:record.revision,p_bap_revision:row.revision,p_details:details,p_confirm:confirmed})
  if(error)throw error
  dirty.current=false;onDirty(false);setRecord(data);recordRef.current=data;setNotice(confirmed?'Isi pernyataan telah dikonfirmasi dan tersimpan.':'Draf SPTJM tersimpan.');return data
 }
 async function showPreview(){
  setBusy(true);setError('')
  try{
   if(canEdit&&dirty.current){await save()}
   else if(dirty.current)throw Error('SPTJM belum tersimpan.')
   const blob=await fillWord('/templates/sptjm-2026.docx',statementTemplateData(row,details));flushSync(()=>{setWord(blob);setPreview(true)})
   await renderPreview(blob,target.current)
  }catch(e){setError(e.message);setWord(null)}finally{setBusy(false)}
 }
 async function saveDraft(){setBusy(true);setError('');try{await save()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function exportPdf(){setBusy(true);setError('');try{download(await buildPdf(target.current),`SPTJM-${row.person.nip}.pdf`)}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <section className="panel bap-statement" aria-label="SPTJM peserta"><h3>Surat Pernyataan Tanggung Jawab Mutlak</h3><p>Identitas mengikuti BAP dan data surat panggilan. Pilihan pengakuan serta periode harus sesuai keterangan yang dikonfirmasi peserta.</p>
  {error&&<p role="alert" className="notice red-notice">{error} <button className="btn secondary" onClick={load}>Muat ulang SPTJM</button></p>}{notice&&<p role="status">{notice}</p>}
  {stale&&<p className="notice amber-notice">BAP berubah setelah konfirmasi SPTJM. Tinjau dan konfirmasikan kembali sebelum mengunduh.</p>}
  {!preview&&<><div className="bap-comparison-grid"><div><b>Jawaban BAP Q11 — pengakuan</b><p>{row.answers?.[11]||'Belum diisi'}</p></div><div><b>Jawaban BAP Q12 — periode</b><p>{row.answers?.[12]||'Belum diisi'}</p></div></div>
   <div className="bap-identity">{SPTJM_FIELDS.map(([key,label])=><label key={key}>{label}<input aria-label={`SPTJM ${label}`} maxLength={key==='noHp'?30:200} value={details[key]} disabled={!canEdit||busy||bapBusy} onChange={e=>change(key,e.target.value)}/></label>)}</div>
   <div className="bap-category-form"><label>Pernyataan peserta<select aria-label="SPTJM pengakuan" value={details.admission} disabled={!canEdit||busy||bapBusy} onChange={e=>change('admission',e.target.value)}><option value="">Belum dikonfirmasi</option><option>Mengakui</option><option>Tidak mengakui</option></select></label>
   {details.admission==='Tidak mengakui'&&<p>Bagian periode tidak akan menyatakan bahwa peserta pernah melakukan aktivitas tersebut.</p>}
   {details.admission==='Mengakui'&&<><label>Status periode<select aria-label="SPTJM status periode" value={details.activityState} disabled={!canEdit||busy||bapBusy} onChange={e=>change('activityState',e.target.value)}><option value="">Pilih sesuai keterangan peserta</option><option value="stopped">Sudah berhenti</option><option value="ongoing">Masih berlangsung</option><option value="unknown">Periode tidak diingat secara pasti</option></select></label>{['stopped','ongoing'].includes(details.activityState)&&<label>Bulan dan tahun mulai<input aria-label="SPTJM mulai" type="month" value={details.startMonth} disabled={!canEdit||busy||bapBusy} onChange={e=>change('startMonth',e.target.value)}/></label>}{details.activityState==='stopped'&&<label>Bulan dan tahun terakhir<input aria-label="SPTJM terakhir" type="month" value={details.endMonth} disabled={!canEdit||busy||bapBusy} onChange={e=>change('endMonth',e.target.value)}/></label>}{details.activityState==='unknown'&&<label>Penjelasan periode<textarea aria-label="SPTJM penjelasan periode" rows={3} maxLength={2000} value={details.periodNote} disabled={!canEdit||busy||bapBusy} onChange={e=>change('periodNote',e.target.value)}/></label>}</>}
   <label className="bap-ref"><input type="checkbox" checked={details.hasAttachments} disabled={!canEdit||busy||bapBusy} onChange={e=>change('hasAttachments',e.target.checked)}/>Dokumen pendukung disertakan bersama SPTJM</label>
   <label className="bap-ref"><input aria-label="Konfirmasi isi SPTJM oleh peserta" type="checkbox" checked={confirmed} disabled={!canEdit||busy||bapBusy||missing.length>0||row.status!=='Selesai'} onChange={e=>{dirty.current=true;onDirty(true);setWord(null);setConfirmed(e.target.checked)}}/>Peserta telah mengonfirmasi pilihan, periode, dan isi pernyataan ini.</label></div></>}
  {missing.length>0&&<p className="notice amber-notice">Perlu dilengkapi sebelum konfirmasi: {missing.join(', ')}.</p>}
  {row.status!=='Selesai'&&<p>Finalisasi BAP sebelum mengonfirmasi dan mengunduh SPTJM.</p>}
  {bapDirty&&<p className="notice amber-notice">Simpan perubahan BAP dahulu agar identitas dan keterangan tetap sesuai.</p>}
  <div className="bap-preview-actions">{canEdit&&!preview&&<button className="btn secondary" disabled={!record||busy||bapBusy||bapDirty} onClick={saveDraft}>Simpan draf SPTJM</button>}<button className="btn primary" disabled={!record||busy||bapBusy||bapDirty||!row.started_at} onClick={showPreview}>{busy?'Menyiapkan…':'Pratinjau SPTJM'}</button>{preview&&<><button className="btn secondary" disabled={busy} onClick={()=>setPreview(false)}>Kembali revisi SPTJM</button><button className="btn primary" disabled={busy||!downloadable} onClick={()=>download(word,`SPTJM-${row.person.nip}.docx`)}>Unduh SPTJM Word</button><button className="btn primary" disabled={busy||!downloadable} onClick={exportPdf}>Unduh SPTJM PDF</button></>}</div>
  {preview&&<><p>Pratinjau draf dapat diperiksa sebelum konfirmasi. Unduhan tersedia setelah isi dikonfirmasi dan tersimpan. Tanda tangan serta materai dilengkapi pada dokumen.</p><div className="bap-preview-scroll"><div ref={target}/></div></>}
 </section>
}
