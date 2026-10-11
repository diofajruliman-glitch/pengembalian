import React,{useEffect,useMemo,useRef,useState} from 'react'
import {ChevronLeft,ChevronRight,RefreshCw,Search,X,FileSpreadsheet,History} from 'lucide-react'
import {adjustmentApi} from './api.js'
import {REASONS,primaryReason,sourcePriorityChanged} from './model.js'
import './adjustments.css'
import ChronologyRecap from './ChronologyRecap.jsx'

const money=v=>v===null||v===undefined?'Kosong':'Rp '+Number(v).toLocaleString('id-ID',{maximumFractionDigits:2})
const count=v=>Number(v||0).toLocaleString('id-ID')
const value=v=>v===null||v===undefined||v===''?'Kosong':String(v)
const initialFilters={search:'',sp2dOld:'',sp2dUpdated:'',bpk:'',month:'',zone:'',reason:'',primaryReason:'',sourcePriority:'',tendik:'',leave:'',statusInitial:'',statusFinal:'',change:''}

function ReasonTags({row}){
 const main=primaryReason(row)
 return <div className="adjustment-tags">{row.reasons.map(key=><span key={key} className={'pill '+(key==='STATUS'?'slate':'amber')}>{key===main?'Utama: ':'Tambahan: '}{REASONS[key]||key}{row.evidence.find(e=>e.reason===key)?.origin==='aturan'&&!(key==='TENDIK'&&/\bTENDIK\b/i.test(row.note))?' · aturan otomatis':''}</span>)}{sourcePriorityChanged(row)&&<small>Alasan utama: keterangan spesifik kolom S.</small>}{!row.reasons.length&&<span>{row.delta===null?'Nominal belum lengkap':'Tidak berubah'}</span>}</div>
}
function Recap({title,groups,transition=false}){
 return <section className="panel table-panel adjustment-recap"><div className="panel-heading"><h2>{title}</h2></div><div className="table-scroll"><table><thead><tr><th>{transition?'SP2D lama → update':'Tahun SP2D'}</th><th>Status SEND BPK</th><th>Data / SDM unik</th><th>Awal</th><th>Final</th><th>Selisih</th></tr></thead><tbody>{groups.map(g=><tr key={JSON.stringify(g.values)}><td>{transition?`${value(g.values[0])} → ${value(g.values[1])}`:value(g.values[0])}</td><td>{value(g.values[transition?2:1])}</td><td>{count(g.rows)} / {count(g.people)}</td><td>{money(g.initial)}{g.missingInitial>0&&<small>{count(g.missingInitial)} kosong</small>}</td><td>{money(g.final)}{g.missingFinal>0&&<small>{count(g.missingFinal)} kosong</small>}</td><td>{money(g.delta)}{g.missingDelta>0&&<small>{count(g.missingDelta)} tidak dihitung</small>}</td></tr>)}{!groups.length&&<tr><td colSpan={6} className="empty">Tidak ada data sesuai filter.</td></tr>}</tbody></table></div></section>
}

