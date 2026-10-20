import {dateWords,initialIdentity} from './model.js'
export const SPTJM_FIELDS=[['provinsi','Provinsi'],['kabKota','Kabupaten/Kota'],['noHp','Nomor handphone'],['kota','Tempat pernyataan']]
export function initialStatement(row,record){return {provinsi:row.person.provinsi||'',kabKota:row.person.kabKota||'',noHp:row.person.noHp||'',kota:initialIdentity(row).kota,admission:'',activityState:'',startMonth:'',endMonth:'',periodNote:'',hasAttachments:false,...record?.details}}
export function monthValid(value){return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&Number(value.slice(0,4))>=1900}
export function statementMissing(row,details){
 const missing=[]
 for(const [k,label] of [['nama','Nama'],['nip','NIP'],['nik','NIK']])if(!row.person[k]?.trim())missing.push(label)
 const identity=initialIdentity(row)
 if(!identity.jabatan.trim())missing.push('Jabatan')
 if(!identity.unitKerja.trim())missing.push('Unit kerja')
 for(const [k,label] of SPTJM_FIELDS)if(!details[k]?.trim())missing.push(label)
 if(details.noHp&&!/^\+?[0-9 ()-]{8,30}$/.test(details.noHp))missing.push('Format nomor handphone')
 if(!['Mengakui','Tidak mengakui'].includes(details.admission))missing.push('Pilihan pengakuan')
 if(details.admission==='Mengakui'){
  if(!['stopped','ongoing','unknown'].includes(details.activityState))missing.push('Keterangan periode')
  if(['stopped','ongoing'].includes(details.activityState)&&!monthValid(details.startMonth))missing.push('Bulan/tahun mulai')
  if(details.activityState==='stopped'&&!monthValid(details.endMonth))missing.push('Bulan/tahun terakhir')
  if(details.activityState==='stopped'&&details.startMonth>details.endMonth)missing.push('Urutan periode')
  if(details.activityState==='unknown'&&details.periodNote.trim().length<10)missing.push('Penjelasan periode minimal 10 karakter')
  if(row.started_at){const actual=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).format(new Date(row.started_at));if(details.startMonth>actual||details.endMonth>actual)missing.push('Periode melebihi tanggal wawancara')}
 }
 if(!row.started_at)missing.push('Waktu mulai wawancara')
 return missing
}
function monthText(value){return new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',month:'long',year:'numeric'}).format(new Date(value+'-01T12:00:00+07:00')).replace(/ (\d{4})$/,' tahun $1')}
export function statementTemplateData(row,details){
 let periode='[Keterangan periode belum diisi]'
 if(details.admission==='Tidak mengakui')periode='Keterangan mengenai periode aktivitas tidak berlaku karena saya menyatakan tidak mengakui melakukan aktivitas judi online.'
 else if(details.activityState==='unknown')periode='Keterangan mengenai periode aktivitas: '+details.periodNote.trim()+'.'
 else if(monthValid(details.startMonth)){
  if(details.activityState==='ongoing')periode=`Saya mulai melakukan aktifitas Judi online sejak bulan ${monthText(details.startMonth)} dan sampai pernyataan ini dibuat aktivitas tersebut masih berlangsung.`
  if(details.activityState==='stopped'&&monthValid(details.endMonth))periode=`Saya mulai melakukan aktifitas Judi online sejak bulan ${monthText(details.startMonth)} dan mengakhiri aktifitas judi online pada bulan ${monthText(details.endMonth)}.`
 }
 return {...row.person,...initialIdentity(row),...details,...dateWords(row.started_at),pengakuan:details.admission?details.admission.toUpperCase():'[Pilihan belum dikonfirmasi]',periode,lampiran:details.hasAttachments?'Bukti Pendukung Terlampir.':'Dokumen pendukung belum dilampirkan.'}
}
