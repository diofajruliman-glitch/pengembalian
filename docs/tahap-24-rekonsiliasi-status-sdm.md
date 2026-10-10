# Tahap 24 — Rekonsiliasi status SDM nonaktif

10 Oktober 2026. Implementasi lokal; belum dipush, dideploy, atau diaktifkan di Supabase.

## Alur

1. Admin memuat master tersimpan dan memeriksa workbook asli yang memuat `master tidak aktif`.
2. Daftar nonaktif dicocokkan ulang dengan identitas dalam snapshot database, bukan hanya dengan sheet bank workbook yang diunggah.
3. Hanya NIP, nama yang cocok setelah normalisasi spasi/huruf, dan bank yang sesuai dapat disiapkan ke batch. Nama berbeda, NIP ambigu, dan belum cocok ditahan. Semua masalah sumber harus diselesaikan sebelum menyiapkan batch.
4. Server memeriksa ulang identitas dan revisi master, serta membekukan status sebelum/sesudah dalam batch. Admin membuka seluruh halaman dan memberikan alasan persetujuan.
5. Commit atomik hanya mengubah `recovery_people.status_sdm`, menambah audit status, dan menaikkan revisi master. Tidak mengubah nama, bank, kewajiban, pembayaran, atau kasus khusus. Data yang tidak muncul dalam file tidak otomatis menjadi aktif.
6. Master dimuat ulang; status tersedia sebagai filter Monitoring SDM dan kolom ekspor XLSX.

## Aktivasi yang disiapkan

`supabase/recovery-sdm-status-activation.sql` membuat dua tabel privat dengan RLS dan RPC `public.recovery_sdm_rpc(text,jsonb)` yang memeriksa admin. Akses langsung tetap dicabut. RPC master yang sudah aktif tidak diganti. Audit menyimpan status sebelum/sesudah, data mentah sumber, pengguna, alasan, dan waktu. Tanggal angka Excel dipertahankan mentah, tidak dikonversi atau diasumsikan sebagai tanggal efektif.

Konfigurasi `VITE_RECOVERY_SDM_MODE=production-sdm` tetap OFF secara default. Harus diaktifkan hanya setelah paket SQL ditinjau dan diterapkan. Pembacaan status menggunakan RPC master yang sudah ada, karena `status_sdm` sudah disertakan dalam hasil pembacaan pegawai. Tidak ada perluasan akses ke editor/viewer.

Batch terikat pengguna dan hash sumber. Pengulangan prepare/commit tidak menggandakan perubahan untuk batch yang sama. Batch yang revisinya tertinggal ditolak; tinjauan baru menghasilkan ID baru dan menonaktifkan batch lama. Commit dapat diulang dengan ID yang sama jika respons jaringan hilang.

## Workbook asli

File asli dibaca kembali secara lokal. Hasil simulasi dengan identitas master dari workbook:

- 265 catatan nonaktif; 126 cocok NIP.
- 117 cocok NIP dan nama: 38 mengundurkan diri, 43 meninggal dunia, 36 BUP; 0 SP3 lolos kedua syarat.
- 9 nama berbeda dan 139 belum cocok tetap ditahan.
- 0 masalah parsing.
- Simulasi perubahan status mempertahankan kewajiban Rp5.837.623.999, pengembalian Rp3.641.947.218, sisa Rp2.195.676.781, terverifikasi 0.

Ini simulasi lokal, bukan pembacaan ulang atau perubahan database produksi. Data mentah serta laporan pemeriksaan berada di `.local-analysis/`, tidak dikirim ke Git.

## Validasi

- Suite penuh: 57 pengujian lulus, 0 gagal sebelum perbaikan akhir batch stale/kolom ekspor; delapan pengujian terkait diulang sesudahnya dan lulus.
- Pengujian PostgreSQL lokal: hanya status berubah, audit satu kali pada retry, batas identitas/status/duplikasi, penolakan revisi lama, batch baru untuk tinjauan ulang, kepemilikan batch, rollback jika satu pegawai tidak lagi valid, RLS dan larangan editor/anon.
- Browser lokal memakai 18 identitas simulasi, tanpa koneksi database: 16 lolos, 1 nama berbeda, 1 belum cocok. Checkbox terkunci sampai halaman terakhir; alasan + persetujuan memungkinkan commit simulasi. Tidak ada error console.
- Bukti lokal: `.local-analysis/nonactive-status-proof.jpg`.

## Lanjutan

Pengaktifan Supabase dan deployment belum dilakukan. Sembilan nama berbeda dan 139 NIP belum cocok perlu pemeriksaan sumber. Penghubungan Rencana Aksi/Bottleneck ke pegawai master tetap tahap berikutnya; tidak ada pembuatan kasus khusus otomatis dalam tahap ini.
