export const FOCUSED_ASSESSMENTS=Object.freeze(['Terbukti','Tidak Terbukti'])
export const MISSING_DETAILS_LABEL='Rincian transaksi belum tersedia'
export const PAIRING_CATEGORY_REFERENCE_STATUS='Kategori acuan Hasil pairing; rincian periode belum tersedia'
export const TRANSACTION_AVAILABILITY_LABELS=Object.freeze({
 available:'Rincian tersedia',
 missing:MISSING_DETAILS_LABEL,
 none:'Tidak ada transaksi pada sumber',
 unrecorded:'Kelengkapan belum dicatat pada versi ini'
})

export const isFocusedAssessment=row=>FOCUSED_ASSESSMENTS.includes(row?.hasilPenilaian)

export function getTransactionAvailability(row){
 if(row?.missingTransactionDetails===true||row?.before?.kategori===MISSING_DETAILS_LABEL||row?.after?.kategori===MISSING_DETAILS_LABEL)return 'missing'
 if(Number.isInteger(row?.sourceTransactionCount)&&row.sourceTransactionCount>=0)return row.sourceTransactionCount>0?'available':'none'
 // A previous snapshot with zero results may have used a narrower date range.
 // Do not infer missing source data or a genuine zero from that snapshot.
 if(row?.before?.frekuensi>0||row?.after?.frekuensi>0)return 'available'
 return 'unrecorded'
}

export function hasPairingCategoryReference(row){
 return row?.categoryFromPairing===true&&getTransactionAvailability(row)==='missing'&&
  ['Ringan','Sedang','Berat'].includes(row?.historical?.kategori)&&row.historical.status!=='Perlu validasi'
}

export function filterDisciplineRows(rows,{assessment='',category='',period='after',search='',availability=''}={}){
 const query=search.trim().toLowerCase()
 return rows.filter(row=>isFocusedAssessment(row)&&
  (!assessment||row.hasilPenilaian===assessment)&&
  (!category||row[period]?.kategori===category)&&
  (!availability||getTransactionAvailability(row)===availability)&&
  (!query||`${row.nama??''} ${row.nik??''} ${row.nip??''}`.toLowerCase().includes(query)))
}
