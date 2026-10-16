# Tahap 27 — Aktivasi Supabase dan deployment integrasi

10 Oktober 2026. Paket integrasi sudah aktif pada proyek Supabase `tagokvlsirebfgltbxmq`; aplikasi utama sudah dirilis.

## Aktivasi database

`recovery-integration-activation.sql` dijalankan sekali pada SQL Editor proyek yang sudah digunakan. Hasil: Success, no rows returned. Pemeriksaan sesudahnya memastikan 19 tabel privat memiliki RLS dan skema privat tetap tidak dapat dipakai langsung oleh anon/authenticated. Tiga RPC tidak dapat dieksekusi anonim. Enam tabel tambahan kosong; aktivasi tidak menetapkan status atau membuat penghubungan.

Sebelum dan sesudah aktivasi/deployment:

- Pegawai tersimpan 32.779; pembayaran 27.048; revisi master 1.
- Kewajiban Rp5.837.623.999, pengembalian tercatat Rp3.641.947.218, sisa Rp2.195.676.781.
- Profil 3, Rencana Aksi 15, Bottleneck 10 termasuk arsip, kasus khusus 0.
- Sidik seluruh baris profil, kegiatan, Bottleneck, rekap bank, dan kasus dibandingkan dan identik. Satu Bottleneck yang sudah diarsipkan tetap diarsipkan; halaman menampilkan sembilan kategori aktif.
- Probe role di dalam transaksi yang di-rollback: admin dapat membaca metadata penghubungan dan mencapai validasi status; editor ditolak kedua RPC baru. Tidak menulis data pengguna atau mengubah hak akses.

## Deployment

Commit aplikasi `0116558d28010d411c2acc31e13781f46295f69d` mempertahankan perubahan dashboard pengguna dari 797ccb4 dan 1cc8002.

- Preview: `dpl_gbRkxWBS9E4ywNmdL5fPezudyWub`, READY, branch `feature/master-import-staged`.
- Production: `dpl_Frx6Ymzdz2j6r8EzwZnaWcS5bBbg`, READY, branch `main`, commit yang sama.
- URL utama: https://pengembalian.vercel.app/
- Preview: https://pengembalian-m6xo2d22w-diofajruliman-glitch.vercel.app/

Main diperbarui dengan fast-forward, tanpa force push. Konfigurasi URL/key Supabase yang sudah ada dipertahankan. Kedua environment memakai `production-master`, `VITE_RECOVERY_SDM_MODE=production-sdm`, dan `VITE_RECOVERY_FOLLOWUP_MODE=production-followup`. Preview dibatasi pada branch fitur tersebut. Tidak ada perubahan akses master untuk editor/viewer.

## Pemeriksaan yang berhasil

- 62 pengujian lokal lulus dan build berhasil sebelum release. Uji gabungan workbook asli telah lulus pada tahap 26; simulasi tidak dikirim ke produksi.
- Pengguna login admin di preview. Dashboard menunjukkan total master yang benar dan sumber master produksi tersimpan. Monitoring SDM menunjukkan 20.176 pegawai dengan kewajiban positif.
- Tahun 2025: 17.321 pegawai, kewajiban Rp3.891.595.790, pengembalian Rp2.911.320.431, sisa Rp980.275.359.
- Tahun 2026: 5.486 pegawai, kewajiban Rp1.946.028.209, pengembalian Rp730.626.787, sisa Rp1.215.401.422.
- Metadata penghubungan Rencana Aksi dan Bottleneck dapat dibaca melalui UI; nol hubungan sesuai tabel server. Filter BRI menunjukkan 346 pegawai dengan kewajiban positif untuk pemilihan.
- Workbook asli diperiksa secara lokal melalui worker di preview: 117 NIP/nama cocok dengan master tersimpan, 9 nama berbeda ditahan, 139 belum cocok ditahan. Tombol menyiapkan batch status tersedia; tidak ditekan dan tidak menyimpan status.
- Aplikasi utama dimuat ulang dengan sesi admin: dashboard, Monitoring SDM, Rencana Aksi, dan Bottleneck integrasi tersedia dengan angka yang cocok. Console error diperiksa pada alur yang digunakan.
- HTTP utama 200; judul TukinUMrecovery; `nosniff` dan `DENY`. Asset utama `/assets/index-CjGJMJbT.js` memuat modul RPC/status/penghubungan.

Bukti lokal berada di `.local-analysis/production-integration-dashboard.jpg`, `preview-integration-dashboard-verified.jpg`, dan laporan pemeriksaan before/after/permissions/role/final. Semua diabaikan Git.

## Data yang masih menunggu tinjauan

Status 117 pegawai belum disimpan, dan belum ada hubungan pegawai ke kegiatan/kategori. Admin perlu membuka Pratinjau Excel Master, memeriksa workbook asli, menyiapkan batch status, membuka seluruh halaman, lalu menyetujui dengan alasan. Hubungan Rencana Aksi/Bottleneck ditetapkan eksplisit setelah tinjauan. Sembilan nama berbeda dan 139 NIP belum cocok perlu rekonsiliasi sumber.

Penulisan status/penghubungan produksi belum diuji dengan data sementara atau fixture; jalur penulisan sudah diuji atomik pada PostgreSQL lokal dengan skema lengkap dan workbook asli. Penerimaan tetap belum diverifikasi bukti: terverifikasi 0. Tidak ada pembayaran Rp1 simulasi atau pegawai simulasi di produksi.
