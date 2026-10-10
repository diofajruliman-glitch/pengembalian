import React,{useEffect,useRef,useState} from 'react'
import RecoveryMonitor from './RecoveryMonitor.jsx'
import {loadStoredSnapshot} from '../import/batchTransport.js'
export default function RecoveryWorkspace({client,snapshot,onImport,onMasterLoaded}){
 const production=client?.scope==='production'
 const [mode,setMode]=useState(snapshot?'local':'stored'),[stored,setStored]=useState(null),[loading,setLoading]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
 const request=useRef(0)
 const activeSnapshot=mode==='local'?snapshot:stored
 useEffect(()=>{onMasterLoaded?.(activeSnapshot||null)},[activeSnapshot,onMasterLoaded])
 useEffect(()=>{
  if(!client||mode!=='stored')return
  const id=++request.current;setLoading(true);setError('');setStored(null)
  loadStoredSnapshot(client,(n,total)=>{if(request.current===id)setProgress(`${n.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')} SDM`)}).then(data=>{if(request.current===id)setStored(data)}).catch(e=>{if(request.current===id)setError(e.message||'Gagal memuat data Supabase.')}).finally(()=>{if(request.current===id)setLoading(false)})
  return()=>{request.current++}
 },[client,mode,attempt])
 if(!client)return <RecoveryMonitor snapshot={snapshot} onImport={onImport}/>
 return <><section className="panel"><div className="toolbar"><button className="btn secondary" onClick={()=>setMode('stored')}>{production?'Master produksi tersimpan':'Master tersimpan (pengujian)'}</button><button className="btn secondary" disabled={!snapshot} onClick={()=>setMode('local')}>Snapshot aktif di sesi ini</button><button className="btn secondary" onClick={onImport}>Buka impor Excel</button>{mode==='stored'&&<button className="btn secondary" disabled={loading} onClick={()=>setAttempt(n=>n+1)}>Muat ulang master</button>}</div><p>{production?'Master produksi dibaca dari database. Snapshot aktif sesi ini dapat berasal dari pratinjau Excel atau hasil baca ulang setelah batch tersimpan.':'Data tersimpan berasal dari schema pengujian. Belum menjadi master aplikasi utama.'}</p></section>{mode==='stored'&&loading&&<p role="status">Memuat master dari Supabase… {progress}</p>}{mode==='stored'&&error&&<p className="notice red-notice" role="alert">{error}</p>}{mode==='local'?<RecoveryMonitor key="local" snapshot={snapshot} onImport={onImport}/>:stored&&<RecoveryMonitor key={'stored-'+stored.revision} snapshot={stored} onImport={onImport}/>}</>
}