function SdmHistory({api,nip,onClose}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[selected,setSelected]=useState(null)
 const closeRef=useRef(null)
 useEffect(()=>{
  const previous=document.activeElement,controller=new AbortController()
  closeRef.current?.focus()
  api.history(nip,controller.signal).then(result=>{setData(result);setSelected(result.rows.at(-1)||null)}).catch(e=>{if(e.name!=='AbortError')setError(e.message)})
  return()=>{controller.abort();previous?.focus?.()}
 },[api,nip])
 function keys(event){
  if(event.key==='Escape')onClose()
  if(event.key==='Tab'){
   const controls=[...event.currentTarget.querySelectorAll('button,select,a[href],input,[tabindex="0"]')].filter(e=>!e.disabled)
   if(!controls.length)return
   if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus()}
   else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus()}
  }
 }
 const headers=selected?.headers||data?.headers||[]
 return <div className="modal-mask" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal adjustment-dialog" role="dialog" aria-modal="true" aria-labelledby="adjustment-history-title" onKeyDown={keys}><div className="modal-top"><div><h3 id="adjustment-history-title">Riwayat pengembalian per SDM</h3><p>{data?.rows[0]?.name||'Memuat…'} · <span className="mono">{nip}</span></p></div><button ref={closeRef} className="icon-btn" aria-label="Tutup riwayat" onClick={onClose}><X size={20}/></button></div><div className="modal-main">
  {error&&<p role="alert" className="notice red-notice">{error}</p>}
  {!data&&!error&&<p role="status">Memuat riwayat SDM…</p>}
  {data&&<><p className="notice demo-notice">Awal → final adalah perbandingan dalam workbook. Urutan versi menunjukkan waktu impor; tanggal koreksi dalam Excel tidak tersedia.</p>
   <div className="table-scroll"><table><thead><tr><th>Versi / periode</th><th>SP2D lama → update</th><th>Awal → final</th><th>Selisih</th><th>Alasan</th><th>Detail</th></tr></thead><tbody>{data.rows.map((r,i)=><tr key={`${r.importId||'local'}-${r.sourceRow}`}><td><b>{r.month} {r.periodYear}</b><small>{r.fileName||data.imports[0]?.fileName}</small><small>{r.importedAt?new Date(r.importedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}):'Versi workbook lokal'}</small></td><td>{value(r.sp2dOld)} → {value(r.sp2dUpdated)}<small>{value(r.bpk)}</small></td><td>{money(r.initial)}<br/>→ {money(r.final)}</td><td>{money(r.delta)}</td><td><ReasonTags row={r}/></td><td><button className="btn secondary" onClick={()=>setSelected(r)} aria-pressed={selected===r}>Lihat sumber</button></td></tr>)}</tbody></table></div>
   {selected&&<section className="adjustment-detail"><h3>Dasar alasan · {selected.month} {selected.periodYear}</h3><p>Sheet “3 bulan”, baris {selected.sourceRow}. Zona sumber: {value(selected.originalZone)} → zona wilayah: {value(selected.zone)} ({selected.zoneBasis}).</p>{selected.evidence.map(e=><p key={e.reason}><b>{REASONS[e.reason]}</b><br/>{e.description}<small>Dasar: {e.origin}</small></p>)}{!selected.evidence.length&&<p>{selected.delta===null?'Nominal awal/final kosong; selisih tidak dihitung.':'Tidak ada perubahan nominal atau status.'}</p>}
    <details><summary>Seluruh kolom sumber workbook</summary><dl className="adjustment-source">{headers.map((h,i)=><React.Fragment key={`${h}-${i}`}><dt>{h}</dt><dd>{value(selected.source?.[i])}</dd></React.Fragment>)}</dl></details>
   </section>}
  </>}
 </div></div></div>
}

