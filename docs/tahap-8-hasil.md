# Tahap 8 — API server dan impor browser ke schema pengujian

API public.recovery_test_rpc telah diterapkan pada proyek Supabase tagokvlsirebfgltbxmq setelah persetujuan pengguna. Wrapper admin-only meneruskan lima operasi impor ke recovery_test. Tidak memberikan hak schema/tabel langsung kepada authenticated dan tidak menulis ke tabel utama public.

Preview branch feature/master-import-staged memakai VITE_RECOVERY_IMPORT_MODE=isolated-test. Produksi tetap tidak memakai mode tersebut. Deployment dpl_BddRpJr2YDNQUgGNxofxLrSih3Y8 READY, commit 1aae4df.

Alur browser diuji dengan sesi login admin asli dan workbook simulasi tiga SDM: parser → begin/append/validate → diff database → alasan dan tinjauan → commit. Pesan sukses tampil setelah respons commit. Server mengonfirmasi 3 SDM simulasi, kewajiban 100.800, pembayaran 25.020, saldo 75.780. Jumlah tabel utama tetap profiles 3 / bottlenecks 10 / action_plans 15 / sdm_cases 0.

29 tes otomatis lulus dan build berhasil. Data workbook asli belum dikirim ke server. Tampilan pemberitahuan diperjelas untuk membedakan file asli yang dibaca lokal dari hasil pembacaan yang dikirim saat menyiapkan batch pengujian.

Batas: daftar Master & Progres masih memakai snapshot sesi; belum memuat ulang master tersimpan setelah refresh. Concurrency lintas koneksi, performa file asli lengkap, JWT editor/viewer di server, bukti/tanggal/SP2D dan penggabungan kasus manual masih perlu verifikasi/implementasi. Tidak ada promosi deployment produksi.
