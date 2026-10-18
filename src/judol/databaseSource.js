// Operational modules read a fresh database response for the selected saved
// version. A local analysis or a cached object cannot certify its own source.
export function activeDatasetId(snapshot){
 if(snapshot?.kind!=='analysis'||!Number.isInteger(snapshot.active))return null
 const id=snapshot.versions?.[snapshot.active]?.id
 return typeof id==='string'&&id.trim()?id:null
}

export async function loadDatabaseDisciplineSnapshot(storage,id){
 if(!storage||!id)throw Error('Pilih versi Kategorisasi Disiplin ASN yang sudah tersimpan di database.')
 const data=await storage.loadDataset(id)
 if(data?.id!==id||!Array.isArray(data.result?.rows))throw Error('Sumber Kategorisasi Disiplin ASN dari database tidak valid. Muat ulang dataset.')
 const followups=await storage.loadFollowups(id).catch(()=>[])
 return {kind:'analysis',name:data.name,filename:data.filename,source:null,active:0,versions:[{
  id:data.id,number:data.version,createdAt:data.createdAt,status:data.status,
  result:data.result,followups,auditEvents:data.auditEvents||[]
 }]}
}

export function operationalDisciplineSnapshot({online,accountId,selectedSnapshot,verified}){
 if(!online)return selectedSnapshot
 const id=activeDatasetId(selectedSnapshot)
 if(!accountId||!id||verified?.accountId!==accountId||verified.datasetId!==id)return null
 return activeDatasetId(verified.snapshot)===id?verified.snapshot:null
}
