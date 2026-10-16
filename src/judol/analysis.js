import {openSnapshot} from '../import/xlsxSnapshot.js'

export const DISCIPLINE_CATEGORIES=Object.freeze(['Berat','Sedang','Ringan','Perlu validasi','Tidak ada transaksi','Rincian transaksi belum tersedia'])

// Only the component weights are stated by the supplied nota dinas. Other
// defaults reconstruct the historical sheet and remain editable assumptions.
export const DEFAULT_RULES=Object.freeze({
 start:'2025-01-01',cutoff:'2025-10-01',end:'2025-12-31',
 workStart:'07:30',workEnd:'16:00',fridayEnd:'16:30',
 frequencyMedium:9,frequencyHigh:28,depositMedium:605000,depositHigh:2545000,
 categoryMedium:34,categoryHigh:46,weightFrequency:60,weightDeposit:30,weightTime:10,
 baseLow:20,baseMedium:30,baseHigh:50,timeOutside:30,timeInside:70,tiePolicy:'inside',compactTime:true,missingTimePolicy:'pairing',
 provenance:Object.freeze([
  'Acuan Nodin Sekjen Nomor 3513: bobot frekuensi 60%, deposit 30%, waktu aktivitas 10%; hasil merupakan bahan pertimbangan awal proses disiplin.',
  'Batas frekuensi, nilai dasar, dan perlakuan seri mengikuti pola Hasil pairing; batas deposit dan kategori akhir merupakan rekonstruksi, bukan batas resmi yang tertulis dalam nota dinas.',
  'Periode dan jam kerja merupakan asumsi analisis; kalender libur, shift, zona waktu sumber, serta tanggal mulai ASN per orang belum dikonfirmasi.',
  'Asumsi format jam: angka HHMMSS 1–6 digit dipenuhi nol di depan. Interpretasi jam pendek dapat dinonaktifkan.',
  'Kebijakan jam bertanda - dapat menggunakan kategori waktu Hasil pairing berdasarkan NIK yang sama; ini asumsi klasifikasi waktu, bukan pemulihan jam asli. Kategori akhir tetap dihitung per periode dengan parameter aktif.',
  'Jika aktivitas tercatat pada Hasil pairing tetapi rincian transaksi master tidak tersedia, kategori akhir asli Hasil pairing ditampilkan sebagai acuan keseluruhan pada kedua kolom periode. Acuan ini bukan hasil kategorisasi sebelum/sesudah ASN dan tidak digunakan untuk mengisi angka periode.'
 ])
})
const validNik=v=>typeof v==='string'&&/^\d{16}$/.test(v)
const text=v=>String(v??'').trim()
const normalized=v=>text(v).replace(/\s+/g,' ').toUpperCase()
const hasValue=v=>v!==undefined&&v!==null&&v!==''
const audit=(type,nik,message,row=null)=>({type,nik:nik||null,message,row})
const DAY=86400000
function isoDate(year,month,day){
 if(year<1900||year>2100||month<1||month>12||day<1||day>31)return null
 const value=new Date(Date.UTC(year,month-1,day))
 if(value.getUTCFullYear()!==year||value.getUTCMonth()!==month-1||value.getUTCDate()!==day)return null
 return value.toISOString().slice(0,10)
}
function parseDate(v){
 if(typeof v==='number'&&Number.isFinite(v)&&v>=1&&v<73416){
  const value=new Date(Date.UTC(1899,11,30)+Math.floor(v)*DAY)
  return isoDate(value.getUTCFullYear(),value.getUTCMonth()+1,value.getUTCDate())
 }
 if(typeof v!=='string')return null
 let m=v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
 if(m)return isoDate(+m[1],+m[2],+m[3])
 m=v.trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
 return m?isoDate(+m[3],+m[2],+m[1]):null
}
function parseTime(v,compactTime=false){
 if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<1){const seconds=Math.round(v*86400);return seconds<86400?seconds:null}
 if(typeof v==='number'&&compactTime&&Number.isInteger(v)&&v>=0&&v<=235959)v=String(v)
 if(typeof v!=='string')return null
 // Padding short numeric strings follows the supplied ZIP's explicit HHMMSS
 // assumption. Raw values remain available so disabling it recomputes the audit.
 const compact=(compactTime?/^\d{1,6}$/:/^\d{6}$/).test(v.trim())
 const value=compact?v.trim().padStart(6,'0').replace(/^(\d{2})(\d{2})(\d{2})$/,'$1:$2:$3'):v.trim()
 const m=value.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/)
 if(!m||+m[1]>23||+m[2]>59||+(m[3]||0)>59)return null
 return +m[1]*3600+ +m[2]*60+ +(m[3]||0)
}
function parseAmount(v){
 if(typeof v==='number')return Number.isFinite(v)&&v>=0?v:null
 if(typeof v!=='string')return null
 const value=v.trim().replace(/^Rp\s*/i,'')
 if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value))return null
 const amount=Number(value.replaceAll('.','').replace(',','.'))
 return Number.isFinite(amount)&&amount>=0?amount:null
}
function finiteNonnegative(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0}
export function validateRules(input=DEFAULT_RULES){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Parameter penilaian harus berupa objek.')
 const rules={...DEFAULT_RULES,...input,provenance:[...DEFAULT_RULES.provenance]}
 for(const key of ['start','cutoff','end'])if(typeof rules[key]!=='string'||parseDate(rules[key])!==rules[key])throw Error(`Tanggal parameter ${key} harus YYYY-MM-DD yang valid.`)
 if(!(rules.start<rules.cutoff&&rules.cutoff<=rules.end))throw Error('Periode harus memenuhi awal < batas ASN ≤ akhir.')
 for(const key of ['workStart','workEnd','fridayEnd'])if(parseTime(rules[key])===null)throw Error(`Jam parameter ${key} tidak valid.`)
 if(parseTime(rules.workStart)>=parseTime(rules.workEnd)||parseTime(rules.workStart)>=parseTime(rules.fridayEnd))throw Error('Jam mulai harus lebih awal dari jam selesai kerja.')
 for(const key of ['frequencyMedium','frequencyHigh','depositMedium','depositHigh','categoryMedium','categoryHigh','weightFrequency','weightDeposit','weightTime','baseLow','baseMedium','baseHigh','timeOutside','timeInside'])if(!finiteNonnegative(rules[key]))throw Error(`Parameter ${key} harus angka hingga dan tidak negatif.`)
 if(!Number.isInteger(rules.frequencyMedium)||!Number.isInteger(rules.frequencyHigh)||rules.frequencyMedium<1||rules.frequencyMedium>=rules.frequencyHigh)throw Error('Batas frekuensi harus bilangan bulat positif yang meningkat.')
 if(rules.depositMedium>=rules.depositHigh||rules.categoryMedium>=rules.categoryHigh)throw Error('Batas deposit dan kategori harus meningkat.')
 if(rules.baseLow>=rules.baseMedium||rules.baseMedium>=rules.baseHigh||rules.baseHigh>100||rules.timeOutside>100||rules.timeInside>100)throw Error('Nilai dasar harus meningkat dan berada pada rentang 0–100.')
 if(Math.abs(rules.weightFrequency+rules.weightDeposit+rules.weightTime-100)>0.000001)throw Error('Jumlah bobot frekuensi, deposit, dan waktu wajib 100%.')
 if(!['inside','outside','validate'].includes(rules.tiePolicy))throw Error('Perlakuan seri harus inside, outside, atau validate.')
 if(typeof rules.compactTime!=='boolean')throw Error('Asumsi format jam compactTime harus true atau false.')
 if(!['pairing','validate'].includes(rules.missingTimePolicy))throw Error('Perlakuan jam - harus pairing atau validate.')
 return rules
}

