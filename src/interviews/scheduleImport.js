// Import is a preview only: this module reads local files and never persists data.
const MAX_BYTES = 8 * 1024 * 1024
const MAX_ROWS = 5000
const MAX_COLUMNS = 100
const DAY = 86400000
const text = value => typeof value === 'string' ? value.trim() : ''
const blank = value => value == null || (typeof value === 'string' && !value.trim())
const normalize = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('id-ID').replace(/[^a-z0-9]/g,'')
const aliases = {
 nik:['nik','nik asn','nomor induk kependudukan'],
 nip:['nip','nip asn','nomor induk pegawai'],
 nama:['nama','nama asn','nama sdm','nama responden','responden','nama peserta'],
 date:['tanggal','tanggal wawancara','tanggal jadwal','tgl','date'],
 time:['jam mulai','waktu mulai','jam','jadwal','waktu','start time'],
 session:['sesi','session'],
 room:['room','ruang','ruangan','breakout room','nama room','nomor room'],
 interviewer:['pewawancara','pewawancara utama','nama pewawancara','interviewer'],
 duration:['durasi','durasi menit','durasi wawancara','duration'],
 notes:['catatan','keterangan','notes']
}
const fields = new Map(Object.entries(aliases).flatMap(([field,names])=>names.map(name=>[normalize(name),field])))
const issue = (rowNumber,message) => ({rowNumber,message})
const failure = (message,rowNumber=0) => ({rows:[],errors:[issue(rowNumber,message)],warnings:[]})

function headerColumns(header) {
 const columns={},seen=new Set()
 for(let index=0;index<header.length;index++) {
  if(blank(header[index]))continue
  if(typeof header[index]!=='string')throw Error('Nama kolom pada baris pertama harus berupa teks.')
  const name=normalize(header[index]),field=fields.get(name)
  if(!name)throw Error('Nama kolom pada baris pertama tidak valid.')
  if(seen.has(name)||(field&&Object.hasOwn(columns,field)))throw Error(`Kolom ${field||text(header[index])} muncul lebih dari sekali.`)
  seen.add(name)
  if(field)columns[field]=index
 }
 if(!Object.hasOwn(columns,'nik')&&!Object.hasOwn(columns,'nip'))throw Error('Kolom NIK atau NIP wajib ada untuk mencocokkan SDM dengan BNBA.')
 if(!Object.hasOwn(columns,'date'))throw Error('Kolom Tanggal wajib ada.')
 if(!Object.hasOwn(columns,'time'))throw Error('Kolom Jam Mulai atau Jadwal wajib ada.')
 if(!Object.hasOwn(columns,'room')&&!Object.hasOwn(columns,'interviewer'))throw Error('Kolom Room atau Pewawancara Utama wajib ada.')
 return columns
}

function identifier(value,label,length) {
 if(blank(value))return undefined
 if(typeof value!=='string')throw Error(`${label} harus disimpan sebagai teks, bukan angka Excel; digit dapat berubah atau hilang.`)
 // The app prefixes exported identifiers with one apostrophe to protect Excel precision.
 const result=value.trim().replace(/^'/,'')
 if(!new RegExp(`^\\d{${length}}$`).test(result))throw Error(`${label} harus tepat ${length} digit teks; notasi ilmiah tidak diterima.`)
 return result
}

function dateString(value) {
 if(value instanceof Date) {
  if(!Number.isFinite(value.getTime())||value.getUTCHours()||value.getUTCMinutes()||value.getUTCSeconds()||value.getUTCMilliseconds())throw Error('Tanggal Excel harus tanggal tanpa komponen jam.')
  value=value.toISOString().slice(0,10)
 } else if(typeof value==='number') {
  if(!Number.isInteger(value)||value<1||value===60||value>2958465)throw Error('Serial tanggal Excel harus berupa tanggal kalender utuh yang valid.')
  // Excel's fictional 1900-02-29 is serial 60; earlier dates need one day added.
  value=new Date(Date.UTC(1899,11,30)+(value+(value<60?1:0))*DAY).toISOString().slice(0,10)
 }
 const input=text(value),iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(input),local=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input)
 const parts=iso?[iso[1],iso[2],iso[3]]:local?[local[3],local[2],local[1]]:null
 if(!parts||Number(parts[0])<1900||Number(parts[0])>9999)throw Error('Tanggal harus valid dalam format YYYY-MM-DD atau DD/MM/YYYY.')
 const formatted=parts.join('-'),date=new Date(Date.UTC(Number(parts[0]),Number(parts[1])-1,Number(parts[2])))
 if(date.toISOString().slice(0,10)!==formatted)throw Error('Tanggal tidak sesuai kalender.')
 return formatted
}

