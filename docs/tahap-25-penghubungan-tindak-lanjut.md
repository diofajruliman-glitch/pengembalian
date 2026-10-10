# Tahap 25 — Rencana Aksi dan Bottleneck terhubung ke master

10 Oktober 2026. Implementasi lokal, belum dipush, diaktifkan di Supabase, atau dideploy.

## Hasil

Panel penghubungan tersedia pada halaman Rencana Aksi dan Matriks Bottleneck untuk admin. Admin memilih kegiatan/kategori dan pegawai dari master produksi tersimpan berdasarkan NIP. Pencarian dan filter bank/tahun SP2D/jenis membantu pemilihan; hasil kelompok dapat dipilih eksplisit, maksimal 500 per tinjauan. Hubungan berlaku pada pegawai; filter tahun tidak membuat alokasi transaksi ke kegiatan.

Ringkasan pegawai terkait menampilkan kewajiban, pengembalian tercatat, sisa, dan penerimaan terverifikasi dari snapshot master terbaru. NIP yang sama dalam satu kegiatan dihitung sekali. Pegawai dapat terkait beberapa kegiatan; nominal antar kegiatan tidak dijumlahkan sebagai total tagihan. Tidak ada penetapan hubungan otomatis dari teks kategori atau status nonaktif.

Admin dapat menampilkan hanya SDM terkait, meninjau seluruh halaman sebelum menyimpan, atau melepas hubungan dengan alasan. Pelepasan diarsipkan dan diaudit; pegawai, transaksi, dan kegiatan tetap ada. Pelepasan seluruh hubungan juga tersedia untuk kelompok sampai 500 pegawai, termasuk referensi yang tidak lagi tampil sebagai kandidat dengan kewajiban positif.

Ekspor XLSX mengikuti filter dan memiliki tiga sheet: SDM terkait, riwayat pembayaran seluruh tahap untuk filter tahun/jenis, dan konteks laporan (kegiatan/kategori, PIC, tenggat, status kegiatan, revisi dan filter). Referensi yang tidak tersedia membuat ringkasan berlabel belum lengkap dan mengunci ekspor nominal.

PIC, tanggal target, progres kegiatan, dan status kegiatan yang sudah ada dipertahankan. Pembayaran 100% dalam master tidak otomatis menyelesaikan kegiatan atau memverifikasi bukti.

## Paket aktivasi

`supabase/recovery-followup-activation.sql` menambahkan empat tabel privat dengan RLS: hubungan, revisi hubungan, penerimaan permintaan idempoten, dan audit. RPC `public.recovery_followup_rpc(text,jsonb)` memeriksa admin; akses tabel langsung dan akses RPC anonim dicabut. Tidak mengganti RPC master yang sudah aktif.

Konfigurasi `VITE_RECOVERY_FOLLOWUP_MODE=production-followup` tetap OFF secara default. Sebelum mengaktifkan, tinjau dan terapkan paket SQL. Akses editor/viewer tidak diperluas.

Penyimpanan memeriksa revisi master, revisi hubungan, `updated_at` kegiatan/kategori, status arsip, identitas NIP dan kewajiban positif. Server melakukan perubahan atomik. ID permintaan yang sama dan payload identik mengembalikan hasil tersimpan tanpa audit ganda; payload/aktor berbeda ditolak. Retry pada UI mempertahankan ID dan alasan yang sama. Batch lama yang berubah konteksnya perlu dibatalkan dan ditinjau ulang.

## Validasi

- Suite penuh: 60 pengujian lulus, 0 gagal. Termasuk hubungan kedua jenis target, nilai mengikuti pembayaran baru, per tahun, tidak menggandakan NIP, referensi hilang, pembacaan tidak lengkap, add/remove/restore, retry, payload/aktor berbeda, perubahan master/kegiatan, kegiatan diarsipkan, zero-only obligation, RLS dan admin-only.
- Pengujian SQL lokal memastikan nominal, revisi master, PIC, status, dan progres kegiatan tetap utuh. Perubahan hubungan memiliki revisinya sendiri.
- Build berhasil; peringatan Vite chunk >500 kB tetap ada.
- Browser lokal tanpa koneksi produksi: penghubungan Rencana Aksi menampilkan kewajiban 300, pengembalian 10, sisa 290; simulasi tahap baru membuat pengembalian 30 dan sisa 270, tanpa mengubah PIC/status. Penghubungan Bottleneck serta pelepasannya berhasil; pegawai dan saldo masih ada sesudah pelepasan. Console error kosong pada pemeriksaan tersebut.
- Ekspor browser `TukinUMrecovery-action-1-SDM-terkait.xlsx` dibaca kembali: NIP teks, kewajiban 300, pengembalian 30, sisa 270, terverifikasi 0, status BUP, dua pembayaran/tahap, PIC tetap.
- Bukti lokal `.local-analysis/followup-integration-proof.jpg` dan `followup-unlink-proof.jpg`; simulasi dan bukti diabaikan Git.

## Batas dan lanjutan

Belum ada hubungan baru atau perubahan data produksi. Integrasi status nonaktif tahap 24 dan penghubungan tahap 25 sama-sama memerlukan aktivasi SQL serta konfigurasi sebelum dapat dipakai online. Setelah paket diuji dengan skema aplikasi lengkap, lanjutkan peninjauan dan pengaktifan bertahap, lalu pemeriksaan alur dengan sesi admin produksi.
