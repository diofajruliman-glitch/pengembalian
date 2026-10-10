# Tahap 32 — Penyimpanan dan pembacaan metadata (uji lokal)

10 Oktober 2026. Belum dipush, deploy, atau diaktifkan di Supabase produksi.

## Paket

`supabase/recovery-source-metadata-activation.sql` adalah ekstensi opsional dalam satu transaksi. Empat tabel privat untuk batch tinjauan, metadata identitas, referensi NTPN tahap dan audit. Seluruh tabel RLS dan tanpa akses langsung anon/authenticated. API `recovery_metadata_rpc` hanya admin; tidak memperluas hak editor/viewer. 19 tabel sebelumnya tetap ada (23 tabel RLS pada pengujian gabungan).

API prepare memeriksa revisi, NIP/nama/bank, kategori/raw sumber, penahanan konflik/error, serta referensi NTPN yang mempunyai pembayaran tahap positif. Metadata ditinjau sebelum commit, maksimal 1.000 identitas dan 500 referensi. Retry memakai UUID yang sama; sumber dan payload identik yang sudah committed tidak membuat audit baru. Payload berbeda pada UUID sama ditolak. Batch yang basi atau identitas berubah ditolak secara atomik.

Commit menyimpan metadata dan referensi; hanya status yang tidak ditahan memperbarui status sumber lama. Konflik/error tersimpan untuk peninjauan, tanpa menimpa kategori yang sebelumnya diterima. Ledger, nominal, tanggal/bukti/verifikasi pembayaran, SP2D, profil, rencana aksi dan bottleneck tidak dimutasi.

Pembacaan metadata memeriksa urutan/paginasi, jumlah dan revisi sebelum/sesudah. Overlay NTPN hanya pada pembayaran positif dengan bank/jenis/tahun/tahap yang sama. Tidak otomatis menandai penerimaan terverifikasi atau lunas. Metadata tidak ikut payload impor keuangan; keduanya mempunyai alur audit terpisah.

Flag `VITE_RECOVERY_METADATA_MODE=production-metadata` masih OFF secara default. Hanya aktif setelah ekstensi diuji dan diaplikasikan. Tidak ada pengaturan environment produksi yang berubah. Tinjauan UI menyediakan before/after, sumber mentah, halaman, alasan dan persetujuan; alasan terkunci untuk retry setelah hasil commit tidak pasti.

Panel penghubungan sekarang menyaring status sesuai kegiatan/kategori: verifikasi meninggal hanya meninggal, resign hanya mengundurkan diri, pensiun/BUP mengikuti kelompok pensiun. Kegiatan gabungan resign/pensiun menerima kedua jalur. Daftar berjalan selalu nonaktif dengan sisa positif; riwayat saldo nol tetap terpisah. Tidak membuat/menghapus tautan otomatis.

## Bukti pengujian

- 68 tes lulus, build berhasil. Peringatan ukuran chunk tetap ada.
- Migrasi dipaksa gagal di akhir: seluruh ekstensi rollback. Migrasi sukses lalu diuji dengan schema aplikasi penuh dan tiga role.
- Retry commit dan unggah sumber identik tidak menggandakan audit. Konflik payload, penahanan error yang dicoba dilepas, revisi basi, dan perubahan identitas ditolak. Kegagalan pada identitas kedua mengembalikan perubahan pertama.
- Workbook asli diuji seluruhnya pada PGlite lokal (tanpa jaringan Supabase): master tersimpan, 550 metadata dan 17 referensi NTPN prepared/committed, lalu dimuat kembali melalui adapter aplikasi. Tidak ada identitas atau referensi tanpa pembayaran yang terbuang dari batch ini.
- Nominal sebelum/sesudah sama: 20.176 SDM berkewajiban, kewajiban Rp5.837.623.999, pembayaran Rp3.641.947.218, sisa Rp2.195.676.781, penerimaan terverifikasi Rp0. Pengelompokan siap tindak lanjut tetap 37 SDM / Rp64.140.566 setelah penahanan masalah sumber.
- Pengujian browser lokal: simulasi respons commit hilang, alasan tetap terkunci, retry berhasil dengan permintaan sama; console tanpa error. Pengujian kegiatan meninggal/resign menghasilkan kelompok yang berbeda dan mengecualikan SDM bersaldo nol.

Produksi tetap memakai 117 status lama dan 40 SDM/80 tautan sebelumnya. Paket baru belum mengubah data ini. Catatan 426 error bank, 9 perbedaan nama dan 1 konflik kategori tetap untuk pemeriksaan. Sebelum produksi: aktivasi skema, preview dengan flag metadata, tinjauan batch nyata, serta pemeriksaan overlay dan tautan lama. Keputusan atas sumber yang bertentangan tidak dibuat otomatis.
