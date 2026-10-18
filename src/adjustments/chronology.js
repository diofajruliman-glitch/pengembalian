export const chronologyFilters = year => ({
 initial:{sp2dOld:year,bpk:'TAHAP 1 SEND BPK'},
 retained:{sp2dOld:year,sp2dUpdated:year,bpk:'TAHAP 1 SEND BPK'},
 moved:{sp2dOld:year,sp2dUpdated:year+1,bpk:'TAHAP 1 SEND BPK'},
 correction:{sp2dOld:year,sp2dUpdated:year,bpk:'TAHAP 1 SEND BPK',change:'amount'},
 added:{sp2dUpdated:year,bpk:'BELUM MASUK BPK'},
 total:{sp2dUpdated:year}
})

const abortError=()=>new DOMException('The operation was aborted.','AbortError')
const checkAbort=signal=>{if(signal?.aborted)throw abortError()}

function queryWithAbort(api,filters,signal){
 checkAbort(signal)
 return new Promise((resolve,reject)=>{
  const cleanup=()=>signal?.removeEventListener('abort',onAbort)
  const onAbort=()=>{cleanup();reject(abortError())}
  signal?.addEventListener('abort',onAbort,{once:true})
  let request
  try{request=api.query(filters,0,signal)}catch(error){cleanup();reject(error);return}
  Promise.resolve(request).then(result=>{cleanup();resolve(result)},error=>{cleanup();reject(error)})
 })
}

export async function loadChronology(api,year,signal){
 const filters=chronologyFilters(year),data={}
 // Correction uses the retained totals; its preset is needed only for BNBA links.
 for(const key of ['initial','retained','moved','added','total']){
  const result=await queryWithAbort(api,filters[key],signal)
  checkAbort(signal)
  data[key]={...result.summary,reasonGroups:result.recaps?.reasons,sourcePriorityGroups:result.recaps?.sourcePriority}
 }
 return data
}