export function parseDisciplineWorkbook(bytes){
 const book=openSnapshot(bytes,{normalizeNamespaces:true})
 for(const sheet of ['Data Olah','Hasil pairing','data transaksi 2025'])if(!book.sheets[sheet])throw Error(`Workbook final harus memuat sheet ${sheet}.`)
 const people=[],history={},transactions=[],audits=[]
 const data=book.read('Data Olah'),header=data.findIndex(r=>normalized(r[2])==='NIK'&&normalized(r[19])==='HASIL PENILAIAN')
 if(header<0)throw Error('Data Olah harus memiliki NIK di kolom C dan HASIL PENILAIAN di kolom T.')
 const peopleIds=new Set()
 for(let i=header+1;i<data.length;i++){
  const r=data[i],status=normalized(r[19]);if(!hasValue(r[2])){
   if(['TERBUKTI','TIDAK TERBUKTI'].includes(status))throw Error(`Data Olah baris ${i+1}: hasil penilaian tanpa NIK.`)
   continue
  }
  if(!validNik(r[2]))throw Error(`Data Olah baris ${i+1}: NIK wajib berupa teks 16 digit; NIK angka tidak dapat dipulihkan presisinya.`)
  if(peopleIds.has(r[2]))throw Error(`Data Olah baris ${i+1}: NIK duplikat.`)
  if(!['TERBUKTI','TIDAK TERBUKTI','PILIH',''].includes(status))throw Error(`Data Olah baris ${i+1}: HASIL PENILAIAN tidak dikenali.`)
  if(!text(r[5]))throw Error(`Data Olah baris ${i+1}: nama ASN kosong.`)
  peopleIds.add(r[2]);people.push({nik:r[2],nama:text(r[5]),nip:typeof r[1]==='string'?r[1]:'',hasilPenilaian:status==='TERBUKTI'?'Terbukti':status==='TIDAK TERBUKTI'?'Tidak Terbukti':'Belum ditetapkan',hasilAsli:text(r[19]),keterangan:text(r[20]),baris:i+1})
  if(hasValue(r[1])&&typeof r[1]!=='string')audits.push(audit('nip-numeric',r[2],'NIP numerik tidak digunakan karena berisiko kehilangan presisi.',i+1))
 }
 if(!people.length)throw Error('Tidak ada SDM pada Data Olah.')
 const paired=book.read('Hasil pairing'),pairHeader=paired.findIndex(r=>normalized(r[1])==='NIK'&&normalized(r[18])==='TOTAL NILAI')
 if(pairHeader<0)throw Error('Header sheet Hasil pairing tidak sesuai workbook final.')
 const duplicateHistory=new Set();let historyCount=0
 for(let i=pairHeader+1;i<paired.length;i++){
  const r=paired[i];if(!hasValue(r[1]))continue
  if(!validNik(r[1]))throw Error(`Hasil pairing baris ${i+1}: NIK wajib berupa teks 16 digit.`)
  historyCount++
  if(Object.hasOwn(history,r[1])){duplicateHistory.add(r[1]);history[r[1]]=null;audits.push(audit('duplicate-history',r[1],'NIK berulang pada Hasil pairing; hasil asli tidak dipilih secara otomatis.',i+1));continue}
  const entry={frekuensi:r[5],nominal:parseAmount(r[6]),dalam:r[7],luar:r[8],unknown:0,total:r[18],kategori:text(r[19]),scoreFrequency:r[11],scoreDeposit:r[14],scoreTime:r[17],categoryFrequency:text(r[9]),categoryDeposit:text(r[12]),categoryTime:text(r[15]),weightFrequency:r[10],weightDeposit:r[13],weightTime:r[16],sourceRow:i+1,status:'Sumber asli Sekjen',invalidDates:0,invalidAmounts:0,invalidDuplicates:0}
  if(!['frekuensi','dalam','luar'].every(k=>Number.isInteger(entry[k])&&entry[k]>=0)||!['nominal','total','scoreFrequency','scoreDeposit','scoreTime'].every(k=>finiteNonnegative(entry[k]))||!['Ringan','Sedang','Berat'].includes(entry.kategori)){
   audits.push(audit('invalid-history',r[1],'Angka atau kategori Hasil pairing tidak lengkap/valid; periksa sumber asli.',i+1));entry.status='Perlu validasi'
  }else if(Math.abs(entry.total-entry.scoreFrequency-entry.scoreDeposit-entry.scoreTime)>0.000001)audits.push(audit('history-score-mismatch',r[1],'Total nilai sumber berbeda dari jumlah tiga komponen.',i+1))
  history[r[1]]=entry
 }
 for(const nik of duplicateHistory)history[nik]=null
 for(const [nik,value] of Object.entries(history))if(!peopleIds.has(nik))audits.push(audit('unmatched-history',nik,'Hasil pairing tidak memiliki pasangan pada Data Olah; tidak dimasukkan ke daftar SDM.',value?.sourceRow??null))
 const raw=book.read('data transaksi 2025'),txHeader=raw.findIndex(r=>normalized(r[1])==='NIK'&&normalized(r[6])==='TANGGAL'&&normalized(r[7])==='JAM'&&normalized(r[8])==='NOMINAL_RP')
 if(txHeader<0)throw Error('Sheet data transaksi 2025 harus memiliki NIK, TANGGAL, JAM, NOMINAL_RP pada kolom B/G/H/I.')
 const sourceIds=new Map()
 for(let i=txHeader+1;i<raw.length;i++){
  const r=raw[i];if(!r.some(hasValue))continue
  if(!validNik(r[1]))throw Error(`data transaksi 2025 baris ${i+1}: NIK wajib berupa teks 16 digit; perbaiki sumber sebelum menghitung.`)
  const tx={nik:r[1],date:parseDate(r[6]),time:parseTime(r[7],DEFAULT_RULES.compactTime),timeRaw:r[7]??null,amount:parseAmount(r[8]),row:i+1,duplicate:false,identityConflict:false}
  if(!tx.date)audits.push(audit('invalid-date',tx.nik,'Tanggal transaksi tidak valid; kedua periode perlu validasi.',i+1))
  if(tx.time===null)audits.push(audit('invalid-time',tx.nik,'Jam transaksi tidak valid/tidak tersedia.',i+1))
  if(tx.amount===null)audits.push(audit('invalid-amount',tx.nik,'Nominal transaksi tidak valid; total nominal hanya mencakup nilai yang terbaca.',i+1))
  if(hasValue(r[10])&&(!validNik(r[10])||r[10]!==r[1])){tx.identityConflict=true;audits.push(audit('identity-conflict',tx.nik,'NIK kolom B berbeda dari NIK_PEMAIN kolom K; pairing perlu validasi.',i+1))}
  if(hasValue(r[0])){
   const id=String(r[0]);if(sourceIds.has(id)){const previous=sourceIds.get(id);previous.duplicate=true;tx.duplicate=true;audits.push(audit('duplicate-transaction',tx.nik,`Nomor transaksi sumber berulang (baris ${previous.row} dan ${i+1}); tidak dihapus otomatis.`,i+1))}else sourceIds.set(id,tx)
  }
  transactions.push(tx)
 }
 if(!transactions.length)throw Error('Sheet data transaksi 2025 tidak memiliki transaksi; periksa kelengkapan sumber.')
 return {people,history,transactions,audits,metadata:{sheets:['Data Olah','Hasil pairing','data transaksi 2025'],peopleCount:people.length,historyCount,transactionCount:transactions.length}}
}

