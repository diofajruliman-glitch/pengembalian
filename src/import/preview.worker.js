import {openSnapshot} from './xlsxSnapshot.js'
import {BANK_SHEETS} from './masterWorkbook.js'
import {readRecap,summarizeBank,finalizePreview} from './snapshotPreview.js'
self.onmessage=async({data})=>{try{
 const {file,baseline}=data;if(file.size>60*1024*1024||baseline?.size>60*1024*1024)throw Error('Batas file pratinjau 60 MB.')
 const buffer=await file.arrayBuffer();const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(x=>x.toString(16).padStart(2,'0')).join('')
 self.postMessage({type:'progress',text:'Membaca struktur workbook…'})
 const current=openSnapshot(new Uint8Array(buffer)),old=baseline?openSnapshot(new Uint8Array(await baseline.arrayBuffer())):null
 const banks=[],results=[]
 for(const [sheet,bank] of Object.entries(BANK_SHEETS)){self.postMessage({type:'progress',text:'Memeriksa '+bank+'…'});const {summary,result}=summarizeBank(current.read(sheet),bank,old?old.read(sheet):null);banks.push(summary);results.push(result)}
 const recap=readRecap(current.read('REKAPITULASI')),checks=finalizePreview(results,recap)
 self.postMessage({type:'done',snapshot:{fileName:file.name,sha256,results},report:{fileName:file.name,baselineName:baseline?.name||null,sha256,banks,checks,mode:baseline?'comparison':'initial',writeEnabled:false}})
 }catch(e){self.postMessage({type:'error',message:e.message||'Workbook tidak dapat dibaca.'})}}