function timeMinutes(value) {
 if(value instanceof Date) {
  if(!Number.isFinite(value.getTime())||value.getUTCSeconds()||value.getUTCMilliseconds())throw Error('Jam harus tepat per menit tanpa detik.')
  return value.getUTCHours()*60+value.getUTCMinutes()
 }
 if(typeof value==='number') {
  const rounded=Math.round(value*1440)
  if(!Number.isFinite(value)||value<0||value>=1||Math.abs(value*1440-rounded)>0.000001||rounded>=1440)throw Error('Jam Excel harus pecahan hari yang tepat per menit tanpa detik.')
  return rounded
 }
 const match=/^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(text(value))
 if(!match)throw Error('Jam harus HH:MM atau HH:MM:00 tanpa detik tambahan.')
 return Number(match[1])*60+Number(match[2])
}

function positiveInteger(value,min,max,label) {
 if(!['number','string'].includes(typeof value)||!/^\d+$/.test(String(value).trim()))throw Error(`${label} harus bilangan bulat ${min}–${max}.`)
 const result=Number(value)
 if(!Number.isInteger(result)||result<min||result>max)throw Error(`${label} harus bilangan bulat ${min}–${max}.`)
 return result
}

function optionalText(value,label,max=300) {
 if(blank(value))return undefined
 if(typeof value!=='string')throw Error(`${label} harus berupa teks.`)
 const result=value.trim()
 if(result.length>max)throw Error(`${label} terlalu panjang (maksimal ${max} karakter).`)
 return result
}

/** Parse raw cell values without coercing long identity numbers or executing formulas. */
export function parseScheduleRows(rawRows) {
 if(!Array.isArray(rawRows)||!rawRows.length)return failure('Berkas jadwal kosong.',1)
 if(rawRows.length>MAX_ROWS+1)return failure(`Jadwal maksimal ${MAX_ROWS} baris data.`,1)
 if(rawRows.some(row=>!Array.isArray(row)||row.length>MAX_COLUMNS))return failure(`Jadwal harus berupa tabel dengan maksimal ${MAX_COLUMNS} kolom.`,1)
 let columns
 try{columns=headerColumns(rawRows[0])}catch(error){return failure(error.message,1)}
 const result={rows:[],errors:[],warnings:[]}
 for(const [field,label,defaultValue] of [['session','Sesi',1],['duration','Durasi',40]]) {
  if(!Object.hasOwn(columns,field))result.warnings.push(issue(1,`Kolom ${label} tidak ada; semua baris memakai ${label.toLowerCase()} ${defaultValue}${field==='duration'?' menit':''}.`))
 }
 for(let index=1;index<rawRows.length;index++) {
  const cells=rawRows[index],rowNumber=index+1
  if(cells.every(blank))continue
  const get=field=>cells[columns[field]],warnings=[]
  try {
   if(cells.slice(rawRows[0].length).some(value=>!blank(value)))throw Error('Baris memiliki isi di luar kolom judul; periksa pemisah CSV dan judul kolom.')
   const nik=identifier(get('nik'),'NIK',16),nip=identifier(get('nip'),'NIP',18)
   if(!nik&&!nip)throw Error('NIK atau NIP wajib diisi; pencocokan berdasarkan nama saja tidak diperbolehkan.')
   const date=dateString(get('date'))
   const session=blank(get('session'))?1:positiveInteger(get('session'),1,1440,'Sesi')
   const duration=blank(get('duration'))?40:positiveInteger(get('duration'),1,480,'Durasi')
   for(const [field,label,defaultValue] of [['session','Sesi',1],['duration','Durasi',40]]) {
    if(Object.hasOwn(columns,field)&&blank(get(field)))warnings.push(issue(rowNumber,`${label} kosong; dipakai ${defaultValue}${field==='duration'?' menit':''}.`))
   }
   let start,end
   const rawTime=get('time'),range=typeof rawTime==='string'?rawTime.trim().split(/\s*[–—-]\s*/):[]
   if(range.length===2){start=timeMinutes(range[0]);end=timeMinutes(range[1])}
   else start=timeMinutes(rawTime)
   if(end!==undefined&&(end<=start||end-start!==duration))throw Error('Rentang Jadwal harus sesuai Durasi (atau 40 menit jika kosong) dan selesai di hari yang sama.')
   if(start+duration>1440)throw Error('Wawancara harus selesai sebelum pergantian tanggal.')
   let room
   if(typeof get('room')==='number')room=`Room ${positiveInteger(get('room'),1,200,'Nomor room')}`
   else room=optionalText(get('room'),'Room')
   const interviewer=optionalText(get('interviewer'),'Pewawancara Utama')
   if(!room&&!interviewer)throw Error('Room atau Pewawancara Utama wajib diisi.')
   const nama=optionalText(get('nama'),'Nama'),notes=optionalText(get('notes'),'Catatan',4000)
   const time=`${String(Math.floor(start/60)).padStart(2,'0')}:${String(start%60).padStart(2,'0')}`
   result.rows.push({rowNumber,...(nik?{nik}:{}),...(nip?{nip}:{}),...(nama?{nama}:{}),date,time,session,...(room?{room}:{}),...(interviewer?{interviewer}:{}),duration,...(notes?{notes}:{})})
   result.warnings.push(...warnings)
  }catch(error){result.errors.push(issue(rowNumber,error.message))}
 }
 if(!result.rows.length&&!result.errors.length)result.errors.push(issue(2,'Jadwal tidak memiliki baris data.'))
 return result
}

