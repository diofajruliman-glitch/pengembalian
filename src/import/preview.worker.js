import {openSnapshot} from './xlsxSnapshot.js'
import {BANK_SHEETS} from './masterWorkbook.js'
import {readRecap,summarizeBank,finalizePreview} from './snapshotPreview.js'
import {parseNonactive,matchNonactive} from './nonactive.js'
self.onmessage=async({data})=>{try{
 const {file,baseline}=data;if(file.size>60*1024*1024||baseline?.size>60*1024*1024)throw Error('Batas file pratinjau 60 MB.')
 const buffer=await file.arrayBuffer();const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(x=>x.toString(16).padStart(2,'0')).join('')
 self.postMessage({type:'progress',text:'Membaca struktur workbook…'})
 const current=openSnapshot(new Uint8Array(buffer)),old=baseline?openSnapshot(new Uint8Array(await baseline.arrayBuffer())):null
 const banks=[],results=[]
 for(const [sheet,bank] of Object.entries(BANK_SHEETS)){self.postMessage({type:'progress',text:'Memeriksa '+bank+'…'});const {summary,result}=summarizeBank(current.read(sheet),bank,old?old.read(sheet):null);banks.push(summary);results.push(result)}
 const recap=readRecap(current.read('REKAPITULASI')),checks=finalizePreview(results,recap)
 const nonactiveSheet=Object.keys(current.sheets).find(n=>n.trim().toLowerCase()==='master tidak aktif');let nonactive=null
 if(nonactiveSheet){const matched=matchNonactive(results,parseNonactive(current.read(nonactiveSheet)));nonactive=matched.summary;results.splice(0,results.length,...matched.results)}
 self.postMessage({type:'done',snapshot:{fileName:file.name,sha256,results,nonactive},report:{fileName:file.name,baselineName:baseline?.name||null,sha256,banks,checks,nonactive,mode:baseline?'comparison':'initial',writeEnabled:false}})
 }catch(e){self.postMessage({type:'error',message:e.message||'Workbook tidak dapat dibaca.'})}}
