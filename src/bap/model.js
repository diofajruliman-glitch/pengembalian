import questions from './questions.json' with {type:'json'}
export const QUESTIONS=questions
export const IDENTITY_FIELDS=[['pangkat','Pangkat / golongan'],['jabatan','Jabatan'],['unitKerja','Unit kerja'],['nomorSurat','Nomor surat panggilan'],['tanggalSurat','Tanggal surat panggilan'],['kota','Tempat pemeriksaan']]
export function terbilang(n){
 const words=['nol','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan','sepuluh','sebelas']
 if(n<12)return words[n]
 if(n<20)return terbilang(n-10)+' belas'
 if(n<100)return terbilang(Math.floor(n/10))+' puluh'+(n%10?' '+terbilang(n%10):'')
 if(n<200)return 'seratus'+(n%100?' '+terbilang(n%100):'')
 if(n<1000)return terbilang(Math.floor(n/100))+' ratus'+(n%100?' '+terbilang(n%100):'')
 if(n<2000)return 'seribu'+(n%1000?' '+terbilang(n%1000):'')
 return terbilang(Math.floor(n/1000))+' ribu'+(n%1000?' '+terbilang(n%1000):'')
}
export function dateWords(timestamp){
 if(!timestamp||!Number.isFinite(Date.parse(timestamp)))throw Error('Waktu mulai wawancara belum tersedia.')
 const date=new Date(timestamp)
 const parts=Object.fromEntries(new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',weekday:'long',day:'numeric',month:'long',year:'numeric'}).formatToParts(date).map(p=>[p.type,p.value]))
 return {hari:parts.weekday,tanggal_huruf:terbilang(Number(parts.day)),bulan:parts.month,tahun_huruf:terbilang(Number(parts.year)).replace(/\b\w/g,c=>c.toUpperCase()),tanggal_angka:parts.day,tahun_angka:parts.year}
}
// Document dates follow the participant's assigned schedule in WIB. The actual
// start timestamp remains unchanged in the case/audit records.
export function interviewTimestamp(row){
 if(/^\d{4}-\d{2}-\d{2}$/.test(row.scheduled_date||'')){
  const time=/^\d{2}:\d{2}(:\d{2})?$/.test(row.scheduled_time||'')?row.scheduled_time:'12:00:00'
  const timestamp=`${row.scheduled_date}T${time}+07:00`
  if(Number.isFinite(Date.parse(timestamp)))return timestamp
 }
 return row.started_at
}
export function initialIdentity(row){
 const details=row.identity_details||{}
 return {unitKerja:row.person.unitKerja||'Direktorat Perlindungan Sosial Non Kebencanaan',nomorSurat:row.person.nomorSurat||'',tanggalSurat:row.person.tanggalSurat||'2026-10-15',kota:'Jakarta',...details,
  pangkat:details.pangkat?.trim()?details.pangkat:row.person.pangkat||'',
  jabatan:details.jabatan?.trim()?details.jabatan:row.person.jabatan||''}
}
export function missingFields(row,identity,answers){
 const missing=[]
 for(const [key,label] of [['nama','Nama'],['nip','NIP']])if(!row.person[key]?.trim())missing.push(label)
 for(const [key,label] of IDENTITY_FIELDS)if(!identity[key]?.trim())missing.push(label)
 if(identity.tanggalSurat&&(!/^\d{4}-\d{2}-\d{2}$/.test(identity.tanggalSurat)||!Number.isFinite(Date.parse(identity.tanggalSurat))||new Date(identity.tanggalSurat).toISOString().slice(0,10)!==identity.tanggalSurat))missing.push('Format tanggal surat')
 if(!row.started_at)missing.push('Waktu mulai wawancara')
 for(let n=1;n<=22;n++)if(!answers[n]?.trim())missing.push(`Jawaban ${n}`)
 return missing
}
export function templateData(row,identity,answers){
 const data={...row.person,...identity,...dateWords(interviewTimestamp(row))}
 data.tanggalSuratTeks=identity.tanggalSurat?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'long',year:'numeric'}).format(new Date(identity.tanggalSurat+'T12:00:00+07:00')):'[tanggal surat belum diisi]'
 for(let n=1;n<=22;n++)data[`jawaban_${n}`]=answers[n]?.trim()||'[Belum diisi]'
 for(const [key] of IDENTITY_FIELDS)if(!data[key])data[key]='[Belum diisi]'
 return data
}
