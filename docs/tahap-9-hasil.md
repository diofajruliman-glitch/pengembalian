# Tahap 9 — master tersimpan setelah refresh

Preview deployment dpl_6ZASnmXRWDyh4ugLCtGfxMFzPqV2 READY, commit 91a4669. API pengujian yang sama diperbarui dengan pembacaan metadata dan halaman master. Tetap admin-only dan hanya membaca recovery_test.

Master & Progres otomatis memuat data tersimpan saat tidak ada snapshot lokal. Pengguna dapat memilih master pengujian tersimpan atau pratinjau file sesi ini, memuat ulang dan membuka impor. Data dibaca per 500 SDM dengan urutan NIP, lalu nomor revisi dan jumlah SDM diperiksa. Perubahan revisi/kegagalan jaringan tidak ditampilkan sebagai saldo nol atau snapshot sebagian.

32 tes otomatis lulus, build berhasil. Uji browser setelah refresh tanpa unggah workbook berhasil: 3 SDM simulasi, kewajiban 100.800, pengembalian 25.020, sisa 75.780, terverifikasi 0. Data dimuat dari Supabase revisi 3, bukan snapshot Excel lokal.

Filter BRI/2025/TUKIN/Tahap I menampilkan kewajiban 100, pengembalian 10, sisa 90. XLSX hasil unduhan dibaca ulang dan cocok: satu SDM, satu transaksi, NIP teks 18 digit serta tahun/jenis/tahap sesuai filter. Tidak ditemukan console error pada halaman yang diuji.

Tidak ada promosi produksi atau impor data asli. Seluruh angka di schema pengujian berasal dari simulasi. Masih perlu uji stage tambahan/koreksi melalui browser, concurrency lintas koneksi dan performa workbook lengkap, lalu pemetaan nonaktif/SP2D/bukti/tanggal serta integrasi kasus manual sebelum master produksi aktif.
