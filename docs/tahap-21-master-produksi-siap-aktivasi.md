# Tahap 21 — Paket master produksi siap untuk aktivasi yang ditinjau

10 Oktober 2026. Belum dijalankan pada Supabase dan belum dipromosikan ke domain produksi.

## Perubahan yang disiapkan

`supabase/recovery-production-activation.sql` membuat schema recovery_live kosong dengan 13 tabel RLS serta wrapper public.recovery_master_rpc. Hanya akun aplikasi ber-role admin yang dapat mengimpor, membaca master dan menyimpan referensi kasus melalui wrapper. Schema, tabel, sequence dan fungsi internal tidak dapat diakses langsung oleh anon/authenticated. Data simulasi recovery_test tidak disalin. Script berhenti bila schema/API produksi sudah ada; tidak mereset tabel atau memasukkan kasus buatan.

Master memakai nominal kewajiban pada kolom tahun: positif menetapkan tahun SP2D; kosong/nol tidak masuk keanggotaan tahun. Nol tetap disimpan untuk audit/koreksi. Tanggal dan nomor dokumen SP2D tidak direka dan bukan syarat bagi aturan tahun yang disepakati.

Impor awal memiliki ringkasan server jumlah SDM/kewajiban/pengembalian dan memerlukan alasan serta persetujuan tinjauan workbook/rekap. Rincian tetap dapat diperiksa. Impor berikutnya tetap meminta tinjauan seluruh halaman perubahan. Validasi server memeriksa jumlah record, rekap bank, pengembalian berlebih, revisi master, pembayaran historis yang hilang, perubahan bank dan nama. Commit atomik serta alasan/audit tetap wajib. Koreksi nominal pembayaran mengembalikan status verifikasi menjadi pending.

Referensi kasus disimpan terpisah; status, PIC, deadline, bukti, catatan dan nominal manual public.sdm_cases dipertahankan. Monitoring terhubung membaca saldo master terbaru. Revisi master dan snapshot lengkap kasus diperiksa ulang saat penyimpanan. Master bernominal total nol tidak dapat dihubungkan sebagai kewajiban kasus.

Adapter frontend produksi hanya aktif dengan VITE_RECOVERY_IMPORT_MODE=production-master pada URL proyek Supabase yang sesuai. Label tujuan membedakan produksi/pengujian; scope master harus sama dengan tujuan referensi. Environment Vercel belum diubah, sehingga persiapan ini tidak membuka master produksi di aplikasi online.

Wrapper memiliki batas statement_timeout 60 detik khusus fungsi, tanpa mengubah timeout role atau database lain. Ini mengikuti [dukungan timeout tingkat fungsi pada REST API Supabase](https://supabase.com/docs/guides/database/postgres/timeouts). Hasil aktual melalui REST server tetap perlu diuji; bila gagal, promosi produksi ditahan.

## Hasil pemeriksaan

- 52 tes lulus. Setelah penambahan konfigurasi timeout, kedua tes paket produksi dijalankan ulang dan lulus.
- Build frontend berhasil; peringatan ukuran chunk Vite tetap ada tanpa menggagalkan build.
- PostgreSQL lokal memakai workbook asli lengkap: 32.779 SDM, 158.164 record. Staging/validasi/commit/pembacaan ulang berhasil; rekap bank dan tahun sama persis. Total waktu sekitar 90,1 detik, commit 14,0 detik, pembacaan 5,0 detik. Ini bukan pengukuran performa Supabase.
- Impor ulang file sama ditolak. Kasus uji hanya dibuat di PostgreSQL lokal: referensi membaca saldo yang tepat dan seluruh data manual kasus tetap sama.
- UI lokal memakai mock tanpa koneksi Supabase: impor awal tidak dapat disimpan sebelum alasan dan persetujuan; koreksi tetap mengunci persetujuan sampai semua halaman ditinjau. Tidak ditemukan console error dalam pemeriksaan ini.
- Supabase diperiksa hanya dengan SELECT: recovery_live dan API produksi belum ada. Data yang sudah ada: 3 profil, 10 bottleneck, 15 rencana aksi, 0 kasus SDM, 3 SDM simulasi recovery_test. Bukti lokal .local-analysis/production-activation-preflight.jpg.

## Tindakan berikutnya yang membutuhkan persetujuan khusus

1. Menjalankan paket aktivasi pada https://supabase.com/dashboard/project/tagokvlsirebfgltbxmq untuk memberi akses API master khusus admin.
2. Mengimpor NIP, nama, provinsi, bank, kewajiban Tukin/UM per tahun SP2D serta pengembalian per tahap dari workbook dasar 32.779 SDM ke recovery_live, melalui staging/validasi/commit yang terpisah. Nomor rekening pada workbook tidak menjadi bagian payload master ini.
3. Memeriksa hasil server dan browser, rekap bank/tahun, pengamanan akses, pembacaan ulang dan integrasi kasus yang tersedia sebelum deploy produksi. Bila ada error, perbaiki dan uji kembali sebelum promosi.

Persetujuan API pengujian sebelumnya tidak otomatis dianggap persetujuan membuka API produksi dan mengirim data personal workbook. Tidak ada data asli yang dikirim ke server pada tahap ini.
