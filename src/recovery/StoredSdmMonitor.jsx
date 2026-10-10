import React from 'react'
import RecoveryMonitor from './RecoveryMonitor.jsx'

export default function StoredSdmMonitor({snapshot,loading,error,isAdmin,onMaster}){
 if(!isAdmin)return <section className="panel"><p>Progres seluruh SDM dari master tersedia untuk admin. Daftar kasus khusus mengikuti hak akses akun Anda.</p></section>
 if(loading&&!snapshot)return <p role="status">Memuat progres SDM dari master tersimpan…</p>
 if(!snapshot)return <section className="panel"><h2>Progres SDM dari master</h2><p role={error?'alert':undefined}>{error||'Master tersimpan belum tersedia. Muat melalui Master & Progres.'}</p><button className="btn secondary" onClick={onMaster}>Buka Master & Progres</button></section>
 return <section aria-label="Progres seluruh SDM dari master tersimpan">
  <div className="notice demo-notice">Progres SDM dan Dashboard memakai master tersimpan yang sama. Kasus khusus di bawah digunakan untuk penagihan dan tindak lanjut. Status nonaktif yang belum disimpan tetap perlu direkonsiliasi.</div>
  {error&&<p role="alert" className="notice amber-notice">{error}</p>}
  <RecoveryMonitor key={`${snapshot.scope}-${snapshot.revision}`} snapshot={snapshot} onImport={onMaster} initialWorklist="nonactive"/>
 </section>
}
