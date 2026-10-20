import React,{useEffect,useRef,useState} from 'react'
import {flushSync} from 'react-dom'
import {initialIdentity} from './model.js'
import {REPORT_SECTIONS,generatedReport,reportReadiness,reportTemplateData,sameVersions} from './lhpModel.js'
import {fillWord,renderPreview,buildPdf,download} from './documents.js'
export default function LhpPanel({client,row,profile,userId,bapDirty,bapBusy,onDirty}){
 const [source,setSource]=useState(null),[record,setRecord]=useState(null),[form,setForm]=useState(null),[reviewed,setReviewed]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(false),[word,setWord]=useState(null)
 const dirty=useRef(false),alive=useRef(false),target=useRef(null),sourceRef=useRef(null),recordRef=useRef(null),formVersions=useRef(null)
 function markDirty(){dirty.current=true;onDirty(true);setReviewed(false);setWord(null);setPreview(false)}
 async function load(){try{
  const result=await client.rpc('interview_report_source',{p_nik:row.nik});if(result.error)throw result.error
  const saved=await client.from('interview_reports').select('*').eq('nik',row.nik).single();if(saved.error)throw saved.error;if(!alive.current)return
  const next=result.data,r=saved.data,changed=sourceRef.current&&!sameVersions(sourceRef.current.versions,next.versions)
  const reportChanged=recordRef.current&&recordRef.current.revision!==r.revision
  sourceRef.current=next;setSource(next)
  if(dirty.current){if(recordRef.current?.revision!==r.revision)setError('Draf LHP berubah di perangkat lain. Salin perubahan sebelum membuka ulang.');if(changed){setReviewed(false);setWord(null);setPreview(false);setNotice('Sumber berubah. Susun ulang dari sumber terbaru dan tinjau kembali.')}return}
  recordRef.current=r;setRecord(r)
  setForm({sections:Object.keys(r.sections).length?r.sections:generatedReport(next),nomor:r.nomor,kota:r.kota||initialIdentity(next.case).kota})
  formVersions.current=Object.keys(r.sections).length?r.source_versions:next.versions
  setReviewed(Boolean(r.reviewed_at&&sameVersions(r.source_versions,next.versions)))
  if(changed||reportChanged){setWord(null);setPreview(false)}
 }catch(e){if(alive.current)setError(e.message)}}
 useEffect(()=>{alive.current=true;load();const timer=setInterval(load,15000);return()=>{alive.current=false;clearInterval(timer)}},[row.nik,row.revision])
 const canEdit=row.started_at&&profile.role!=='viewer'&&(profile.role==='admin'||row.locked_by===userId)
 const missing=reportReadiness(source),stale=source&&form&&!sameVersions(formVersions.current,source.versions)
 const valid=form&&REPORT_SECTIONS.every(([k])=>form.sections[k]?.trim())&&form.sections.rekomendasi.trim().length>=20&&form.kota.trim()
 const downloadable=word&&record?.reviewed_at&&sameVersions(record.source_versions,source?.versions)&&!stale&&!dirty.current&&!bapDirty&&!bapBusy&&!missing.length
 function change(key,value){markDirty();setForm(f=>({...f,[key]:value}))}
 function regenerate(){if(!window.confirm('Susun ulang isi draf dari sumber terbaru? Rekomendasi, nomor dan tempat tetap disimpan.'))return;markDirty();formVersions.current=source.versions;setForm(f=>({...f,sections:{...generatedReport(source),rekomendasi:f.sections.rekomendasi}}));setNotice('Draf disusun ulang. Periksa semua bagian sebelum menandai sudah ditinjau.')}
 async function save(){
  if(stale)throw Error('Sumber berubah. Susun ulang dari sumber terbaru sebelum menyimpan.')
  const {data,error}=await client.rpc('interview_report_save',{p_nik:row.nik,p_revision:record.revision,p_versions:formVersions.current,p_sections:form.sections,p_nomor:form.nomor,p_kota:form.kota,p_review:reviewed});if(error)throw error
  recordRef.current=data;setRecord(data);dirty.current=false;onDirty(false);setNotice('Draf LHP tersimpan. Dokumen tetap memerlukan pengesahan pejabat berwenang.');return data
 }
 async function action(fn){setBusy(true);setError('');try{await fn()}catch(e){setError(e.message);setWord(null)}finally{setBusy(false)}}
 async function showPreview(){await action(async()=>{if(canEdit&&(dirty.current||!Object.keys(record.sections).length))await save();const blob=await fillWord('/templates/lhp-draft-2026.docx',reportTemplateData(source,form));flushSync(()=>{setWord(blob);setPreview(true)});await renderPreview(blob,target.current,{draftLabel:'DRAF — BELUM DISAHKAN'})})}
 return <section className="panel" aria-label="Draf LHP peserta"><h3>Draf Laporan Hasil Pemeriksaan</h3><p>Draf kerja bersumber dari BAP, penetapan kategori, dan SPTJM. Periksa dasar pemeriksaan, analisis, serta rekomendasi sebelum digunakan. Peninjauan isi di aplikasi belum merupakan pengesahan LHP.</p>
 {error&&<p role="alert" className="notice red-notice">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <button className="btn secondary" disabled={busy} onClick={load}>Muat ulang sumber LHP</button>
 {missing.length>0&&<p className="notice amber-notice">Syarat unduhan: {missing.join('; ')}.</p>}{stale&&<p className="notice amber-notice">Isi draf menggunakan sumber lama. Susun ulang dan tinjau kembali sebelum menyimpan atau mengunduh.</p>}
 {form&&!preview&&<><div className="bap-identity">{[['nomor','Nomor LHP (bila telah ditetapkan)'],['kota','Tempat penyusunan']].map(([k,label])=><label key={k}>{label}<input maxLength={200} value={form[k]} disabled={!canEdit||busy||bapBusy} onChange={e=>change(k,e.target.value)}/></label>)}</div>
 <div className="bap-category-form">{REPORT_SECTIONS.map(([k,label])=><label key={k}>{label}<textarea aria-label={`LHP ${label}`} rows={k==='fakta'?12:5} maxLength={200000} value={form.sections[k]||''} disabled={!canEdit||busy||bapBusy} onChange={e=>{markDirty();setForm(f=>({...f,sections:{...f.sections,[k]:e.target.value}}))}}/></label>)}
 <p>Rekomendasi diisi pemeriksa berdasarkan bukti dan ketentuan yang berlaku. Aplikasi tidak menentukan sanksi secara otomatis.</p>
 <label className="bap-ref"><input type="checkbox" checked={reviewed} disabled={!canEdit||busy||bapBusy||bapDirty||missing.length>0||stale||!valid} onChange={e=>{dirty.current=true;onDirty(true);setWord(null);setReviewed(e.target.checked)}}/>Saya telah meninjau seluruh isi draf LHP dan rekomendasinya.</label></div></>}
 <div className="bap-preview-actions">{canEdit&&!preview&&<><button className="btn secondary" disabled={!source||busy||bapBusy||bapDirty} onClick={regenerate}>Susun ulang dari sumber terbaru</button><button className="btn secondary" disabled={!record||busy||bapBusy||bapDirty||stale} onClick={()=>action(save)}>Simpan draf LHP</button></>}<button className="btn primary" disabled={!form||busy||bapBusy||bapDirty||stale||!row.started_at} onClick={showPreview}>Pratinjau LHP</button>{preview&&<><button className="btn secondary" disabled={busy} onClick={()=>setPreview(false)}>Kembali revisi LHP</button><button className="btn primary" disabled={busy||!downloadable} onClick={()=>download(word,`DRAF-LHP-${row.person.nip}.docx`)}>Unduh LHP Word</button><button className="btn primary" disabled={busy||!downloadable} onClick={()=>action(async()=>download(await buildPdf(target.current),`DRAF-LHP-${row.person.nip}.pdf`))}>Unduh LHP PDF</button></>}</div>
 {preview&&<><p>Dokumen berstatus DRAF — BELUM DISAHKAN. PDF mengikuti halaman pratinjau; tata letak Word dapat menyesuaikan font pada perangkat.</p><div className="bap-preview-scroll"><div ref={target}/></div></>}
 </section>
}
