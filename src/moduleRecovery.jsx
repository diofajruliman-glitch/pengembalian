import React from 'react'

export function isModuleLoadError(error){
 return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(error?.message||'')
}

export function ModuleReloadNotice(){
 return <section className="panel" role="alert" aria-label="Muat ulang portal BAP">
  <h2>Portal BAP belum dapat dimuat</h2>
  <p>Aplikasi telah diperbarui atau koneksi terputus. Muat ulang aplikasi untuk membuka portal BAP kembali.</p>
  <button className="btn primary" onClick={()=>window.location.reload()}>Muat ulang aplikasi</button>
 </section>
}

// Resolve a real component for React.lazy instead of leaving a rejected import
// to unmount the app. This fallback is shown before the BAP editor is mounted.
// Never reload automatically: a user may have unsaved work elsewhere.
export async function loadModuleWithRecovery(load){
 try{return await load()}catch(error){
  if(!isModuleLoadError(error))throw error
  return {default:ModuleReloadNotice}
 }
}
