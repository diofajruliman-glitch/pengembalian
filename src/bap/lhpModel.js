import {QUESTIONS,initialIdentity,dateWords} from './model.js'
export const REPORT_SECTIONS=[['dasar','Dasar dan ruang lingkup'],['temuan','Temuan awal'],['fakta','Fakta hasil wawancara'],['analisis','Analisis dan pertimbangan'],['kesimpulan','Kesimpulan'],['rekomendasi','Rekomendasi tindak lanjut']]
export function sameVersions(a,b){return Boolean(a&&b&&['bap','category','statement'].every(k=>a[k]===b[k]))}
export function reportReadiness(source){
 if(!source)return ['Sumber laporan belum dimuat']
 const row=source.case,category=source.category,statement=source.statement,missing=[]
 if(row.status!=='Selesai')missing.push('BAP belum difinalisasi')
 if(category?.review_status!=='Ditetapkan'||category?.decision_bap_revision!==row.revision)missing.push('Kategori akhir belum ditetapkan berdasarkan BAP terbaru')
 if(!statement?.confirmed_at||statement.bap_revision!==row.revision)missing.push('SPTJM belum dikonfirmasi berdasarkan BAP terbaru')
 return missing
}
export function generatedReport(source){
 const row=source.case,category=source.category||{},baseline=category.initial_snapshot||{},identity=initialIdentity(row)
 const date=row.started_at?new Date(row.started_at).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'long',year:'numeric'}):'[Wawancara belum dimulai]'
 const finalCurrent=category.review_status==='Ditetapkan'&&category.decision_bap_revision===row.revision
 const metrics=source.metrics||{}
 const nominal=typeof metrics.nominal==='number'?'Rp '+metrics.nominal.toLocaleString('id-ID'):'Belum tersedia pada sumber'
 const frequency=typeof metrics.frekuensi==='number'?String(metrics.frekuensi):'Belum tersedia pada sumber'
 return {
  dasar:`Surat panggilan Nomor ${identity.nomorSurat||'[Belum diisi]'} tanggal ${identity.tanggalSurat||'[Belum diisi]'}.\nWawancara dan BAP tanggal ${date}.\nRujukan klarifikasi: temuan PPATK Tahun 2025 sebagaimana bahan pemanggilan. Dokumen sumber dan dasar pemeriksaan perlu diverifikasi pemeriksa.`,
  temuan:`Kategori awal sebelum wawancara (periode setelah pengangkatan ASN): ${baseline.afterCategory||'Belum tersedia'}.\nKategori historis: ${baseline.historicalCategory||'Belum tersedia'}.\nStatus penilaian pada dataset sumber: ${baseline.assessment||'Belum tersedia'}.\nNominal transaksi pada data setelah ASN: ${nominal}.\nFrekuensi transaksi pada data setelah ASN: ${frequency}.\nSumber: ${baseline.sourceName||'Belum tersedia'}, versi ${baseline.datasetVersion||'belum tersedia'}. Data awal merupakan bahan pemeriksaan dan tidak menggantikan kesimpulan hasil wawancara.`,
  fakta:QUESTIONS.map((question,i)=>`Q${i+1}. ${question.replace('{nomorSurat}',identity.nomorSurat||'…').replace('{tanggalSuratTeks}',identity.tanggalSurat||'…')}\nKeterangan peserta: ${row.answers?.[i+1]?.trim()||'[Belum diisi]'}`).join('\n\n'),
  analisis:`Usulan pewawancara: ${category.proposed_category||'Belum diisi'}.\nPertimbangan pewawancara: ${category.reason||'Belum dicatat'}.\nBukti / hasil verifikasi yang dicatat: ${category.evidence||'Belum dicatat'}.\nJawaban pendukung: ${(category.question_refs||[]).map(n=>'Q'+n).join(', ')||'Belum dipilih'}.\nCatatan peninjau: ${category.decision_reason||'Belum ditinjau'}.`,
  kesimpulan:finalCurrent?`Kategori hasil wawancara yang telah ditetapkan dalam aplikasi: ${category.final_category}. Kategori awal sebelum wawancara: ${baseline.afterCategory||'Belum tersedia'}. Kesimpulan ini merupakan bahan draf LHP dan memerlukan pengesahan pejabat berwenang.`:'Kategori akhir belum ditetapkan berdasarkan BAP terbaru. Kesimpulan pemeriksaan belum dapat dituangkan sebagai hasil yang telah ditinjau.',
  rekomendasi:''
 }
}
export function reportTemplateData(source,form){
 const row=source.case,identity=initialIdentity(row),date=row.started_at?dateWords(row.started_at):null
 return {...form.sections,nomor:form.nomor?.trim()||'[Nomor belum ditetapkan]',kota:form.kota||identity.kota,
  tanggal:date?`${date.tanggal_angka} ${date.bulan} ${date.tahun_angka}`:'[Belum tersedia]',
  identitas:`Nama: ${row.person.nama}\nNIP: ${row.person.nip}\nNIK: ${row.nik}\nPangkat / golongan: ${identity.pangkat||'[Belum diisi]'}\nJabatan: ${identity.jabatan||'[Belum diisi]'}\nUnit kerja: ${identity.unitKerja||'[Belum diisi]'}`,
  status_sptjm:source.statement?.confirmed_at&&source.statement.bap_revision===row.revision?'Isi SPTJM telah dikonfirmasi dalam aplikasi. Dokumen bertanda tangan tetap perlu diperiksa.':'SPTJM belum dikonfirmasi berdasarkan BAP terbaru.',
  referensi:`BAP revisi ${source.versions.bap}; penilaian revisi ${source.versions.category}; SPTJM revisi ${source.versions.statement}; dataset ${source.category?.initial_snapshot?.datasetId||row.dataset_id||'belum tersedia'}.`
 }
}
