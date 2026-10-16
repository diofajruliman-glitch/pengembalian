// This client uses an isolated RPC. It never writes to recovery or profile tables.
export const followupStatuses=['Belum ditindaklanjuti','Dalam pemeriksaan','Menunggu dokumen','Selesai']

const errors={
 DISCIPLINE_FORBIDDEN:'Akun ini tidak memiliki hak untuk tindakan tersebut.',
 DISCIPLINE_NOT_FOUND:'Dataset tidak ditemukan. Muat ulang daftar dataset.',
 DISCIPLINE_ARCHIVED:'Dataset telah diarsipkan dan hanya dapat dibaca.',
 DISCIPLINE_INVALID_RESULT:'Hasil analisis tidak valid atau terlalu besar. Impor ulang workbook sumber.',
 DISCIPLINE_INVALID_INPUT:'Isian dataset atau tindak lanjut tidak valid.',
 DISCIPLINE_UNKNOWN_NIK:'NIK tidak ditemukan di dataset yang dipilih.',
 DISCIPLINE_REQUEST_CONFLICT:'Permintaan penyimpanan ini sudah dipakai untuk hasil yang berbeda. Muat ulang dataset sebelum mencoba kembali.',
 DISCIPLINE_FOLLOWUP_CONFLICT:'Catatan tindak lanjut sudah berubah sejak dibuka. Muat catatan terbaru dan periksa kembali perubahan Anda sebelum menyimpan.'
}
const editableFollowup=['status','pic','notes','documentReference','decisionNote']
const followupPatch=patch=>patch&&typeof patch==='object'&&!Array.isArray(patch)?Object.fromEntries(editableFollowup.filter(key=>Object.hasOwn(patch,key)).map(key=>[key,patch[key]])):patch

function storageError(error){
 const detail=String(error?.message||error||'')
 const code=Object.keys(errors).find(key=>detail.includes(key))
 const missing=['PGRST202','42883','42P01'].includes(error?.code)||/Could not find the function.*discipline_rpc|function.*discipline_rpc.*does not exist|relation.*discipline_.*does not exist/i.test(detail)
 const friendly=new Error(missing?'Penyimpanan Kategorisasi Disiplin ASN belum diaktifkan. Jalankan migrasi khusus modul terlebih dahulu.':errors[code]||'Penyimpanan modul belum berhasil. Periksa koneksi dan coba kembali.')
 friendly.code=missing?'DISCIPLINE_NOT_READY':code||error?.code||'DISCIPLINE_STORAGE_ERROR'
 return friendly
}

export function disciplineStorage(supabase){
 if(!supabase?.rpc)return null
 const call=async(action,payload={})=>{
  let response
  try{response=await supabase.rpc('discipline_rpc',{p_action:action,p_payload:payload})}
  catch(error){throw storageError(error)}
  if(response.error)throw storageError(response.error)
  return response.data
 }
 return {
  listDatasets:()=>call('list'),
  loadDataset:id=>call('load',{id}),
  saveVersion:({name,filename,result,parentId=null,requestId})=>call('save_version',{name,filename:String(filename||'').split(/[\\/]/).at(-1),result,parentId,...(requestId===undefined?{}:{requestId})}),
  archiveDataset:id=>call('archive',{id}),
  deleteDataset:id=>call('delete',{id}),
  saveFollowup:input=>call('save_followup',{datasetId:input.datasetId,nik:input.nik,patch:followupPatch(input.patch),...(Object.hasOwn(input,'expectedUpdatedAt')?{expectedUpdatedAt:input.expectedUpdatedAt}:{})}),
  loadFollowups:datasetId=>call('followups',{datasetId})
 }
}