export default function AdjustmentMonitor({supabase,local=false}){
 const api=useMemo(()=>adjustmentApi(supabase,{local}),[supabase,local])
 const [manifest,setManifest]=useState(null),[filters,setFilters]=useState(initialFilters),[page,setPage]=useState(0)
 const [result,setResult]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0),[nip,setNip]=useState(null),[recapMode,setRecapMode]=useState('transition')
 const [queryFilters,setQueryFilters]=useState(filters)
 useEffect(()=>{const timer=setTimeout(()=>setQueryFilters(filters),250);return()=>clearTimeout(timer)},[filters])
 useEffect(()=>{
  const controller=new AbortController();setManifest(null);setError('');setLoading(true)
  api.manifest(controller.signal).then(setManifest).catch(e=>{if(e.name!=='AbortError'){setError(e.message);setLoading(false)}})
  return()=>controller.abort()
 },[api,refresh])
 useEffect(()=>{
  if(!manifest)return
  const controller=new AbortController();setLoading(true);setError('');setResult(null)
  api.query(queryFilters,page,controller.signal).then(setResult).catch(e=>{if(e.name!=='AbortError')setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[api,manifest,queryFilters,page])
 function filter(key,value){setFilters(old=>({...old,[key]:value}));setPage(0);setResult(null)}
 function select(key,label){return <label className="form-field"><span>{label}</span><select aria-label={label} value={filters[key]} onChange={e=>filter(key,e.target.value)}><option value="">Semua</option>{(manifest?.facets[key]||[]).map(v=><option key={v??'__EMPTY__'} value={v===null||v===''?'__EMPTY__':v}>{value(v)}</option>)}</select></label>}
 const summary=result?.summary
 return <div className="adjustment-monitor">
  <div className="page-title"><div><span className="eyebrow">MASTER PENGEMBALIAN · BACA SAJA</span><h1>Perubahan Pengembalian</h1><p>Telusuri BNBA awal dan final, alasan penyesuaian, serta riwayat per SDM.</p></div><button className="btn secondary" disabled={loading} onClick={()=>setRefresh(x=>x+1)}><RefreshCw size={16}/> Muat ulang</button></div>
  {manifest&&<div className="notice demo-notice"><FileSpreadsheet size={18}/><span><b>{manifest.fileName}</b> · {count(manifest.expectedRows)} data · {count(manifest.summary?.people)} SDM unik.<br/>{local?'Sumber lokal privat di komputer ini.':'Sumber lampiran tersimpan di Supabase.'} Angka mengikuti rincian workbook; alasan zona/absensi mengikuti aturan yang ditetapkan.</span></div>}
  {manifest?.warnings?.map((w,i)=><div key={i} className="notice amber-notice"><span>{w.description}<br/>Rincian: {money(w.detail)} · rekap workbook: {money(w.cached)}.</span></div>)}
  {error&&<div role="alert" className="notice red-notice">{error}</div>}
  {manifest&&<ChronologyRecap api={api} version={manifest.preparedAt} refresh={refresh} onSelect={preset=>{setFilters({...initialFilters,...preset});setPage(0);setResult(null)}}/>}
  <section className="panel"><div className="panel-heading"><h2>Filter data dan rekap</h2><button className="btn secondary" onClick={()=>{setFilters(initialFilters);setPage(0);setResult(null)}}>Reset filter</button></div><div className="adjustment-filters">
   <label className="form-field adjustment-search"><span>Cari nama / NIP</span><div className="search-box"><Search size={16}/><input aria-label="Cari nama atau NIP" value={filters.search} onChange={e=>filter('search',e.target.value)} placeholder="Nama atau NIP 18 digit"/></div></label>
   {select('sp2dOld','STATUS SP2D (lama)')}{select('sp2dUpdated','STATUS SP2D UPDATE')}{select('bpk','STATUS SEND BPK')}{select('month','Bulan')}
   <label className="form-field"><span>Perubahan</span><select aria-label="Perubahan" value={filters.change} onChange={e=>filter('change',e.target.value)}><option value="">Semua data</option><option value="amount">Ada selisih nominal</option><option value="any">Nominal atau status berubah</option><option value="unchanged">Tidak berubah</option><option value="missing">Nominal belum lengkap</option></select></label>
   <label className="form-field"><span>Alasan perubahan</span><select aria-label="Alasan perubahan" value={filters.reason} onChange={e=>filter('reason',e.target.value)}><option value="">Semua alasan</option>{Object.entries(REASONS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   {select('zone','Zona waktu wilayah')}{select('statusInitial','Status pengembalian awal')}{select('statusFinal','Status pengembalian final')}{select('leave','Cuti')}{select('tendik','Status tendik')}
  </div></section>
  <label className="form-field"><span>Alasan utama rekap</span><select aria-label="Alasan utama rekap" value={filters.primaryReason} onChange={e=>filter('primaryReason',e.target.value)}><option value="">Semua alasan utama</option>{Object.entries({...REASONS,UNCHANGED:'Tidak berubah nominal',MISSING:'Nominal belum lengkap'}).filter(([key])=>key!=='STATUS').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <label className="form-field"><span>Atribusi kolom S</span><select aria-label="Atribusi kolom S" value={filters.sourcePriority} onChange={e=>filter('sourcePriority',e.target.value)}><option value="">Semua data</option><option value="changed">Alasan utama berbeda dari prioritas umum</option></select></label>
  {loading&&<p role="status">Memuat data dan rekap sesuai filter…</p>}
  {summary&&<><div className="stats-grid adjustment-stats"><div className="stat-card"><span>Data / SDM unik</span><strong>{count(summary.rows)} / {count(summary.people)}</strong><small>{count(summary.changed)} baris berselisih nominal</small></div><div className="stat-card"><span>Pengembalian awal</span><strong>{money(summary.initial)}</strong><small>{count(summary.missingInitial)} nilai kosong</small></div><div className="stat-card green"><span>Pengembalian final</span><strong>{money(summary.final)}</strong><small>{count(summary.missingFinal)} nilai kosong</small></div><div className="stat-card amber"><span>Selisih final − awal</span><strong>{money(summary.delta)}</strong><small>{count(summary.missingDelta)} baris tidak dihitung karena kosong</small></div></div>
   <div className="adjustment-recap-options" role="group" aria-label="Dasar rekap"><button className={'btn '+(recapMode==='old'?'primary':'secondary')} aria-pressed={recapMode==='old'} onClick={()=>setRecapMode('old')}>SP2D lama</button><button className={'btn '+(recapMode==='updated'?'primary':'secondary')} aria-pressed={recapMode==='updated'} onClick={()=>setRecapMode('updated')}>SP2D update</button><button className={'btn '+(recapMode==='transition'?'primary':'secondary')} aria-pressed={recapMode==='transition'} onClick={()=>setRecapMode('transition')}>Lama → update</button></div>
   <Recap title={recapMode==='old'?'Rekap tahun SP2D lama':recapMode==='updated'?'Rekap tahun SP2D update':'Rekap perpindahan tahun SP2D'} groups={result.recaps[recapMode]} transition={recapMode==='transition'}/>
   <section className="panel table-panel"><div className="panel-heading"><h2>BNBA sesuai filter</h2><span>{count(summary.rows)} data</span></div><div className="table-scroll"><table><thead><tr><th>SDM / periode</th><th>SP2D lama → update</th><th>Status SEND BPK</th><th>Pengembalian awal</th><th>Pengembalian final</th><th>Selisih</th><th>Alasan perubahan</th><th>Riwayat</th></tr></thead><tbody>{result.rows.map(r=><tr key={r.sourceRow}><td><b>{r.name}</b><span className="mono">{r.nip}</span><small>{r.month} {r.periodYear} · {r.province}<br/>{r.district} · {value(r.zone)}</small></td><td>{value(r.sp2dOld)} → {value(r.sp2dUpdated)}</td><td>{value(r.bpk)}</td><td>{money(r.initial)}<small>{value(r.statusInitial)}</small></td><td>{money(r.final)}<small>{value(r.statusFinal)}</small></td><td className={r.delta<0?'danger-text':''}>{money(r.delta)}</td><td><ReasonTags row={r}/></td><td><button className="btn secondary" aria-label={`Riwayat ${r.name}`} onClick={()=>setNip(r.nip)}><History size={15}/> Per SDM</button></td></tr>)}{!result.rows.length&&<tr><td colSpan={8} className="empty">Tidak ada data yang cocok. Sesuaikan filter.</td></tr>}</tbody></table></div><div className="pagination"><span>Halaman {result.page+1} dari {Math.max(1,Math.ceil(summary.rows/result.pageSize))}. Rekap mencakup seluruh hasil filter.</span><div><button className="btn secondary" disabled={result.page===0} aria-label="Halaman sebelumnya" onClick={()=>setPage(result.page-1)}><ChevronLeft size={16}/></button><button className="btn secondary" disabled={(result.page+1)*result.pageSize>=summary.rows} aria-label="Halaman berikutnya" onClick={()=>setPage(result.page+1)}><ChevronRight size={16}/></button></div></div></section>
  </>}
  {nip&&<SdmHistory api={api} nip={nip} onClose={()=>setNip(null)}/>}
 </div>
}
