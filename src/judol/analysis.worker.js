import {analyzeDiscipline,parseDisciplineWorkbook} from './analysis.js'

self.onmessage=({data})=>{
 const {id,action,rules}=data
 try{
  if(action==='import'){
   const source=parseDisciplineWorkbook(data.bytes)
   self.postMessage({id,source,result:analyzeDiscipline(source,rules)})
  }else if(action==='analyze')self.postMessage({id,result:analyzeDiscipline(data.source,rules)})
  else throw Error('Tindakan analisis tidak dikenali.')
 }catch(error){self.postMessage({id,error:error instanceof Error?error.message:'Analisis gagal.'})}
}