const emptyPeriod=()=>({frekuensi:0,nominal:0,dalam:0,luar:0,unknown:0,timeFromPairing:0,timeFromPairingInside:0,timeFromPairingOutside:0,total:null,kategori:'Tidak ada transaksi',scoreFrequency:null,scoreDeposit:null,scoreTime:null,categoryFrequency:'',categoryDeposit:'',categoryTime:'',status:'Tidak ada transaksi',invalidDates:0,invalidAmounts:0,invalidDuplicates:0,identityConflicts:0})
function unavailablePeriod(referenceCategory=null){
 const period=emptyPeriod()
 for(const key of Object.keys(period))if(typeof period[key]==='number')period[key]=null
 period.kategori=referenceCategory||'Rincian transaksi belum tersedia'
 period.status=referenceCategory?'Kategori acuan Hasil pairing; rincian periode belum tersedia':'Rincian transaksi belum tersedia'
 return period
}
const rounded=n=>Math.round(n*1000000)/1000000
function classifyPeriod(p,rules){
 if(p.frekuensi){
  p.categoryFrequency=p.frekuensi>=rules.frequencyHigh?'Tinggi':p.frekuensi>=rules.frequencyMedium?'Sedang':'Rendah'
  p.categoryDeposit=p.nominal>=rules.depositHigh?'Tinggi':p.nominal>=rules.depositMedium?'Sedang':'Rendah'
  const base=c=>c==='Tinggi'?rules.baseHigh:c==='Sedang'?rules.baseMedium:rules.baseLow
  p.scoreFrequency=rounded(base(p.categoryFrequency)*rules.weightFrequency/100)
  p.scoreDeposit=p.invalidAmounts?null:rounded(base(p.categoryDeposit)*rules.weightDeposit/100)
 }
 const invalid=p.invalidDates||p.invalidAmounts||p.unknown||p.invalidDuplicates||p.identityConflicts
 if(p.frekuensi&&!p.unknown){
  if(p.dalam===p.luar&&rules.tiePolicy==='validate')p.categoryTime='Perlu validasi (seri)'
  else{
   const inside=p.dalam>p.luar||(p.dalam===p.luar&&rules.tiePolicy==='inside')
   p.categoryTime=inside?'Dalam Jam Kerja':'Luar Jam Kerja'
   p.scoreTime=rounded((inside?rules.timeInside:rules.timeOutside)*rules.weightTime/100)
  }
 }
 if(invalid||(p.frekuensi&&p.scoreTime===null)){
  p.kategori='Perlu validasi';p.status='Perlu validasi';p.total=null
  if(p.invalidAmounts)p.categoryDeposit='Perlu validasi'
  if(p.unknown)p.categoryTime='Perlu validasi (jam tidak lengkap)'
 }else if(p.frekuensi){
  p.total=rounded(p.scoreFrequency+p.scoreDeposit+p.scoreTime)
  p.kategori=p.total>=rules.categoryHigh?'Berat':p.total>=rules.categoryMedium?'Sedang':'Ringan'
  p.status=p.timeFromPairing?'Simulasi menggunakan acuan waktu Hasil pairing':'Simulasi berdasarkan parameter'
 }
 p.nominal=rounded(p.nominal)
 return p
}
function addTransaction(p,tx,rules){
 p.frekuensi++;if(tx.amount===null)p.invalidAmounts++;else p.nominal+=tx.amount
 if(tx.duplicate)p.invalidDuplicates++
 if(tx.identityConflict)p.identityConflicts++
 if(tx.time===null){
  if(tx.timeFromPairingCategory){
   p.timeFromPairing++
   if(tx.timeFromPairingCategory==='Dalam Jam Kerja'){p.dalam++;p.timeFromPairingInside++}
   else{p.luar++;p.timeFromPairingOutside++}
  }else p.unknown++
  return
 }
 const weekday=new Date(tx.date+'T00:00:00Z').getUTCDay(),end=parseTime(weekday===5?rules.fridayEnd:rules.workEnd)
 if(weekday>0&&weekday<6&&tx.time>=parseTime(rules.workStart)&&tx.time<=end)p.dalam++;else p.luar++
}
export function analyzeDiscipline(source,input=DEFAULT_RULES){
 const rules=validateRules(input)
 if(!source||!Array.isArray(source.people)||!Array.isArray(source.transactions)||!source.history)throw Error('Sumber analisis belum lengkap.')
 const corrections=Array.isArray(source.corrections)?source.corrections:(Array.isArray(source.metadata?.corrections)?source.metadata.corrections:(Array.isArray(input.corrections)?input.corrections:[]))
 const correctionByRow=new Map(),correctionByKey=new Map()
 for(const c of corrections){
  if(c.row!=null)correctionByRow.set(c.row,c)
  const key=c.key||(c.row!=null?`${c.type}-row-${c.row}`:`${c.type}-nik-${c.nik}`)
  correctionByKey.set(key,c)
 }
 const audits=(source.audits||[]).filter(a=>a.type!=='invalid-time').map(a=>{
  const item={...a}
  const corr=a.row!=null?correctionByRow.get(a.row):correctionByKey.get(`${a.type}-nik-${a.nik}`)
  if(corr&&corr.resolved){
   item.resolved=true
   item.resolution=corr
   if(corr.reason)item.resolutionNote=corr.reason
  }
  return item
 })
 const rows=source.people.map(p=>({...p,historical:source.history[p.nik]||null,sourceTransactionCount:0,missingTransactionDetails:false,categoryFromPairing:false,before:emptyPeriod(),after:emptyPeriod(),audits:[]})),index=new Map(rows.map(r=>[r.nik,r]))
 let matchedTransactions=0,unmatchedTransactions=0,outsideRange=0
 const unmatched=new Map()
 for(const original of source.transactions){
  const corr=correctionByRow.get(original.row)
  const tx={...original,...(Object.hasOwn(original,'timeRaw')?{time:parseTime(original.timeRaw,rules.compactTime)}:{})}
  if(corr&&corr.resolved){
   if(corr.correctedDate!=null&&corr.correctedDate!=='')tx.date=parseDate(corr.correctedDate)
   if(corr.correctedTime!=null&&corr.correctedTime!==''){
    tx.time=parseTime(corr.correctedTime,rules.compactTime)
    tx.timeRaw=corr.correctedTime
   }
   if(corr.correctedAmount!=null&&corr.correctedAmount!=='')tx.amount=parseAmount(corr.correctedAmount)
   if(corr.correctedNik!=null&&corr.correctedNik!=='')tx.nik=String(corr.correctedNik).trim()
   if(corr.ignoreDuplicate)tx.duplicate=false
   if(corr.ignoreIdentityConflict)tx.identityConflict=false
  }
  const row=index.get(tx.nik)
  if(tx.time===null){
   const historicalTime=normalized(row?.historical?.categoryTime)
   const canUsePairing=rules.missingTimePolicy==='pairing'&&text(tx.timeRaw)==='-'&&row?.historical?.status!=='Perlu validasi'&&tx.date&&tx.date>=rules.start&&tx.date<=rules.end
   if(canUsePairing&&['DALAM JAM KERJA','LUAR JAM KERJA'].includes(historicalTime)){
    tx.timeFromPairingCategory=historicalTime==='DALAM JAM KERJA'?'Dalam Jam Kerja':'Luar Jam Kerja'
    audits.push(audit('time-from-pairing',tx.nik,`Jam sumber "-" diasumsikan ${tx.timeFromPairingCategory} mengikuti kategori waktu Hasil pairing baris ${row.historical.sourceRow??'tidak tercatat'}; jam asli tetap belum diketahui.`,tx.row))
   }else{
    const aItem=audit('invalid-time',tx.nik,'Jam transaksi tidak valid/tidak tersedia menurut parameter format jam.',tx.row)
    if(corr&&corr.resolved){aItem.resolved=true;aItem.resolution=corr}
    audits.push(aItem)
   }
  }else if(corr&&corr.resolved&&(corr.correctedTime||corr.type==='invalid-time')){
   const aItem=audit('invalid-time',tx.nik,`Jam transaksi dikoreksi menjadi ${corr.correctedTime}.`,tx.row)
   aItem.resolved=true;aItem.resolution=corr;audits.push(aItem)
  }
  if(!row){unmatchedTransactions++;unmatched.set(tx.nik,(unmatched.get(tx.nik)||0)+1);continue}
  matchedTransactions++
  row.sourceTransactionCount++
  if(!tx.date){row.before.invalidDates++;row.after.invalidDates++;continue}
  if(tx.date<rules.start||tx.date>rules.end){outsideRange++;continue}
  addTransaction(tx.date<rules.cutoff?row.before:row.after,tx,rules)
 }
 for(const [nik,count] of unmatched)audits.push(audit('unmatched-transaction',nik,`${count} transaksi tidak memiliki pasangan pada Data Olah.`))
 for(const row of rows){
  row.missingTransactionDetails=row.sourceTransactionCount===0&&(row.historical?.frekuensi>0||row.historical?.nominal>0)
  if(row.missingTransactionDetails){
   row.categoryFromPairing=['Ringan','Sedang','Berat'].includes(row.historical.kategori)&&row.historical.status!=='Perlu validasi'
   const referenceCategory=row.categoryFromPairing?row.historical.kategori:null
   row.before=unavailablePeriod(referenceCategory);row.after=unavailablePeriod(referenceCategory)
   const referenceNote=row.categoryFromPairing?` Kategori akhir asli ${referenceCategory} dari Hasil pairing digunakan hanya sebagai acuan keseluruhan, bukan kategori hasil perhitungan tiap periode.`:' Kategori akhir Hasil pairing tidak tersedia/valid sehingga belum dapat dijadikan acuan.'
   audits.push(audit('missing-transaction-details',row.nik,`Hasil pairing mencatat frekuensi ${row.historical.frekuensi??'tidak diketahui'} dan nominal Rp${row.historical.nominal??'tidak diketahui'}, tetapi tidak ada rincian transaksi master untuk NIK ini. Tanggal transaksi tidak tersedia sehingga jumlah, nominal, dan penilaian sebelum/sesudah ASN tidak dapat dipisahkan.${referenceNote}`,row.historical.sourceRow??null))
   continue
  }
  classifyPeriod(row.before,rules);classifyPeriod(row.after,rules)
  if(!row.historical)audits.push(audit('missing-history',row.nik,'Hasil pairing asli tidak tersedia atau NIK duplikat; hasil periode dihitung secara mandiri.'))
  if(row.before.categoryTime==='Perlu validasi (seri)'){
   const tieCorr=correctionByKey.get(`time-tie-before-${row.nik}`)||correctionByKey.get(`time-tie-${row.nik}`)
   if(tieCorr&&tieCorr.resolved&&tieCorr.decision){
    const inside=tieCorr.decision==='inside'
    row.before.categoryTime=inside?'Dalam Jam Kerja':'Luar Jam Kerja'
    row.before.scoreTime=rounded((inside?rules.timeInside:rules.timeOutside)*rules.weightTime/100)
    row.before.total=rounded(row.before.scoreFrequency+row.before.scoreDeposit+row.before.scoreTime)
    row.before.kategori=row.before.total>=rules.categoryHigh?'Berat':row.before.total>=rules.categoryMedium?'Sedang':'Ringan'
    row.before.status='Koreksi validasi seri'
    const aItem=audit('time-tie',row.nik,`Aktivitas sebelum ASN seri diselesaikan sebagai ${row.before.categoryTime}.`)
    aItem.resolved=true;aItem.resolution=tieCorr;audits.push(aItem)
   }else audits.push(audit('time-tie',row.nik,'Jumlah aktivitas sebelum ASN dalam/luar jam sama; menunggu validasi.'))
  }
  if(row.after.categoryTime==='Perlu validasi (seri)'){
   const tieCorr=correctionByKey.get(`time-tie-after-${row.nik}`)||correctionByKey.get(`time-tie-${row.nik}`)
   if(tieCorr&&tieCorr.resolved&&tieCorr.decision){
    const inside=tieCorr.decision==='inside'
    row.after.categoryTime=inside?'Dalam Jam Kerja':'Luar Jam Kerja'
    row.after.scoreTime=rounded((inside?rules.timeInside:rules.timeOutside)*rules.weightTime/100)
    row.after.total=rounded(row.after.scoreFrequency+row.after.scoreDeposit+row.after.scoreTime)
    row.after.kategori=row.after.total>=rules.categoryHigh?'Berat':row.after.total>=rules.categoryMedium?'Sedang':'Ringan'
    row.after.status='Koreksi validasi seri'
    const aItem=audit('time-tie',row.nik,`Aktivitas sesudah ASN seri diselesaikan sebagai ${row.after.categoryTime}.`)
    aItem.resolved=true;aItem.resolution=tieCorr;audits.push(aItem)
   }else audits.push(audit('time-tie',row.nik,'Jumlah aktivitas sesudah ASN dalam/luar jam sama; menunggu validasi.'))
  }
  if(row.historical&&rules.start===DEFAULT_RULES.start&&rules.end===DEFAULT_RULES.end){
   const f=row.before.frekuensi+row.after.frekuensi,n=rounded(row.before.nominal+row.after.nominal)
   if(row.historical.frekuensi!==f)audits.push(audit('historical-frequency-difference',row.nik,`Frekuensi Hasil pairing (${row.historical.frekuensi}) berbeda dari ${f} transaksi pada periode analisis.`))
   if(!row.before.invalidAmounts&&!row.after.invalidAmounts&&row.historical.nominal!==n)audits.push(audit('historical-amount-difference',row.nik,'Nominal Hasil pairing berbeda dari jumlah transaksi pada periode analisis.'))
  }
 }
 const byNik=new Map();for(const item of audits){if(!item.nik)continue;const list=byNik.get(item.nik)||[];list.push(item);byNik.set(item.nik,list)}
 for(const row of rows)row.audits=byNik.get(row.nik)||[]
 const summary=period=>rows.reduce((s,r)=>{
  const p=r[period]
  s.aktif+=p.frekuensi>0?1:0
  if(finiteNonnegative(p.frekuensi))s.frekuensi+=p.frekuensi
  if(finiteNonnegative(p.nominal))s.nominal=rounded(s.nominal+p.nominal)
  if(r.missingTransactionDetails){s.missingDetails++;s.knownDataOnly=true}
  if(r.categoryFromPairing){s.referenceCount++;s.referenceCategories[p.kategori]++}
  s.categories[p.kategori]++
  return s
 },{aktif:0,frekuensi:0,nominal:0,missingDetails:0,knownDataOnly:false,referenceCount:0,referenceCategories:{Ringan:0,Sedang:0,Berat:0},categories:Object.fromEntries(DISCIPLINE_CATEGORIES.map(category=>[category,0]))})
 const resolvedCount=audits.filter(a=>a.resolved).length,pendingCount=audits.filter(a=>!a.resolved).length
 const stats={total:rows.length,terbukti:rows.filter(r=>r.hasilPenilaian==='Terbukti').length,tidakTerbukti:rows.filter(r=>r.hasilPenilaian==='Tidak Terbukti').length,belumDitetapkan:rows.filter(r=>r.hasilPenilaian==='Belum ditetapkan').length,transactions:source.transactions.length,matchedTransactions,unmatchedTransactions,outsideRange,before:summary('before'),after:summary('after'),auditCount:audits.length,resolvedAudits:resolvedCount,pendingAudits:pendingCount,correctionCount:corrections.length}
 return {rows,audits,stats,rules,metadata:{...(source.metadata||{}),corrections}}
}
