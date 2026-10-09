# Tahap 10 — pengembalian bertahap dan koreksi, tanpa deploy

Pengujian dilakukan pada preview yang sudah ada, melalui akun admin dan data simulasi di recovery_test. Tidak ada git push, deployment Vercel, impor Excel asli, atau penerapan patch SQL baru pada tahap ini.

| Skenario browser | Hasil |
| --- | --- |
| Tambah kolom Tahap II | Tiga transaksi baru, pembayaran total 25.020 menjadi 30.070. Tahap I dipertahankan. |
| Impor ulang file yang sama | Ditolak FILE_ALREADY_COMMITTED. Tidak menambah transaksi. |
| Koreksi Mandiri Tahap I 25.000 menjadi 20.000 | Before/after terlihat, alasan wajib; total pembayaran 25.070. |
| Tahap II kosong | Commit ditolak LIVE_RECAP_MISMATCH_MISSING_HISTORY_REQUIRES_REVIEW. Data lama tidak dihapus. |
| Koreksi eksplisit Tahap I menjadi 0 | Berhasil dengan workbook pembanding; tahap II dipertahankan. Total pembayaran 5.070. |

Server mengonfirmasi enam transaksi (tiga SDM x dua tahap), dua audit koreksi dengan alasan, kewajiban 100.800, pembayaran 5.070 dan saldo 95.730. Master tersimpan dimuat pada revisi 6. Jumlah data utama tetap 3 profil / 10 bottleneck / 15 aksi / 0 kasus.

Ditemukan perbaikan: histori kosong baru terdeteksi saat commit pada versi server. Patch lokal membuat validasi menolak pembayaran historis positif yang tidak disertakan, sebelum tombol commit ditawarkan. Patch tidak diterapkan ke server dan tidak deploy. File patch yang disiapkan: supabase/recovery-isolated-validation-update.sql.

33 tes otomatis lulus. Tes tambahan menjalankan workbook parser → staging PostgreSQL → commit → baca saldo, mencakup kolom tahap tambahan, file berulang, koreksi, nol, sel kosong dan kolom tahap dihapus. Uji rollback tetap mencakup kegagalan alokasi SP2D setelah perubahan dimulai.

Batas: koreksi nol saat ini membutuhkan workbook pembanding untuk mempertahankan record nol yang sebelumnya positif. Tanpa pembanding, commit/validasi menahan ketidaksesuaian saldo; belum ada penarikan histori database untuk membantu parser nol. Pesan error server masih teknis. Concurrency lintas koneksi, file penuh, nonaktif/SP2D/bukti/tanggal dan integrasi kasus manual belum selesai.

Langkah berikutnya yang disarankan: perjelas pesan koreksi/histori kosong dan kebutuhan pembanding, kemudian integrasikan status SDM nonaktif dari Excel berdasarkan NIP. Tetap tanpa deployment sampai diminta pengguna.
