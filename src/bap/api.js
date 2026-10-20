export async function listCases(client){
 const rows=[]
 for(let offset=0;;offset+=500){
  const {data,error}=await client.from('interview_cases').select('*').order('scheduled_date').order('scheduled_time').order('nik').range(offset,offset+499)
  if(error)throw error
  rows.push(...data);if(data.length<500)break
 }
 return rows
}
export async function act(client,row,action,payload={}){
 const {data,error}=await client.rpc('interview_action',{p_nik:row.nik,p_action:action,p_revision:row.revision,p_payload:payload})
 if(error)throw error
 return data
}
