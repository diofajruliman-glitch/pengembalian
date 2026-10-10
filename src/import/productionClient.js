const project='https://tagokvlsirebfgltbxmq.supabase.co'
export function productionMasterClient(client,mode,url){
 if(!client||mode!=='production-master')return null
 try{if(new URL(url).origin!==project)return null}catch{return null}
 const allowed=new Set(['recovery_begin','recovery_append','recovery_validate','recovery_diff','recovery_commit','recovery_read_meta','recovery_read_page','case_prepare','case_commit','recovery_linked_meta','recovery_linked_cases'])
 return {scope:'production',masterLabel:'Master produksi tersimpan',rpc:(name,args={})=>{
  if(!allowed.has(name))throw Error('Operasi master tidak diizinkan.')
  return client.rpc('recovery_master_rpc',{p_action:name,p_payload:args})
 }}
}
