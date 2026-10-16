export const followupFields=[['status','Status'],['pic','PIC'],['documentReference','Referensi BAP / dokumen'],['notes','Catatan pemeriksaan'],['decisionNote','Hasil keputusan sesuai dokumen']]
const empty={status:'Belum ditindaklanjuti',pic:'',notes:'',documentReference:'',decisionNote:''}
export const followupValues=value=>Object.fromEntries(followupFields.map(([key])=>[key,value?.[key]??empty[key]]))

// A browser-session timestamp is not a server revision. Pending drafts retain
// their original expectation until the user explicitly reviews a conflict.
export function followupRevision(value,online){
 if(!online)return null
 if(value?.pending)return Object.hasOwn(value,'expectedUpdatedAt')?value.expectedUpdatedAt:null
 return value?.updatedAt||null
}
export function createFollowupDraft(value,online){
 return {draft:followupValues(value),expectedUpdatedAt:followupRevision(value,online),conflict:value?.pendingCode==='DISCIPLINE_FOLLOWUP_CONFLICT',latest:null,error:'',notice:''}
}
export function followupDraftReducer(state,action){
 switch(action.type){
  case 'edit':return {...state,draft:{...state.draft,[action.field]:action.value},notice:''}
  case 'clearError':return {...state,error:'',notice:''}
  case 'failed':return {...state,error:action.error.message,notice:'',...(action.error.code==='DISCIPLINE_FOLLOWUP_CONFLICT'?{conflict:true,latest:null}:{})}
  case 'latest':return {...state,latest:action.latest,error:'',notice:''}
  case 'keepDraft':
   if(!state.latest||state.latest.archived)return state
   return {...state,expectedUpdatedAt:followupRevision(state.latest.value,true),conflict:false,error:'',notice:'Draf Anda dipertahankan. Tekan Simpan untuk mengganti catatan yang baru ditinjau.'}
  case 'useLatest':
   if(!state.latest||state.latest.archived)return state
   return {...state,draft:followupValues(state.latest.value),expectedUpdatedAt:followupRevision(state.latest.value,true),conflict:false,error:'',notice:'Catatan terbaru telah dimuat ke formulir.'}
  case 'saved':return {...state,draft:followupValues(action.value),expectedUpdatedAt:followupRevision(action.value,action.online),conflict:false,latest:null,error:'',notice:''}
  default:return state
 }
}
