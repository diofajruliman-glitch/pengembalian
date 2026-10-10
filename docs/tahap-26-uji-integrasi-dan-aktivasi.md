# Tahap 26 — Uji integrasi lengkap dan paket aktivasi

10 Oktober 2026. Semua aktivitas tahap ini lokal. Tidak ada perubahan Supabase produksi, environment Vercel, push Git, atau deployment.

## Hasil uji bersama

Pengujian memakai `supabase/schema.sql` lengkap di PostgreSQL lokal, termasuk RLS, trigger waktu/audit, tiga role, sepuluh Bottleneck, lima belas Rencana Aksi, rekap bank, kasus manual, master produksi, serta kedua ekstensi. Dua kegiatan sengaja ditandai selesai sebelum pengujian untuk memastikan integrasi tidak mengembalikan perubahan pengguna.

Alur yang lolos: impor workbook dasar, penetapan status SDM, penghubungan pegawai ke kedua jenis tindak lanjut, referensi kasus khusus, impor tahap baru, pemuatan progres terbaru, serta penolakan duplikasi/histori hilang. Semua isi profil, kegiatan, Bottleneck, rekap bank, dan kasus manual dipertahankan. Schema pengujian terpisah tidak berubah. Editor/viewer tetap tidak dapat mengakses ketiga RPC master/status/penghubungan.

## Kendala yang diperbaiki

Penetapan status SDM menaikkan revisi master. Sebelumnya, impor yang sudah disiapkan pada revisi lama tetap ditolak dan tidak dapat disiapkan ulang dengan hash file yang sama.

Fungsi `recovery_begin` kini mempertahankan retry pada revisi yang sama, tetapi menandai batch belum disimpan yang kedaluwarsa sebagai rejected dan membuat ID batch baru. Manifest file harus tetap sama; file yang sudah committed tetap ditolak. Staging lama dipertahankan, tidak disalin sebagai transaksi. Batch baru harus divalidasi dan ditinjau ulang; persetujuan lama tidak diteruskan.

UI menyediakan tombol menutup tinjauan untuk menyiapkan ulang, yang mengosongkan alasan, pilihan persetujuan, dan halaman tinjauan. Tombol ini tidak membatalkan commit yang sudah terjadi. Jika respons jaringan tidak pasti, muat ulang master sebelum menyiapkan ulang. Input alasan/persetujuan terkunci saat operasi berjalan.

Generator produksi dan patch resume diperbarui. Pada produksi gunakan paket gabungan baru, bukan menjalankan ulang aktivasi master dasar.

## Workbook asli

`scripts/test_integrated_full_workbook.mjs` membaca file asli dari argumen jalur; tidak melakukan koneksi jaringan atau menulis database produksi. File asli tidak dimodifikasi dan data pribadi tidak dimasukkan ke Git.

- 32.779 pegawai dan 158.164 record berhasil masuk database lokal.
- 20.176 pegawai dengan kewajiban positif; kewajiban Rp5.837.623.999, pengembalian tercatat Rp3.641.947.218, sisa Rp2.195.676.781, terverifikasi 0.
- 117 status nonaktif berhasil disimpan tanpa mengubah angka tersebut. Dari status BUP yang cocok, 28 pegawai memiliki kewajiban positif.
- 9 nama berbeda dan 139 NIP belum cocok tetap tidak disimpan.
- Satu pembayaran **sintetis Rp1** ditambahkan pada bank BRI hanya di database lokal, untuk membuktikan bahwa saldo/progres terbaru muncul pada Rencana Aksi, Bottleneck dan kasus terkait. Angka setelah simulasi bukan angka produksi atau transaksi bank sebenarnya.
- Pengulangan file sintetis ditolak dan 117 status tetap tersimpan setelah impor berikutnya. Data manual tidak berubah.
- Waktu lokal sekitar 57 detik; bukan ukuran kinerja server Supabase.
- Laporan agregat `.local-analysis/integrated-full-workbook-result.json` diabaikan Git.

## Paket siap ditinjau untuk aktivasi

`supabase/recovery-integration-activation.sql` menggabungkan:

1. Perbaikan prepare/retry batch master.
2. Ekstensi status SDM nonaktif.
3. Ekstensi penghubungan Rencana Aksi/Bottleneck.

Seluruhnya berada dalam satu transaksi. Pengujian sengaja menyebabkan kegagalan setelah tabel/fungsi dibuat: semua ekstensi dibatalkan dan data lama tetap utuh. Sesudah paket sukses, 19 tabel privat memiliki RLS (13 yang sudah ada dan 6 baru). Ketiga RPC tidak dapat dieksekusi anonim; tabel privat tidak dapat dibaca langsung oleh authenticated. Aktivasi ulang ditolak tanpa perubahan data.

Paket tidak mengimpor workbook, menetapkan status, membuat penghubungan, atau menyelesaikan kegiatan. Data baru hanya disimpan melalui tinjauan admin setelah fitur diaktifkan.

## Urutan aktivasi berikutnya

1. Pada proyek Supabase yang sudah digunakan, periksa bahwa RPC master tersedia dan kedua ekstensi belum ada. Paket akan menolak jika skema privat terbuka atau ekstensi sudah pernah dibuat.
2. Jalankan **hanya** `recovery-integration-activation.sql`. Jangan menjalankan `schema.sql` atau `recovery-production-activation.sql` lagi pada database berisi master. Jika gagal, selesaikan kendala sebelum melanjutkan.
3. Verifikasi: enam tabel baru kosong, RLS aktif, hak baca langsung tidak terbuka, revisi/jumlah pegawai/nominal dan isi kegiatan lama tetap sama.
4. Pertahankan konfigurasi master/URL/key yang sudah ada. Aktifkan `VITE_RECOVERY_SDM_MODE=production-sdm` dan `VITE_RECOVERY_FOLLOWUP_MODE=production-followup` pada environment yang akan diuji; deploy kode integrasi ke preview dahulu.
5. Periksa alur dengan akun admin di preview yang menggunakan database yang benar. Status dan penghubungan produksi tetap memerlukan tinjauan serta alasan. Jangan menjalankan fixture/simulasi lokal terhadap database produksi.
6. Jika semua pemeriksaan berhasil, lanjutkan deployment utama lalu periksa kembali dashboard dan Monitoring SDM.

Langkah di atas belum dijalankan pada produksi dalam tahap ini.

## Validasi akhir

- Suite penuh: 62 pengujian lulus, 0 gagal.
- Pengujian gabungan workbook asli lulus dengan laporan agregat.
- Build berhasil; peringatan ukuran chunk Vite >500 kB masih ada.
- Browser lokal: penolakan batch stale, menutup tinjauan, menyiapkan ulang dengan persetujuan kosong, dan commit simulasi baru berhasil. Console error kosong.
- Bukti `.local-analysis/restage-integration-proof.jpg` dan `restage-complete-proof.jpg` adalah simulasi tanpa koneksi produksi.
