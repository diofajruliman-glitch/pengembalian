# Tahap 33 — Metadata aktif dan integrasi online

10 Oktober 2026. Aktivasi, batch nyata, preview dan deployment utama selesai.

## Aktivasi Supabase

Ekstensi `recovery-source-metadata-activation.sql` dijalankan satu kali pada proyek yang sudah digunakan aplikasi. SQL Editor mengonfirmasi sukses. Empat tabel metadata awalnya kosong; jumlah tabel privat dengan RLS menjadi 23. Admin dapat membaca API metadata; editor ditolak. Akses langsung schema privat untuk authenticated tetap tidak diberikan, anon tidak memiliki execute API baru.

Pemeriksaan sebelum/sesudah aktivasi: revisi 2, 32.779 orang, kewajiban Rp5.837.623.999, pembayaran Rp3.641.947.218 dan 80 tautan tidak berubah. Sidik seluruh profil, kegiatan, bottleneck, rekap bank dan kasus khusus sama.

## Batch sumber nyata

User masuk dengan akun admin pada preview baru. Workbook dasar dibaca lokal, kemudian server menyiapkan 550 metadata SDM dan 17 referensi NTPN. Seluruh 38 halaman/567 item dan rincian sumber ditinjau sebelum commit dengan alasan audit. 436 catatan bermasalah tetap ditahan; tidak ditetapkan penyelesaian konfliknya otomatis.

UI mengonfirmasi penyimpanan. Database menjadi revisi 3: metadata identitas 550, referensi NTPN 17, batch committed 1, audit metadata 567. Ledger, nominal, tanggal dan verifikasi pembayaran tetap sama. Tidak dibuat pegawai, pembayaran atau kasus khusus baru.

## Hasil kelompok tindak lanjut

| Kelompok siap ditindaklanjuti | SDM | Sisa |
|---|---:|---:|
| Mengundurkan Diri | 20 | Rp40.382.535 |
| Meninggal Dunia | 14 | Rp23.536.666 |
| Pensiun | 3 | Rp221.365 |
| Total unik | 37 | Rp64.140.566 |

Seluruh 37 SDM sudah mempunyai tautan yang sesuai ke Rencana Aksi dan Bottleneck. Tidak ditambahkan tautan baru. 80 tautan lama tetap disimpan; 3 SDM dari kelompok 40 sebelumnya kini ditahan karena error sumber/konflik. Ringkasan kegiatan hanya menghitung SDM yang lolos filter aktif saat ini, tanpa menghapus riwayat.

Riwayat saldo nol menampilkan 17.877 SDM dengan kewajiban positif, sisa Rp0. Daftar pemeriksaan menampilkan 350 SDM berkewajiban positif; 436 adalah jumlah keseluruhan identitas yang ditahan termasuk yang tidak mempunyai kewajiban positif. Penerimaan terverifikasi tetap Rp0; keberadaan NTPN sumber tidak otomatis mengubahnya.

## Rilis dan verifikasi

- Commit rilis `c7d0d336d67047059da6f374a7439255a8ab6782`. Dua commit lokal yang belum pernah dipush digabung setelah contoh NTPN nyata dalam tes diganti kode dummy. Tidak ada kode NTPN asli/personnel workbook dipush.
- Preview `dpl_9DtFwVjizqBCXVMwCsFLTSWe3zFi`, READY: https://pengembalian-288216b52-diofajruliman-glitch.vercel.app/.
- Produksi `dpl_EUBdwdQW6MgkDQ7PSJhdyjbX1owU`, READY, main: https://pengembalian.vercel.app/.
- Flag metadata diaktifkan pada preview branch dan produksi setelah ekstensi siap. Akses/proteksi Vercel tidak diubah.
- 68 tes dan build sebelumnya lulus; setelah penggantian contoh NTPN, 5 tes metadata terkait diulang dan lulus. Uji workbook lengkap pada database lokal telah membuktikan nominal sama sebelum aktivasi.
- Preview dan produksi diperiksa dengan sesi admin sebenarnya. Monitoring 37 SDM/revisi 3, fokus kegiatan terkait, riwayat saldo nol dan daftar pemeriksaan berfungsi. Rencana Aksi meninggal menghitung 14 SDM; resign/pensiun 23 SDM. Bottleneck mengikuti kelompoknya.
- Ekspor preview dari data tersimpan diperiksa: 37 SDM, NIP teks, sisa Rp64.140.566, tag Belum Lunas, 15 SDM mempunyai referensi NTPN sumber. Console alur yang diuji tanpa error.
- HTTP produksi 200, asset versi baru. Pemeriksaan terakhir: nominal keseluruhan tetap, 80 tautan, 567 audit, seluruh sidik data manual sama seperti sebelum aktivasi. Tidak diklaim pemeriksaan seluruh log runtime Vercel.

Langkah lanjutan adalah pemeriksaan sumber bermasalah, terutama 3 SDM yang sebelumnya termasuk sasaran tindak lanjut. Data yang ditahan dan riwayat lunas tetap tersedia; aplikasi tidak membuat keputusan kepegawaian atau verifikasi bukti penerimaan otomatis.
