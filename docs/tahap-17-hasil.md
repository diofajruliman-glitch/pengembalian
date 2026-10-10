# Tahap 17 — Aktivasi API referensi kasus pada Supabase

Tanggal: 10 Oktober 2026.

## Hasil

Dengan persetujuan pengguna, `supabase/recovery-case-test-activation.sql` dijalankan pada proyek Supabase yang sudah digunakan (`tagokvlsirebfgltbxmq`). Eksekusi berhasil dalam satu transaksi. Empat tabel referensi/audit dan API `public.recovery_case_test_rpc(text,jsonb)` tersedia. Tidak ada deploy, push Git, impor workbook asli, ataupun perubahan kasus utama.

## Verifikasi server

- Prasyarat sebelum aktivasi: tabel referensi belum ada; kasus SDM 0, profil 3, bottleneck 10, rencana aksi 15.
- Sesudah aktivasi: 13 tabel pada schema recovery_test memiliki RLS. Pengguna authenticated tidak memiliki akses langsung ke schema; anon tidak memiliki izin eksekusi API.
- SQL dengan role authenticated dan klaim identitas admin membaca metadata revisi master 6, jumlah kasus 0, serta daftar kasus kosong.
- SQL dengan role authenticated dan klaim identitas editor menghasilkan FORBIDDEN, sesuai pemeriksaan yang secara eksplisit menolak hasil lain.
- Permintaan REST memakai publishable key tanpa sesi login menghasilkan HTTP 401, kode 42501, permission denied for function recovery_case_test_rpc.
- Jumlah data utama tetap sama: 3 profil, 10 bottleneck, 15 rencana aksi, 0 kasus SDM.
- Bukti layar lokal: `.local-analysis/case-api-server-activation.jpg` (diabaikan Git).

## Batas verifikasi dan langkah berikutnya

Pengujian role melalui SQL menggunakan klaim identitas yang disimulasikan dalam transaksi dan rollback; ini bukan pengujian sesi JWT login aplikasi. Penyimpanan referensi kasus nyata di server belum dapat diuji karena public.sdm_cases kosong. Tidak ada kasus sintetis yang ditambahkan ke tabel utama. Jalur penyimpanan sukses dan perlindungan aktivasi berulang sudah diuji secara lokal pada tahap sebelumnya.

Berikutnya adalah uji dari aplikasi lokal dengan sesi admin asli dan kasus yang telah ditinjau, lalu kelengkapan sumber nomor/tanggal/tahun SP2D, uji skala server, serta UAT. Aktivasi API ini tidak menyatakan aplikasi sudah siap produksi. Larangan deploy tetap berlaku.
