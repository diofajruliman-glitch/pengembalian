# Tahap 31 — Kelompok tindak lanjut dan metadata sumber (lokal)

10 Oktober 2026. Paket implementasi lokal; belum di-push/deploy dan tidak ada perubahan Supabase produksi.

## Perubahan

- Parser metadata membaca status Mandiri/BRI, sheet master tidak aktif, dan Sudah pensiun pada Sheet1. Status rekening dikecualikan. Label status, isi mentah, sheet, baris dan kolom dipertahankan.
- Kosong pada sumber status dipetakan Aktif; Resign/Mengundurkan Diri disatukan; BUP/Pensiun tetap mempertahankan sumber asli. Status eksplisit nonaktif tidak dihapus oleh sel kosong sumber lain.
- Konflik kategori, error sumber, dan perbedaan nama ditahan (`needsReview`), walaupun sumber lain mempunyai kategori yang dikenal.
- 17 referensi NTPN header dipetakan ke bank/jenis/tahun/tahap dan hanya ditempelkan pada pembayaran positif. Nominal, tanggal pembayaran, dan status verifikasi tidak diubah.
- Monitoring SDM dan panel penghubungan memakai fungsi seleksi yang sama: awal Nonaktif dengan sisa positif; pilihan aktif bersisa, riwayat saldo nol, data perlu pemeriksaan, dan semua master tersedia. Penambahan tautan hanya diperbolehkan dari kelompok nonaktif bersisa.
- Rencana Aksi/Matriks menampilkan kegiatan bertema nonaktif sebagai fokus awal. Katalog lengkap tetap tersedia lewat pengaturan fokus; tidak menghapus kegiatan, PIC, deadline atau progres.
- Tag Belum Lunas/Lunas menurut saldo, referensi NTPN dan detail sumber tersedia di monitoring/ekspor. Penerimaan terverifikasi tetap terpisah.
- Alur penyimpanan status lama ditahan ketika hasil baru memiliki metadata multi-sumber: API metadata dan tinjauan baru belum tersedia, sehingga batch lama tidak boleh menimpa hasil rekonsiliasi baru.

## Pemeriksaan workbook penuh

Seluruh nominal tetap sama: kewajiban Rp5.837.623.999, pembayaran Rp3.641.947.218, sisa Rp2.195.676.781; 20.176 SDM dengan kewajiban positif. Tidak ada penambahan pembayaran dari NTPN.

Pemetaan lokal baru menghasilkan 436 identitas yang ditahan (426 error bank, 9 perbedaan nama, 1 konflik kategori). 350 di antaranya memiliki kewajiban positif; sebagian sudah bersaldo nol. Kelompok nonaktif bersisa yang tidak ditahan berisi 37 SDM, sisa Rp64.140.566. Angka 42 pada tahap sebelumnya adalah calon gabungan sumber sebelum aturan penahanan diterapkan sepenuhnya; bukan penetapan produksi.

Ini tidak mengubah 40 SDM/80 tautan yang sudah tersimpan pada produksi. Tautan lama perlu ditinjau terhadap metadata baru, tanpa menghapus riwayat.

## Validasi

66 tes lulus; build berhasil (peringatan ukuran chunk tetap ada). Browser lokal menjalankan worker terhadap workbook asli, menampilkan 37 SDM pada daftar tindak lanjut, serta 17.877 SDM bersaldo nol di riwayat. Penerimaan terverifikasi tetap Rp0. Ekspor kelompok 37 diperiksa: NIP teks, total sisa Rp64.140.566, seluruh tag Belum Lunas, 15 SDM memiliki referensi NTPN sumber. Console alur teruji tanpa error.

## Pekerjaan yang masih diperlukan sebelum produksi

1. API/tabel metadata sumber dan referensi NTPN privat dengan audit, pemeriksaan revision, serta batch tinjauan. Jangan mengubah ledger pembayaran dari kode NTPN saja.
2. Pembacaan metadata pada master Supabase dan tinjauan konflik/error tanpa menyatakan otomatis Aktif.
3. Tinjauan pembaruan status dan tautan lama, lalu pengujian integrasi tersimpan sebelum rilis preview/produksi.

Belum dibuat pencatatan aktivitas tindak lanjut baru atau verifikasi NTPN eksternal. File workbook asli tidak ditulis ulang.
