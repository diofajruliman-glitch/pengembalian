import {openSnapshot} from './xlsxSnapshot.js'
import {BANK_SHEETS} from './masterWorkbook.js'
import {readRecap,summarizeBank,finalizePreview} from './snapshotPreview.js'
import {parseNonactive,matchNonactive} from './nonactive.js'
import {summarizeSp2dYears} from './sp2dYears.js'
import {extractSourceMetadata} from './sourceMetadata.js'
self.onmessage=async({data})=>{try{
 const {file,baseline}=data;if(file.size>60*1024*1024||baseline?.size>60*1024*1024)throw Error('Batas file pratinjau 60 MB.')
 const buffer=await file.arrayBuffer();const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(x=>x.toString(16).padStart(2,'0')).join('')
 self.postMessage({type:'progress',text:'Membaca struktur workbook…'})
 const current=openSnapshot(new Uint8Array(buffer)),old=baseline?openSnapshot(new Uint8Array(await baseline.arrayBuffer())):null
 const banks=[],results=[],bankRows={}
 for(const [sheet,bank] of Object.entries(BANK_SHEETS)){self.postMessage({type:'progress',text:'Memeriksa '+bank+'…'});bankRows[sheet]=current.read(sheet);const {summary,result}=summarizeBank(bankRows[sheet],bank,old?old.read(sheet):null);banks.push(summary);results.push(result)}
 const recap=readRecap(current.read('REKAPITULASI')),checks=finalizePreview(results,recap)
 const nonactiveSheet=Object.keys(current.sheets).find(n=>n.trim().toLowerCase()==='master tidak aktif');let nonactive=null,nonactiveReview=[]
 if(nonactiveSheet){const matched=matchNonactive(results,parseNonactive(current.read(nonactiveSheet)));nonactive=matched.summary;nonactiveReview=matched.review;results.splice(0,results.length,...matched.results)}
 const metadata=extractSourceMetadata(results,bankRows,{pensionRows:current.sheets.Sheet1?current.read('Sheet1'):[],nonactiveReview});results.splice(0,results.length,...metadata.results)
 const sp2dYears=summarizeSp2dYears(results)
 self.postMessage({type:'done',snapshot:{fileName:file.name,sha256,results,nonactive,nonactiveReview,sourceMetadata:{summary:metadata.summary,issues:metadata.issues,ntpnReferences:metadata.ntpnReferences}},report:{fileName:file.name,baselineName:baseline?.name||null,sha256,banks,checks,nonactive,nonactiveReview,sourceMetadata:{summary:metadata.summary,issues:metadata.issues},sp2dYears,mode:baseline?'comparison':'initial',writeEnabled:false}})
 }catch(e){self.postMessage({type:'error',message:e.message||'Workbook tidak dapat dibaca.'})}}

