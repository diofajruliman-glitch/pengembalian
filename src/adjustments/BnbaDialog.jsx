import React,{useEffect,useRef,useState} from 'react'
import {X} from 'lucide-react'
import {REASONS,primaryReason} from './model.js'
import {collectFilteredRows,saveAdjustmentExcel} from './export.js'

const money=n=>n==null?'Kosong':'Rp '+Number(n).toLocaleString('id-ID',{maximumFractionDigits:2})
export default function BnbaDialog({api,selection,onClose,onHistory,suspended=false}){
 const [page,setPage]=useState(0),[result,setResult]=useState(null),[error,setError]=useState(''),[progress,setProgress]=useState(null)
 const close=useRef(null),exportRequest=useRef(null)
 useEffect(()=>{const previous=document.activeElement;close.current?.focus();return()=>{exportRequest.current?.abort();previous?.focus?.()}},[])
 useEffect(()=>{const request=new AbortController();setResult(null);setError('');api.query(selection.filters,page,request.signal).then(setResult).catch(e=>{if(e.name!=='AbortError')setError(e.message)});return()=>request.abort()},[api,selection,page])
 async function exportRows(){
  const request=new AbortController();exportRequest.current=request;setProgress('Menyiapkan…');setError('')
  try{const rows=await collectFilteredRows(api,selection.filters,request.signal,(done,total)=>setProgress(`${done.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')} data`));await saveAdjustmentExcel(rows,selection.filters,'detail-workbook-bnba.xlsx')}
  catch(e){if(e.name!=='AbortError')setError(e.message)}finally{setProgress(null);exportRequest.current=null}
 }
 function keys(e){
  if(e.key==='Escape')onClose()
  if(e.key==='Tab'){const controls=[...e.currentTarget.querySelectorAll('button')].filter(x=>!x.disabled);if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus()}else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus()}}
 }
 const summary=result?.summary
 return <div className="modal-mask" style={suspended?{display:'none'}:undefined} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal adjustment-dialog" role="dialog" aria-modal="true" aria-labelledby="bnba-dialog-title" onKeyDown={keys}>
  <div className="modal-top"><div><h3 id="bnba-dialog-title">Detail workbook · BNBA</h3><p>{selection.label||'Rincian sesuai pilihan'}</p></div><button className="icon-btn" ref={close} aria-label="Tutup detail BNBA" onClick={onClose}><X size={20}/></button></div>
  <div className="modal-main">{error&&<p role="alert" className="notice red-notice">{error}</p>}{!result&&!error&&<p role="status">Memuat BNBA…</p>}
   {result&&<><div className="table-scroll"><table><thead><tr><th>SDM / periode</th><th>SP2D lama → update</th><th>SEND BPK</th><th>Awal</th><th>Final</th><th>Selisih</th><th>Alasan utama</th><th>Riwayat</th></tr></thead><tbody>{result.rows.map(r=><tr key={r.sourceRow}><td><b>{r.name}</b><span className="mono">{r.nip}</span><small>{r.month} {r.periodYear}</small></td><td>{r.sp2dOld??'Kosong'} → {r.sp2dUpdated??'Kosong'}</td><td>{r.bpk??'Kosong'}</td><td>{money(r.initial)}</td><td>{money(r.final)}</td><td>{money(r.delta)}</td><td>{REASONS[primaryReason(r)]|| (r.delta===null?'Nominal belum lengkap':'Tidak berubah nominal')}</td><td><button className="btn secondary" onClick={()=>onHistory(r.nip)}>Per SDM</button></td></tr>)}{!result.rows.length&&<tr><td colSpan={8}>Tidak ada data sesuai pilihan.</td></tr>}</tbody></table></div>
   <div className="pagination"><span>Halaman {result.page+1} / {Math.max(1,Math.ceil(summary.rows/result.pageSize))}</span><div><button className="btn secondary" disabled={result.page===0} onClick={()=>setPage(result.page-1)}>Sebelumnya</button><button className="btn secondary" disabled={(result.page+1)*result.pageSize>=summary.rows} onClick={()=>setPage(result.page+1)}>Berikutnya</button></div></div>
   <section className="panel"><h3>Total seluruh BNBA dalam pilihan</h3><p>{summary.rows.toLocaleString('id-ID')} data · {summary.people.toLocaleString('id-ID')} SDM unik</p><p>Awal: <b>{money(summary.initial)}</b><br/>Final: <b>{money(summary.final)}</b><br/>Selisih final − awal: <b>{money(summary.delta)}</b></p><small>Nilai kosong: awal {summary.missingInitial}, final {summary.missingFinal}, selisih {summary.missingDelta}. Total mencakup seluruh halaman; nilai kosong tidak dihitung.</small><p><button className="btn primary" disabled={!!progress} onClick={exportRows}>Ekspor Excel seluruh BNBA pilihan</button></p>{progress&&<><p role="status">{progress}</p><button className="btn secondary" onClick={()=>exportRequest.current?.abort()}>Batalkan ekspor</button></>}</section>
   </>}
  </div>
 </div></div>
}
