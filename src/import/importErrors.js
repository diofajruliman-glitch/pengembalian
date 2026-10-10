const messages={
 FILE_ALREADY_COMMITTED:'Workbook ini sudah pernah disimpan. Tidak ada transaksi tambahan. Gunakan workbook yang memuat perubahan tahap atau koreksi.',
 MISSING_HISTORY_REQUIRES_REVIEW:'Ada pembayaran lama yang kosong atau tidak muncul dalam workbook ini. Histori tetap dipertahankan. Periksa file kumulatif; untuk koreksi menjadi nol, pilih juga workbook sebelumnya sebagai pembanding.',
 LIVE_RECAP_MISMATCH_MISSING_HISTORY_REQUIRES_REVIEW:'Saldo workbook tidak cocok setelah histori lama dipertahankan. Penyimpanan dibatalkan dan perubahan batch tidak masuk ke master. Periksa kolom kosong/hilang atau pilih workbook pembanding untuk koreksi nol.',
 STALE_PREVIEW:'Master berubah sejak batch diperiksa. Periksa ulang workbook dan siapkan batch baru sebelum menyimpan.',
 RECAP_MISMATCH:'Jumlah rincian tidak cocok dengan rekap bank. Periksa nominal dan kolom tahap pada workbook.',
 OVERPAYMENT:'Pengembalian melebihi kewajiban. Periksa nominal per SDM, tahun, dan jenis.',
 REASON_REQUIRED:'Isi alasan impor atau koreksi sebelum menyimpan.',
 FORBIDDEN:'Akun ini tidak memiliki akses impor master. Gunakan akun admin yang sudah mendapatkan akses.',
 PERSON_CHANGE_REQUIRES_REVIEW:'Nama SDM berbeda dari master tersimpan. Tinjau identitas sebelum mengimpor perubahan.',
 BANK_CHANGE_REQUIRES_REVIEW:'Bank SDM berbeda dari master tersimpan. Periksa perubahan bank terlebih dahulu.',
 INCOMPLETE_BATCH:'Unggahan batch belum lengkap. Periksa koneksi lalu siapkan batch baru.'
}
export function importErrorMessage(error){
 const text=String(error?.message||error||'')
 for(const code of Object.keys(messages).sort((a,b)=>b.length-a.length))if(text.includes(code))return messages[code]
 if(/fetch|network|connection|timeout/i.test(text))return 'Koneksi ke Supabase gagal. Status penyimpanan belum dapat dipastikan; muat ulang master sebelum mencoba lagi.'
 return 'Operasi belum berhasil. Status penyimpanan belum dapat dipastikan; muat ulang master dan periksa workbook sebelum mencoba lagi.'
}
