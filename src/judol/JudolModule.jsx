import React,{useEffect,useMemo,useRef,useState} from 'react'
import {DEFAULT_RULES,DISCIPLINE_CATEGORIES} from './analysis.js'
import {FOCUSED_ASSESSMENTS,filterDisciplineRows,getTransactionAvailability,hasPairingCategoryReference,isFocusedAssessment} from './availability.js'
import DisciplineFilters from './DisciplineFilters.jsx'
import {disciplineStorage} from './storage.js'
import {exportDiscipline} from './export.js'
import {persistVersionChain} from './versions.js'
import ComparisonTable,{ComparisonDetail} from './ComparisonTable.jsx'
import RulePanel from './RulePanel.jsx'
import FollowupForm from './FollowupForm.jsx'
import ValidationModal from './ValidationModal.jsx'
import LegacyJudolModule from './LegacyJudolModule.jsx'
import './judol.css'

const tabs=[['analysis','Analisis kategorisasi'],['rules','Parameter & versi'],['audit','Audit data'],['followup','Tindak lanjut'],['datasets','Dataset & arsip']]
const number=n=>Number(n||0).toLocaleString('id-ID')
const rupiah=n=>'Rp '+number(n)
const now=()=>new Date().toISOString()
const date=value=>new Date(value).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})
const stats=(rows,key)=>({aktif:rows.filter(r=>r[key]?.frekuensi>0).length,frekuensi:rows.reduce((s,r)=>s+(r[key]?.frekuensi||0),0),nominal:rows.reduce((s,r)=>s+(r[key]?.nominal||0),0),knownRows:rows.filter(r=>typeof r[key]?.frekuensi==='number').length,missingRows:rows.filter(r=>getTransactionAvailability(r)==='missing').length})
const knownValue=(summary,key,format=number)=>summary.missingRows>0&&summary.knownRows===0?'Belum tersedia':format(summary[key])
export default function JudolModule({snapshot,onSnapshot,canImport,canEdit=false,supabase}){
 const [tab,setTab]=useState('analysis'),[legacy,setLegacy]=useState(snapshot?.kind==='legacy'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 const [search,setSearch]=useState(''),[assessment,setAssessment]=useState('Terbukti'),[category,setCategory]=useState(''),[period,setPeriod]=useState('after'),[availability,setAvailability]=useState(''),[selected,setSelected]=useState(null)
 const [preview,setPreview]=useState(null),[datasets,setDatasets]=useState([]),[dbNotice,setDbNotice]=useState(''),[archiveReview,setArchiveReview]=useState(false),[auditPage,setAuditPage]=useState(0)
 const [activeFinding,setActiveFinding]=useState(null),[auditStatusFilter,setAuditStatusFilter]=useState('all'),[auditSearch,setAuditSearch]=useState('')
 const worker=useRef(null),alive=useRef(true),autoLoaded=useRef(false),snapshotRef=useRef(snapshot)
 const storage=useMemo(()=>supabase?disciplineStorage(supabase):null,[supabase])
 const version=snapshot?.kind==='analysis'?snapshot.versions[snapshot.active]:null
 const result=version?.result,rows=result?.rows||[],archived=version?.status==='archived'
 const pendingFollowups=Boolean(version?.followups?.some(f=>f.pending))
 const nameLocked=Boolean(snapshot?.versions?.some(v=>v.id||v.requestId))
 const focused=useMemo(()=>rows.filter(isFocusedAssessment),[rows])
 const filters={assessment,category,period,search,availability}
 const filtered=useMemo(()=>filterDisciplineRows(rows,{assessment,category,period,search,availability}),[rows,assessment,category,period,search,availability])
 const selectedRow=focused.find(r=>r.nik===selected)
 const counts=useMemo(()=>Object.fromEntries(FOCUSED_ASSESSMENTS.map(s=>[s,focused.filter(r=>r.hasilPenilaian===s).length])),[focused])
 const filteredIds=useMemo(()=>new Set(filtered.map(r=>r.nik)),[filtered])
 const filteredAudits=useMemo(()=>(result?.audits||[]).filter(a=>!a.nik||filteredIds.has(a.nik)),[result,filteredIds])
 const displayedAudits=useMemo(()=>{
  let list=filteredAudits
  if(auditStatusFilter==='open')list=list.filter(a=>!a.resolved)
  else if(auditStatusFilter==='resolved')list=list.filter(a=>Boolean(a.resolved))
  if(auditSearch.trim()){
   const q=auditSearch.trim().toLowerCase()
   list=list.filter(a=>`${a.type} ${a.nik||''} ${a.message||''} ${a.resolution?.reason||''}`.toLowerCase().includes(q))
  }
  return list
 },[filteredAudits,auditStatusFilter,auditSearch])
 const currentAuditPage=Math.min(auditPage,Math.max(0,Math.ceil(displayedAudits.length/50)-1))
 const missingRows=useMemo(()=>filtered.filter(r=>getTransactionAvailability(r)==='missing'),[filtered])
 const referenceRows=useMemo(()=>filtered.filter(hasPairingCategoryReference),[filtered])
 const unrecordedRows=useMemo(()=>focused.filter(r=>getTransactionAvailability(r)==='unrecorded').length,[focused])
 const before=useMemo(()=>stats(filtered,'before'),[filtered]),after=useMemo(()=>stats(filtered,'after'),[filtered])
 const timeReference=useMemo(()=>filtered.reduce((summary,row)=>{
  const before=row.before?.timeFromPairing||0,after=row.after?.timeFromPairing||0
  summary.before+=before;summary.after+=after;summary.people+=before+after>0?1:0
  return summary
 },{before:0,after:0,people:0}),[filtered])
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;worker.current?.terminate()}},[])
 useEffect(()=>{snapshotRef.current=snapshot},[snapshot])
 useEffect(()=>{setAuditPage(0)},[assessment,category,period,search,availability])
 useEffect(()=>{
  let live=true
  if(storage){
   storage.listDatasets().then(async data=>{
    if(!live)return
    setDatasets(data)
    setDbNotice('')
    if(!autoLoaded.current&&!snapshotRef.current&&data.length>0){
     autoLoaded.current=true
     await openDataset(data[0].id,{auto:true})
    }
   }).catch(err=>{if(live)setDbNotice(err.message)})
  }
  return ()=>{live=false}
 },[storage])
 async function reloadDatasets(){if(storage){const data=await storage.listDatasets();if(alive.current){setDatasets(data);setDbNotice('')}}}
 function runWorker(payload){return new Promise((resolve,reject)=>{
  const current=new Worker(new URL('./analysis.worker.js',import.meta.url),{type:'module'});worker.current=current
  current.onmessage=({data})=>{current.terminate();worker.current=null;if(data.error)reject(Error(data.error));else resolve(data)}
  current.onerror=()=>{current.terminate();worker.current=null;reject(Error('Pengolahan workbook gagal. Periksa format dan ukuran sumber.'))}
  current.postMessage({id:Date.now(),...payload})
 })}
 function updateVersion(patch){onSnapshot({...snapshot,versions:snapshot.versions.map((v,i)=>i===snapshot.active?{...v,...patch}:v)})}
 async function importWorkbook(e,restore=false){
  const file=e.target.files?.[0];e.target.value='';if(!file)return
  setBusy(true);setError('');setMessage('Membaca Data Olah, Hasil pairing, dan transaksi 2025…')
  try{
   if(!/\.xlsx$/i.test(file.name))throw Error('Gunakan workbook .xlsx.')
   if(file.size>60*1024*1024)throw Error('Ukuran workbook maksimal 60 MB.')
   const bytes=new Uint8Array(await file.arrayBuffer())
   const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')
   if(restore&&(!result?.source?.sha256||sha256!==result.source.sha256))throw Error('Workbook berbeda dari sumber versi tersimpan. Pilih file sumber yang SHA-256-nya sama, atau mulai dataset baru melalui Unggah workbook final.')
   const data=await runWorker({action:'import',bytes,rules:restore?result.rules:DEFAULT_RULES});if(!alive.current)return
   if(restore){onSnapshot({...snapshot,source:data.source});setMessage('Sumber asli berhasil dipasangkan kembali. Parameter dapat dihitung sebagai versi baru tanpa mengubah hasil tersimpan.');return}
   const imported={...data.result,source:{filename:file.name,sha256,reference:'Nodin Sekjen Nomor 3513/I/KP.06.08/09/2026'}}
   onSnapshot({kind:'analysis',filename:file.name,name:`Analisis Disiplin ASN ${new Date().toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})}`,source:data.source,versions:[{number:1,createdAt:now(),result:imported,status:'active',followups:[]}],active:0})
   setPreview(null);setArchiveReview(false);resetFilters();setTab('analysis');setAuditPage(0)
   setMessage(`Workbook dibaca: ${number(imported.rows.length)} SDM sumber; ${number(imported.rows.filter(isFocusedAssessment).length)} SDM Terbukti/Tidak Terbukti menjadi fokus daftar. Hasil belum disimpan online.`)
  }catch(err){if(alive.current){setError(err.message);setMessage('')}}finally{if(alive.current)setBusy(false)}
 }
 async function calculate(rules){
  if(!snapshot?.source||archived)return
  if(snapshot.versions.at(-1).status==='archived'){setError('Versi terakhir sudah diarsipkan. Mulai dataset baru untuk analisis lanjutan.');return}
  setBusy(true);setError('');setMessage('Menghitung pratinjau parameter baru…')
  try{const data=await runWorker({action:'analyze',source:snapshot.source,rules});if(alive.current){setPreview({...data.result,source:result.source});setMessage('Tinjau perbedaan sebelum menetapkan versi baru.')}}catch(err){if(alive.current)setError(err.message)}finally{if(alive.current)setBusy(false)}
 }
 function acceptPreview(){
  const next=Math.max(...snapshot.versions.map(v=>v.number))+1
  onSnapshot({...snapshot,versions:[...snapshot.versions,{number:next,createdAt:now(),result:preview,status:'active',parentIndex:snapshot.versions.length-1,followups:[]}],active:snapshot.versions.length})
  setPreview(null);setSelected(null);setAuditPage(0);setMessage(`Versi ${next} ditetapkan dalam sesi. Versi sebelumnya tetap tersedia. Simpan online untuk mempertahankan hasil.`)
 }
 async function save(){
  if(!storage||!version||archived||(!version.id&&!canImport)||(version.id&&(!pendingFollowups||!canEdit)))return
  setBusy(true);setError('')
  try{
   const {pending}=await persistVersionChain({snapshot,storage,isActive:()=>alive.current,onProgress:versions=>onSnapshot({...snapshot,versions})})
   if(!alive.current)return
   setMessage(pending?'Dataset tersimpan. Sebagian catatan tindak lanjut belum terkirim; buka dan simpan kembali catatan tersebut.':'Versi hasil dan riwayat pendahulunya tersimpan online. Transaksi mentah tetap berada di browser.')
   try{await reloadDatasets()}catch{if(alive.current)setDbNotice('Hasil tersimpan; muat ulang daftar dataset untuk memperbarui tampilan.')}
  }catch(err){if(alive.current)setError(err.message)}finally{if(alive.current)setBusy(false)}
 }
 async function openDataset(id,{auto=false}={}){
  setBusy(true);setError('');setPreview(null);setArchiveReview(false)
  try{
   const [data,followups]=await Promise.all([storage.loadDataset(id),storage.loadFollowups(id)]);if(!alive.current)return
   onSnapshot({kind:'analysis',name:data.name,filename:data.filename,source:null,active:0,versions:[{id:data.id,number:data.version,createdAt:data.createdAt,status:data.status,result:data.result,followups,auditEvents:data.auditEvents||[]}]})
   resetFilters();setTab('analysis');setAuditPage(0)
   setMessage(auto?`Dataset online "${data.name}" (versi ${data.version}) otomatis dimuat.`:'Dataset dimuat. Untuk menghitung ulang, unggah workbook asli sebagai dataset analisis baru.')
  }catch(err){if(alive.current)setError(err.message)}finally{if(alive.current)setBusy(false)}
 }
 async function removeDataset(d){
  if(!storage||!canImport||busy)return
  const ok=window.confirm(`Hapus dataset "${d.name}" (versi ${d.version}) dari riwayat online?\n\nPerhatian: Data ini beserta catatan tindak lanjut dan jejak perubahannya akan dihapus permanen.`)
  if(!ok)return
  setBusy(true);setError('');setMessage(`Menghapus dataset ${d.name}…`)
  try{
   await storage.deleteDataset(d.id)
   if(!alive.current)return
   setMessage(`Dataset "${d.name}" (versi ${d.version}) berhasil dihapus dari riwayat online.`)
   if(version?.id===d.id)updateVersion({id:null})
   await reloadDatasets()
  }catch(err){if(alive.current)setError(err.message)}finally{if(alive.current)setBusy(false)}
 }
 async function archive(){
  if(!version.id){setError('Simpan dataset online sebelum mengarsipkan agar arsip tetap tersedia.');return}
  if(version.followups?.some(f=>f.pending)){setError('Simpan kembali catatan tindak lanjut yang belum terkirim sebelum mengarsipkan.');return}
  setBusy(true);setError('')
  try{await storage.archiveDataset(version.id);if(!alive.current)return;updateVersion({status:'archived'});setArchiveReview(false);setPreview(null);setMessage('Versi diarsipkan online dan hanya dapat dibaca.');try{await reloadDatasets()}catch{if(alive.current)setDbNotice('Arsip tersimpan; muat ulang daftar dataset.')}}catch(err){if(alive.current)setError(err.message)}finally{if(alive.current)setBusy(false)}
 }
 async function saveFollowup(patch,{expectedUpdatedAt=null}={}){
  if(!canEdit||archived||!selectedRow)return
  setBusy(true)
  try{
   const value=version.id?await storage.saveFollowup({datasetId:version.id,nik:selectedRow.nik,patch,expectedUpdatedAt}):{...patch,nik:selectedRow.nik,updatedAt:now()}
   if(!alive.current)return
   updateVersion({followups:[...(version.followups||[]).filter(f=>f.nik!==selectedRow.nik),value]})
   setMessage(version.id?'Tindak lanjut disimpan online.':'Tindak lanjut tersimpan dalam sesi; akan dikirim saat dataset disimpan online.')
   return value
  }catch(err){
   if(alive.current){if(err.code==='DISCIPLINE_ARCHIVED')updateVersion({status:'archived'});throw err}
  }finally{if(alive.current)setBusy(false)}
 }
 async function loadLatestFollowup(){
  if(!storage||!version?.id||!selectedRow)return {value:null,archived}
  setBusy(true)
  try{
   const [data,followups]=await Promise.all([storage.loadDataset(version.id),storage.loadFollowups(version.id)])
   if(!alive.current)return {value:null,archived:true}
   const value=followups.find(f=>f.nik===selectedRow.nik)||null
   // Refresh archive state only. The form owns its draft and original revision;
   // loading a comparison must not replace pending drafts in the snapshot.
   updateVersion({status:data.status,auditEvents:data.auditEvents||[]})
   return {value,archived:data.status==='archived'}
  }catch(err){if(alive.current&&err.code==='DISCIPLINE_ARCHIVED')updateVersion({status:'archived'});throw err}
  finally{if(alive.current)setBusy(false)}
 }
 async function loadEvents(){
  setBusy(true);setError('')
  try{const data=await storage.loadDataset(version.id);if(alive.current)updateVersion({auditEvents:data.auditEvents||[],status:data.status})}catch(err){if(alive.current)setError(err.message)}finally{if(alive.current)setBusy(false)}
 }
 async function download(){setBusy(true);setError('');try{await exportDiscipline({rows:filtered,rules:result.rules,version:version.number,filename:snapshot.filename,source:result.source,filters});if(alive.current)setMessage('Hasil sesuai filter diekspor beserta kelengkapan data, parameter, dan audit SDM terpilih.')}catch(err){if(alive.current)setError(err.message)}finally{if(alive.current)setBusy(false)}}
 function changeFilters(patch){if('assessment' in patch)setAssessment(patch.assessment);if('category' in patch)setCategory(patch.category);if('period' in patch)setPeriod(patch.period);if('search' in patch)setSearch(patch.search);if('availability' in patch)setAvailability(patch.availability);setSelected(null)}
 function resetFilters(){setSearch('');setAssessment('Terbukti');setCategory('');setPeriod('after');setAvailability('');setSelected(null)}
 async function saveCorrection(payload){
  if(!canEdit||archived)return
  setBusy(true);setError('');setMessage('Menerapkan koreksi validasi dan menghitung ulang…')
  try{
   const currentCorrections=snapshot.source?.corrections||result?.metadata?.corrections||[]
   const updatedCorrections=[...currentCorrections.filter(c=>c.id!==payload.id&&!(c.row!=null&&c.row===payload.row)&&!(c.key&&c.key===payload.key)),payload]

   if(snapshot.source){
    const updatedSource={...snapshot.source,corrections:updatedCorrections}
    const data=await runWorker({action:'analyze',source:updatedSource,rules:result.rules})
    if(!alive.current)return
    const updatedResult={...data.result,source:result.source}
    updateVersion({result:updatedResult})
    onSnapshot({
     ...snapshot,
     source:updatedSource,
     versions:snapshot.versions.map((v,i)=>i===snapshot.active?{...v,result:updatedResult}:v)
    })
   }else{
    const updatedAudits=(result.audits||[]).map(a=>{
     const match=(payload.row!=null&&a.row===payload.row)||(payload.nik&&`${a.type}-nik-${a.nik}`===`${payload.type}-nik-${payload.nik}`)||(payload.key&&a.type==='time-tie'&&a.nik===payload.nik)
     if(match){
      return {...a,resolved:payload.resolved,resolution:payload,resolutionNote:payload.reason}
     }
     return a
    })
    const updatedResult={
     ...result,
     audits:updatedAudits,
     metadata:{...(result.metadata||{}),corrections:updatedCorrections}
    }
    updateVersion({result:updatedResult})
   }
   setActiveFinding(null)
   setMessage('Koreksi validasi berhasil disimpan dan skor dihitung ulang.')
  }catch(err){
   if(alive.current)setError(err.message)
  }finally{
   if(alive.current)setBusy(false)
  }
 }
 async function removeCorrection(target){
  if(!canEdit||archived)return
  setBusy(true);setError('');setMessage('Membatalkan koreksi dan mengembalikan nilai sumber asli…')
  try{
   const targetId=typeof target==='string'?target:(target?.id||target?.resolution?.id)
   const targetRow=target?.row
   const currentCorrections=snapshot.source?.corrections||result?.metadata?.corrections||[]
   const updatedCorrections=currentCorrections.filter(c=>{
    if(targetId&&c.id===targetId)return false
    if(targetRow!=null&&c.row===targetRow)return false
    return true
   })

   if(snapshot.source){
    const updatedSource={...snapshot.source,corrections:updatedCorrections}
    const data=await runWorker({action:'analyze',source:updatedSource,rules:result.rules})
    if(!alive.current)return
    const updatedResult={...data.result,source:result.source}
    updateVersion({result:updatedResult})
    onSnapshot({
     ...snapshot,
     source:updatedSource,
     versions:snapshot.versions.map((v,i)=>i===snapshot.active?{...v,result:updatedResult}:v)
    })
   }else{
    const updatedAudits=(result.audits||[]).map(a=>{
     const match=(targetRow!=null&&a.row===targetRow)||(targetId&&a.resolution?.id===targetId)
     if(match){
      const {resolved,resolution,resolutionNote,...rest}=a
      return rest
     }
     return a
    })
    const updatedResult={
     ...result,
     audits:updatedAudits,
     metadata:{...(result.metadata||{}),corrections:updatedCorrections}
    }
    updateVersion({result:updatedResult})
   }
   setActiveFinding(null)
   setMessage('Koreksi dibatalkan. Nilai sumber asli dipulihkan.')
  }catch(err){
   if(alive.current)setError(err.message)
  }finally{
   if(alive.current)setBusy(false)
  }
 }
 if(legacy)return <div className="judol-module"><button className="btn secondary" onClick={()=>setLegacy(false)}>Kembali ke analisis transaksi</button><LegacyJudolModule snapshot={snapshot?.kind==='legacy'?snapshot.data:null} onSnapshot={data=>onSnapshot({kind:'legacy',data})} canImport={canImport}/></div>
 return <div className="judol-module discipline-module">
  <div className="page-title"><div><span className="eyebrow">TINDAK LANJUT INDIKASI JUDI ONLINE</span><h1>Kategorisasi Disiplin ASN</h1><p>Acuan Nodin Sekjen Nomor 3513 · Pairing Sekjen, sebelum ASN, dan sesudah ASN.</p></div><div className="discipline-toolbar">{canImport&&<label className="btn primary judol-upload">{busy?'Sedang memproses…':'Unggah workbook final'}<input type="file" accept=".xlsx" disabled={busy} onChange={importWorkbook} aria-label="Unggah workbook final analisis disiplin"/></label>}<button className="btn secondary" disabled={busy} onClick={()=>setLegacy(true)}>Baca hasil Excel lama</button></div></div>
  <div className="notice amber-notice"><span>Kategori merupakan bahan pertimbangan awal proses disiplin. Status Terbukti/Tidak Terbukti mengikuti Data Olah; keputusan hukuman mengikuti hasil pemeriksaan. Jadwal, batas rekonstruksi, dan kelengkapan data dapat ditinjau melalui parameter dan audit.</span></div>
  {error&&<div role="alert" className="notice red-notice">{error}</div>}{message&&<div role="status" className="notice discipline-message">{message}</div>}
  <nav className="discipline-tabs" aria-label="Bagian kategorisasi disiplin">{tabs.map(([key,label])=><button className={'btn '+(tab===key?'primary':'secondary')} key={key} aria-current={tab===key?'page':undefined} disabled={busy} onClick={()=>{setTab(key);setSelected(null)}}>{label}</button>)}</nav>
  {version&&<div className="discipline-versionbar"><span><b>{snapshot.name}</b> · versi {version.number} · {archived?'Arsip baca-saja':version.id?'Tersimpan online':'Belum disimpan online'}</span><span>{date(version.createdAt)}</span></div>}
  {tab!=='datasets'&&!version&&<section className="panel">{busy?<><h2>Memuat dataset tersimpan…</h2><p role="status">Sedang memuat data analisis terbaru dari penyimpanan online…</p></>:<><h2>Mulai dari workbook sumber final</h2><p>Unggah file dengan sheet Data Olah, Hasil pairing, dan data transaksi 2025. Satu kali unggah memasangkan identitas, hasil klarifikasi, hasil Sekjen, dan transaksi per NIK.</p><p>Daftar difokuskan pada Terbukti/Tidak Terbukti, dengan pilihan awal Terbukti. Seluruh baris sumber tetap dipertahankan. Workbook baru memulai dataset baru dan transaksi diproses di browser.</p><button className="btn secondary" onClick={()=>setTab('datasets')}>Buka dataset tersimpan</button></>}</section>}
  {(tab==='analysis'||tab==='audit')&&version&&<DisciplineFilters value={filters} counts={counts} total={focused.length} sourceTotal={rows.length} onChange={changeFilters} onReset={resetFilters} busy={busy}/>}
  {(tab==='analysis'||tab==='audit')&&unrecordedRows>0&&<div className="notice amber-notice"><span>Versi ini belum mencatat kelengkapan rincian untuk {number(unrecordedRows)} SDM. Lampirkan sumber asli pada Parameter & versi dan hitung versi baru untuk memeriksa ketersediaannya. Hasil versi lama tetap dipertahankan.</span></div>}
  {tab==='analysis'&&version&&<>
   {missingRows.length>0&&<div className="notice amber-notice"><span><b>{number(missingRows.length)} SDM sesuai filter belum memiliki rincian transaksi master.</b> {referenceRows.length>0&&`${number(referenceRows.length)} SDM menggunakan kategori asli Hasil pairing sebagai acuan keseluruhan. `}Frekuensi, nominal, dan skor sebelum/sesudah ASN belum dapat ditentukan. Ringkasan angka hanya mencakup rincian yang tersedia; kategori acuan diberi penanda tersendiri.</span></div>}
   <div className="judol-stats">{[['SDM sesuai filter',number(filtered.length)],['Transaksi sebelum ASN'+(before.missingRows?' (data tersedia)':''),knownValue(before,'frekuensi')],['Nominal sebelum ASN'+(before.missingRows?' (data tersedia)':''),knownValue(before,'nominal',rupiah)],['Transaksi sesudah ASN'+(after.missingRows?' (data tersedia)':''),knownValue(after,'frekuensi')],['Nominal sesudah ASN'+(after.missingRows?' (data tersedia)':''),knownValue(after,'nominal',rupiah)],['SDM bertransaksi sesudah'+(after.missingRows?' (data tersedia)':''),knownValue(after,'aktif')]].map(([label,value])=><section className="panel" key={label}><span>{label}</span><strong>{value}</strong></section>)}</div>
   <p><b>Penanganan jam - pada versi ini:</b> {result.rules.missingTimePolicy==='pairing'?'Ikuti kategori waktu Hasil pairing':'Tetap perlu validasi waktu'}. Pengaturannya tersedia pada Parameter & versi.</p>
   {timeReference.people>0&&<div className="notice amber-notice"><span><b>{number(timeReference.before+timeReference.after)} transaksi pada {number(timeReference.people)} SDM sesuai filter menggunakan acuan waktu Hasil pairing.</b> Sebelum ASN: {number(timeReference.before)} transaksi; sesudah ASN: {number(timeReference.after)} transaksi. Jam asli tetap -. Rincian dan ekspor mencatat asumsi ini; kategori akhir dihitung ulang per periode.</span></div>}
   <section className="panel"><h2>Distribusi kategori dan acuan sesuai filter</h2>{referenceRows.length>0&&<p>Kategori acuan Hasil pairing ditampilkan pada kedua kolom periode sebagai referensi keseluruhan. Jumlah acuan disebutkan di setiap kategori; rincian transaksinya belum dapat dipisahkan sebelum/sesudah ASN.</p>}<div className="table-scroll"><table><thead><tr><th>Kategori / ketersediaan</th><th>Pairing Sekjen asli</th><th>Sebelum ASN</th><th>Sesudah ASN</th></tr></thead><tbody>{DISCIPLINE_CATEGORIES.map(c=><tr key={c}><th scope="row">{c}</th>{['historical','before','after'].map(key=>{const references=key==='historical'?0:referenceRows.filter(r=>r[key]?.kategori===c).length;return <td key={key}>{number(filtered.filter(r=>r[key]?.kategori===c).length)}{references>0&&<small>Termasuk {number(references)} acuan Hasil pairing</small>}</td>})}</tr>)}</tbody></table></div>{filtered.some(r=>!r.historical)&&<p>{number(filtered.filter(r=>!r.historical).length)} SDM tidak memiliki hasil Pairing Sekjen yang dapat dipasangkan secara pasti.</p>}</section>
   <section className="panel"><div className="panel-heading"><h2>Tiga hasil penilaian berdampingan</h2><button className="btn secondary" disabled={busy||!filtered.length} onClick={download}>Ekspor sesuai filter</button></div><p>Sebelum: {result.rules.start} s.d. sebelum {result.rules.cutoff}. Sesudah: {result.rules.cutoff} s.d. {result.rules.end}. NIK disamarkan; ekspor memuat identitas lengkap untuk petugas berwenang. Hasil klarifikasi Tidak Terbukti tetap mengikuti Data Olah meskipun simulasi kategorinya ditampilkan.</p><ComparisonTable key={`${snapshot.filename}-${version.number}-${assessment}-${period}-${category}-${search}-${availability}`} rows={filtered} selected={selected} onSelect={setSelected}/></section>
   {selectedRow&&<ComparisonDetail row={selectedRow} onClose={()=>setSelected(null)} onHandleValidation={(f,p)=>setActiveFinding({finding:f,person:p||selectedRow})}/>}
  </>}
  {tab==='rules'&&version&&<>
   <section className="panel"><h2>Riwayat versi dalam sesi</h2><div className="judol-categories">{snapshot.versions.map((v,i)=><button key={`${v.number}-${i}`} className={'btn '+(i===snapshot.active?'primary':'secondary')} disabled={busy} onClick={()=>{onSnapshot({...snapshot,active:i});setPreview(null);setArchiveReview(false);setSelected(null);setAuditPage(0);setError('');setMessage(`Menampilkan versi ${v.number}. Hasil dan parameter versi ini tetap tersimpan dalam riwayat.`)}}>Versi {v.number}{v.status==='archived'?' · arsip':''}</button>)}</div><p>Versi baru mempertahankan hasil lama. Catatan tindak lanjut terikat pada versi dataset masing-masing.</p></section>
   <RulePanel key={`${version.number}-${version.id||'local'}-${snapshot.active}`} rules={result.rules} version={version.number} canImport={canImport} canCalculate={Boolean(snapshot.source)} archived={archived} onCalculate={calculate} onRestoreSource={e=>importWorkbook(e,true)} onDraftChange={()=>{setPreview(null);setMessage('')}} busy={busy}/>
   {preview&&<section className="panel"><h2>Tinjau pratinjau sebelum menetapkan versi</h2><p>{number(preview.rows.filter((r,i)=>isFocusedAssessment(r)&&(r.before.kategori!==rows[i]?.before?.kategori||r.after.kategori!==rows[i]?.after?.kategori||r.before.total!==rows[i]?.before?.total||r.after.total!==rows[i]?.after?.total)).length)} SDM Terbukti/Tidak Terbukti mengalami perubahan skor atau kategori. Hasil Pairing Sekjen asli dipertahankan.</p><p>Daftar pratinjau mengikuti filter analisis aktif, termasuk kelengkapan data dan hasil klarifikasi.</p><ComparisonTable key={`${assessment}-${period}-${category}-${search}-${availability}`} rows={filterDisciplineRows(preview.rows,filters)} onSelect={setSelected}/>{selected&&preview.rows.find(r=>r.nik===selected&&isFocusedAssessment(r))&&<ComparisonDetail row={preview.rows.find(r=>r.nik===selected)} onClose={()=>setSelected(null)} onHandleValidation={(f,p)=>setActiveFinding({finding:f,person:p||preview.rows.find(r=>r.nik===selected)})}/>}<div className="discipline-toolbar"><button className="btn primary" disabled={busy} onClick={acceptPreview}>Tetapkan sebagai versi baru</button><button className="btn secondary" disabled={busy} onClick={()=>{setPreview(null);setSelected(null)}}>Batalkan pratinjau</button></div></section>}
  </>}
   {tab==='audit'&&version&&<section className="panel">
    <div className="panel-heading">
     <h2>Audit & kelengkapan sumber</h2>
     <button className="btn secondary" disabled={busy||!filtered.length} onClick={download}>Ekspor audit & hasil</button>
    </div>
    <p>{number(filteredAudits.length)} catatan audit untuk {number(filtered.length)} SDM sesuai filter aktif. Temuan anomali jam, tanggal, nominal, dan NIK dapat ditangani langsung melalui tombol Tangani di bawah.</p>
    <div className="judol-stats">
     <section className="panel"><span>Total temuan audit</span><strong>{number(filteredAudits.length)}</strong></section>
     <section className="panel"><span>Perlu tindakan</span><strong style={{color:'#b45309'}}>{number(filteredAudits.filter(a=>!a.resolved).length)}</strong></section>
     <section className="panel"><span>Telah diselesaikan</span><strong style={{color:'#15803d'}}>{number(filteredAudits.filter(a=>a.resolved).length)}</strong></section>
     <section className="panel"><span>Koreksi aktif</span><strong>{number((result.metadata?.corrections||[]).length)}</strong></section>
    </div>
    <div className="discipline-rule-grid" style={{marginBottom:'16px'}}>
     <label>Status temuan
      <select value={auditStatusFilter} onChange={e=>{setAuditStatusFilter(e.target.value);setAuditPage(0)}}>
       <option value="all">Semua status temuan</option>
       <option value="open">Perlu tindakan saja</option>
       <option value="resolved">Telah diselesaikan saja</option>
      </select>
     </label>
     <label>Cari temuan / NIK / alasan
      <input value={auditSearch} placeholder="Ketik kata kunci…" onChange={e=>{setAuditSearch(e.target.value);setAuditPage(0)}}/>
     </label>
    </div>
    <div className="table-scroll">
     <table>
      <thead>
       <tr>
        <th>Jenis</th>
        <th>NIK & Nama</th>
        <th>Temuan</th>
        <th>Baris</th>
        <th>Status</th>
        <th>Aksi</th>
       </tr>
      </thead>
      <tbody>
       {displayedAudits.slice(currentAuditPage*50,currentAuditPage*50+50).map((a,i)=>{
        const p=rows.find(r=>r.nik===a.nik)
        return <tr key={i}>
         <td>{a.type==='time-from-pairing'?'Acuan waktu Hasil pairing':a.type==='missing-transaction-details'?'Rincian transaksi belum tersedia':a.type==='invalid-time'?'Format jam tidak valid':a.type==='invalid-date'?'Tanggal tidak valid':a.type==='invalid-amount'?'Nominal tidak valid':a.type==='time-tie'?'Aktivitas seri':a.type}</td>
         <td>{a.nik?<div><b>{p?p.nama:'—'}</b><br/><small>{a.nik.slice(0,4)}••••••••{a.nik.slice(-4)}</small></div>:'—'}</td>
         <td>
          {a.message}
          {a.resolved&&a.resolution?.reason&&<small style={{display:'block',color:'#166534',marginTop:'4px'}}>Koreksi: {a.resolution.reason}{a.resolution.evidenceRef&&` · Ref: ${a.resolution.evidenceRef}`}{a.resolution.resolvedBy&&` · Oleh: ${a.resolution.resolvedBy}`}</small>}
         </td>
         <td>{a.row??'—'}</td>
         <td><span className={'validation-badge '+(a.resolved?'resolved':'open')}>{a.resolved?'Diselesaikan':'Perlu tindakan'}</span></td>
         <td><button type="button" className="btn secondary btn-small" disabled={busy} onClick={()=>setActiveFinding({finding:a,person:p})}>{a.resolved?'Lihat koreksi':'Tangani'}</button></td>
        </tr>
       })}
      </tbody>
     </table>
    </div>
    {!displayedAudits.length&&<p>Tidak ada catatan audit yang sesuai dengan filter/pencarian ini.</p>}
    <div className="judol-pagination">
     <button className="btn secondary" disabled={currentAuditPage===0} onClick={()=>setAuditPage(currentAuditPage-1)}>Sebelumnya</button>
     <span>Halaman {currentAuditPage+1} dari {Math.max(1,Math.ceil(displayedAudits.length/50))} ({number(displayedAudits.length)} catatan)</span>
     <button className="btn secondary" disabled={(currentAuditPage+1)*50>=displayedAudits.length} onClick={()=>setAuditPage(currentAuditPage+1)}>Berikutnya</button>
    </div>
   </section>}
  {tab==='audit'&&version?.id&&<section className="panel"><div className="panel-heading"><h2>Jejak perubahan online</h2><button className="btn secondary" disabled={busy} onClick={loadEvents}>Muat jejak perubahan</button></div><p>Impor, versi parameter, perubahan tindak lanjut, dan pengarsipan dicatat oleh server.</p><div className="table-scroll"><table><thead><tr><th>Tindakan</th><th>Waktu (WIB)</th><th>Identitas akun pencatat</th></tr></thead><tbody>{(version.auditEvents||[]).map(event=><tr key={event.id}><td>{event.action}</td><td>{date(event.occurredAt)}</td><td>{event.actor}</td></tr>)}</tbody></table></div></section>}
  {tab==='followup'&&version&&<><section className="panel"><h2>Penanganan SDM</h2><label>SDM<select value={selected||''} disabled={busy} onChange={e=>setSelected(e.target.value||null)}><option value="">Pilih SDM…</option>{focused.map(r=><option key={r.nik} value={r.nik}>{r.nama} · {r.hasilPenilaian}</option>)}</select></label></section>{selectedRow&&<FollowupForm key={`${version.number}-${selected}-${version.id||'local'}`} row={selectedRow} value={version.followups?.find(f=>f.nik===selected)} canEdit={canEdit} archived={archived} online={Boolean(version.id)} busy={busy} onSave={saveFollowup} onReloadLatest={loadLatestFollowup} onHandleValidation={(f,p)=>setActiveFinding({finding:f,person:p||selectedRow})}/>}</>}
  {tab==='datasets'&&<>
   {version&&<section className="panel"><h2>Dataset aktif</h2><p><b>Sumber:</b> {snapshot.filename}</p>{result.source?.sha256&&<p className="discipline-hash">SHA-256: {result.source.sha256}</p>}<label>Nama dataset<input value={snapshot.name} maxLength={120} disabled={!canImport||nameLocked||archived||busy} onChange={e=>onSnapshot({...snapshot,name:e.target.value})}/></label>{nameLocked&&!version.id&&<p>Nama dikunci setelah percobaan simpan agar pengiriman ulang tetap merujuk pada versi yang sama.</p>}<p>{version.id?'Versi tersimpan online.':'Versi hanya tersedia selama sesi browser; muat ulang atau keluar menghapus data yang belum disimpan.'}</p>{!archived&&(canImport||(canEdit&&version.id&&pendingFollowups))&&<div className="discipline-toolbar"><button className="btn primary" disabled={busy||!storage||(Boolean(version.id)&&!pendingFollowups)||!snapshot.name.trim()} onClick={save}>{version.id?(pendingFollowups?'Kirim ulang catatan tertunda':'Sudah tersimpan online'):'Simpan versi online'}</button>{canImport&&<button className="btn secondary" disabled={busy||!version.id||pendingFollowups} onClick={()=>setArchiveReview(true)}>Arsipkan versi ini</button>}</div>}{!version.id&&<p>Simpan versi online sebelum mengarsipkan. Versi pendahulu yang belum tersimpan akan disimpan berurutan.</p>}{archiveReview&&!archived&&<div className="notice amber-notice"><span>Versi {version.number} akan menjadi baca-saja. Parameter dan tindak lanjut versi arsip tidak dapat diubah.</span><button className="btn secondary" disabled={busy} onClick={()=>setArchiveReview(false)}>Batal</button><button className="btn primary" disabled={busy} onClick={archive}>Tetapkan arsip baca-saja</button></div>}</section>}
   <section className="panel"><div className="panel-heading"><h2>Riwayat dataset online</h2><button className="btn secondary" disabled={!storage||busy} onClick={async()=>{setBusy(true);try{await reloadDatasets()}catch(err){setDbNotice(err.message)}finally{setBusy(false)}}}>Muat ulang daftar</button></div>{!storage&&<p>Penyimpanan online belum tersedia pada pratinjau lokal. Analisis dapat diuji tanpa mengubah database.</p>}{dbNotice&&<p role="status" className="notice amber-notice">{dbNotice}</p>}<div className="table-scroll"><table><thead><tr><th>Nama</th><th>Versi</th><th>Status</th><th>Tanggal</th><th>Aksi</th></tr></thead><tbody>{datasets.map(d=><tr key={d.id}><td>{d.name}</td><td>{d.version}</td><td>{d.status==='archived'?'Arsip baca-saja':'Aktif'}</td><td>{date(d.createdAt)}</td><td><div style={{display:'flex',gap:'6px'}}><button className="btn secondary" disabled={busy} onClick={()=>openDataset(d.id)}>Buka</button>{canImport&&<button type="button" className="btn secondary" style={{color:'#b91c1c'}} disabled={busy} onClick={()=>removeDataset(d)}>Hapus</button>}</div></td></tr>)}</tbody></table></div>{!datasets.length&&<p>Belum ada dataset online yang dimuat.</p>}</section>
  </>}
   {activeFinding&&<ValidationModal finding={activeFinding.finding} person={activeFinding.person} onSave={saveCorrection} onRemove={removeCorrection} onClose={()=>setActiveFinding(null)} canEdit={canEdit} archived={archived}/>}
 </div>
}
