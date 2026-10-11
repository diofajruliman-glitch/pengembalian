export function adjustmentApi(supabase,{local=false}={}){
 async function call(action,payload={},signal){
  if(local){
   const params=new URLSearchParams()
   if(action==='query'){params.set('filters',JSON.stringify(payload.filters||{}));params.set('page',String(payload.page||0))}
   if(action==='history')params.set('nip',payload.nip)
   const response=await fetch(`/__adjustments/${action}?${params}`,{signal,cache:'no-store'})
   const data=await response.json()
   if(!response.ok)throw Error(data.error||'Data tidak dapat dimuat')
   return data
  }
  if(!supabase)throw Error('Koneksi Supabase belum tersedia')
  let request=supabase.rpc('recovery_adjustment_read',{p_action:action,p_payload:payload})
  if(signal)request=request.abortSignal(signal)
  const {data,error}=await request
  if(error)throw Error(error.code==='PGRST202'?'Menu sudah tersedia; tabel lampiran Supabase belum diaktifkan.':error.message)
  return data
 }
 return {manifest:signal=>call('manifest',{},signal),query:(filters,page,signal)=>call('query',{filters,page},signal),history:(nip,signal)=>call('history',{nip},signal)}
}
