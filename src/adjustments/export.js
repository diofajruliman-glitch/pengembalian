import {aggregate,primaryReason,REASONS} from './model.js'
const labels={...REASONS,UNCHANGED:'Tidak berubah nominal',MISSING:'Nominal belum lengkap'}

export function latestHistoryRows(rows,activeImportId){
 const versions=rows.map(r=>Number(r.importId||0))
 const latest=activeImportId??Math.max(0,...versions)
 return rows.filter(r=>Number(r.importId||0)===latest)
}
export function reasonBasis(row){
 const key=primaryReason(row)
 if(!row.changed)return 'Tidak berubah / nominal belum lengkap'
 return row.evidence?.find(e=>e.reason===key)?.origin==='keterangan sumber'||(key==='TENDIK'&&/\bTENDIK\b/i.test(row.note))?'Keterangan workbook':'Penyesuaian otomatis'
}
export function adjustmentExport(rows,filters){
 const people=new Map()
 for(const r of rows){if(!people.has(r.nip))people.set(r.nip,[]);people.get(r.nip).push(r)}
 const detail=[['NIP','Nama','Tahun periode','Bulan','SP2D lama','SP2D update','SEND BPK','Awal (Rp)','Final (Rp)','Selisih (Rp)','Status awal','Status final','Alasan utama','Alasan tambahan','Dasar alasan','Provinsi','Kabupaten','Zona wilayah','Baris sumber'],...rows.map(r=>[r.nip,r.name,r.periodYear,r.month,r.sp2dOld,r.sp2dUpdated,r.bpk,r.initial,r.final,r.delta,r.statusInitial,r.statusFinal,labels[primaryReason(r)]||primaryReason(r),r.reasons.filter(k=>k!==primaryReason(r)).map(k=>REASONS[k]||k).join('; '),reasonBasis(r),r.province,r.district,r.zone,r.sourceRow])]
 const summary=[['NIP','Nama','Jumlah data','Awal (Rp)','Final (Rp)','Selisih (Rp)','Awal kosong','Final kosong','Selisih kosong'],...[...people].map(([nip,items])=>{const s=aggregate(items);return [nip,items[0].name,s.rows,s.initial,s.final,s.delta,s.missingInitial,s.missingFinal,s.missingDelta]})]
 const context=[['Keterangan','Nilai'],['Cakupan','Seluruh hasil filter, bukan hanya halaman tabel'],['Nilai kosong','Sel kosong; total hanya menjumlahkan nilai tersedia'],['NIP','Teks, termasuk nol di awal'],...Object.entries(filters).filter(([,v])=>v!=='').map(([k,v])=>[k,v])]
 return {detail,summary,context}
}
export async function collectFilteredRows(api,filters,signal,onProgress=()=>{}){
 const before=await api.manifest(signal),first=await api.query(filters,0,signal)
 const rows=[...first.rows],pages=Math.ceil(first.summary.rows/first.pageSize)
 onProgress(rows.length,first.summary.rows)
 for(let page=1;page<pages;page++){
  if(signal?.aborted)throw new DOMException('Dibatalkan','AbortError')
  const batch=await api.query(filters,page,signal)
  if(batch.page!==page||batch.summary.rows!==first.summary.rows)throw Error('Data berubah saat ekspor. Muat ulang dan ulangi ekspor.')
  rows.push(...batch.rows);onProgress(rows.length,first.summary.rows)
 }
 const after=await api.manifest(signal)
 const totals=aggregate(rows)
 if(before.sha256!==after.sha256||before.preparedAt!==after.preparedAt||before.importId!==after.importId||rows.length!==first.summary.rows||new Set(rows.map(r=>r.sourceRow)).size!==rows.length||['initial','final','delta'].some(k=>Math.abs(totals[k]-first.summary[k])>0.01))throw Error('Versi data berubah atau hasil tidak lengkap. Ulangi ekspor.')
 return rows
}
export async function saveAdjustmentExcel(rows,filters,fileName){
 const {default:write}=await import('write-excel-file/browser'),tables=adjustmentExport(rows,filters)
 const cells=table=>table.map((row,i)=>row.map(v=>({value:v??'',type:typeof v==='number'?Number:String,...(i===0?{fontWeight:'bold',backgroundColor:'#E7F0FF'}:{})})))
 await write([{sheet:'Ringkasan SDM',data:cells(tables.summary)},{sheet:'BNBA bulanan',data:cells(tables.detail)},{sheet:'Cakupan filter',data:cells(tables.context)}]).toFile(fileName)
}