// Count delimiters only in the header record, outside quoted cells.
function csvDelimiter(input) {
 const count={';':0,',':0,'\t':0}
 let quoted=false
 for(let index=0;index<input.length;index++) {
  const char=input[index]
  if(char==='"') {
   if(quoted&&input[index+1]==='"')index++
   else quoted=!quoted
  } else if(!quoted) {
   if(char==='\r'||char==='\n')break
   if(Object.hasOwn(count,char))count[char]++
  }
 }
 return Object.keys(count).sort((a,b)=>count[b]-count[a])[0]
}

export function parseScheduleCsv(value) {
 if(typeof value!=='string')return failure('Isi CSV harus berupa teks.')
 if(new TextEncoder().encode(value).length>MAX_BYTES)return failure('Ukuran berkas maksimal 8 MiB.')
 const input=value.replace(/^\uFEFF/,'')
 if(!input.trim())return failure('Berkas jadwal kosong.',1)
 if(input.includes('\0'))return failure('CSV mengandung karakter tidak valid; simpan sebagai CSV UTF-8.')
 const delimiter=csvDelimiter(input),rows=[],lineNumbers=[]
 let row=[],cell='',state='start',line=1,rowLine=1
 const saveCell=()=>{row.push(cell);cell='';state='start';if(row.length>MAX_COLUMNS)throw Error(`Jadwal maksimal ${MAX_COLUMNS} kolom.`)}
 const saveRow=()=>{saveCell();rows.push(row);lineNumbers.push(rowLine);row=[];if(rows.length>MAX_ROWS+1)throw Error(`Jadwal maksimal ${MAX_ROWS} baris data.`)}
 try {
  for(let index=0;index<input.length;index++) {
   const char=input[index]
   if(state==='quoted') {
    if(char==='"') {
     if(input[index+1]==='"'){cell+='"';index++}else state='closed'
    } else if(char==='\r'||char==='\n') {
     cell+='\n';line++;if(char==='\r'&&input[index+1]==='\n')index++
    } else cell+=char
   } else if(char===delimiter)saveCell()
   else if(char==='\r'||char==='\n') {
    saveRow();line++;rowLine=line;if(char==='\r'&&input[index+1]==='\n')index++
   } else if(char==='"') {
    if(state!=='start')throw Error('Tanda kutip CSV hanya boleh berada di awal sel atau digandakan di dalam sel berkutip.')
    state='quoted'
   } else {
    if(state==='closed')throw Error('Karakter setelah penutup tanda kutip CSV tidak valid.')
    cell+=char;state='unquoted'
   }
  }
  if(state==='quoted')throw Error('Tanda kutip CSV belum ditutup.')
  if(row.length||cell||state!=='start')saveRow()
 }catch(error){return failure(error.message,line)}
 const result=parseScheduleRows(rows)
 for(const group of ['rows','errors','warnings'])for(const item of result[group])item.rowNumber=lineNumbers[item.rowNumber-1]||item.rowNumber
 return result
}

/** Read the selected local CSV/TSV or XLSX; all validation remains reviewable. */
export async function readScheduleFile(file) {
 if(!file||typeof file.name!=='string'||!Number.isFinite(file.size)||file.size<0)return failure('Pilih berkas jadwal CSV atau XLSX yang valid.')
 if(file.size>MAX_BYTES)return failure('Ukuran berkas maksimal 8 MiB.')
 if(!/\.(csv|tsv|xlsx)$/i.test(file.name))return failure('Format jadwal harus .csv, .tsv, atau .xlsx.')
 try {
  if(/\.(csv|tsv)$/i.test(file.name))return parseScheduleCsv(await file.text())
  const {default:readXlsxFile}=await import('read-excel-file')
  const sheets=await readXlsxFile(file,{getSheets:true})
  const named=sheets.filter(sheet=>normalize(sheet.name)==='jadwal')
  const sheet=named.length===1?named[0].name:sheets.length===1?sheets[0].name:null
  if(!sheet)return failure('Workbook memiliki beberapa sheet. Gunakan satu sheet bernama Jadwal agar data yang dipilih jelas.')
  const {data,properties}=await readXlsxFile(file,{sheet,properties:true,trim:false})
  // Unformatted serial dates also respect workbooks using Excel's 1904 epoch.
  if(properties?.epoch1904&&data.length) {
   let dateColumn
   try{dateColumn=headerColumns(data[0]).date}catch{return parseScheduleRows(data)}
   for(let index=1;index<data.length;index++)if(typeof data[index][dateColumn]==='number')data[index][dateColumn]+=1462
  }
  return parseScheduleRows(data)
 }catch{return failure('Berkas jadwal tidak dapat dibaca. Pastikan berkas tidak rusak atau dilindungi sandi, lalu simpan ulang sebagai CSV UTF-8 atau XLSX.')}
}
