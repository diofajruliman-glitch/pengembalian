# Tahap 18 — Versi terbaru online pada deployment preview

Tanggal: 10 Oktober 2026. Pengguna meminta melanjutkan sampai online/deploy, sehingga larangan deploy sebelumnya digantikan oleh instruksi ini.

## Rilis

- Proyek Vercel: pengembalian, prj_TOLdPy4vttf836hUGVtEpXllltjx; akun team_Jg10E9tAWqxAf601QQTnz8jo.
- Branch: feature/master-import-staged.
- Commit aplikasi: e01cebbd009fe0543c8b9fc6b87c97a4ae36f132.
- Deployment: dpl_9mdpcGYoN1dD1qct9zWQsKoJGNtm, READY, target preview, build 10 detik.
- URL tetap: https://pengembalian-git-feature-master-imp-780419-diofajruliman-glitch.vercel.app/
- URL deployment: https://pengembalian-fi8jmlz11-diofajruliman-glitch.vercel.app/
- API referensi diaktifkan pada branch preview ini melalui VITE_RECOVERY_CASE_MODE=case-test. Mode impor tetap isolated-test. Variabel produksi tidak diubah.
- Perbaikan kecil: keterangan pratinjau hubungan menyesuaikan status API, sehingga tidak lagi menyatakan API belum aktif ketika tersedia.

## Bukti pemeriksaan

47 tes otomatis lulus, npm run build berhasil setelah perbaikan terakhir. Peringatan ukuran chunk Vite di atas 500 kB tidak menggagalkan build.

Sesi admin asli yang sudah login pada URL preview tetap bekerja setelah refresh. Halaman Master & Progres memuat Supabase revisi 6 dengan tiga SDM simulasi: kewajiban 100.800, pengembalian sumber 5.070, sisa 95.730, terverifikasi 0. Halaman hubungan kasus memuat master dan daftar kasus kosong; tombol persiapan batch dinonaktifkan saat tidak ada kasus. Tombol Muat monitoring referensi tersimpan berhasil memanggil API melalui sesi autentikasi aplikasi dan menampilkan 0 kasus tanpa error. Ini melengkapi pengujian pembacaan JWT nyata yang sebelumnya belum dilakukan; jalur simpan kasus nyata tetap belum diuji.

Workbook dasar asli dibaca melalui Web Worker di perangkat, tidak dikirim atau disimpan ke database. Hasil browser: 32.779 SDM, kewajiban 5.837.623.999, pengembalian 3.641.947.218, sisa 2.195.676.781. Peringatan selisih kolom Sisa Tagihan Mandiri tetap tampil; saldo berasal dari perhitungan seluruh tahap.

Filter BRI/tahun kewajiban 2026/TUKIN/Tahap I menampilkan 171 SDM, kewajiban 147.126.459, pengembalian 60.978.029, sisa 86.148.430. XLSX hasil unduhan dibaca kembali: 171 baris monitoring dan 171 transaksi, nominal sesuai tampilan, seluruh NIP teks 18 digit, jenis/tahun/tahap sesuai filter. Pembayaran BRI pada sumber ini berlabel tahun kewajiban 2026; tidak disamakan dengan tahun SP2D atau tanggal pengembalian.

Tidak ditemukan console error pada alur browser yang diperiksa. Konektor Vercel menolak akses log build dengan 403; CLI Vercel tidak tersedia lokal. Dashboard Vercel yang sudah login dapat dibuka, mengonfirmasi READY, commit, target preview dan durasi; log build dapat dilihat di sana. Tidak ada klaim bahwa seluruh log runtime Supabase atau semua tindakan tulis telah diperiksa.

## Batas rilis

Ini rilis preview untuk pengujian, bukan aktivasi master produksi. Domain produksi pengembalian.vercel.app belum dipromosikan. Schema pengujian masih berisi data simulasi; file asli hanya tersedia di memori sesi browser. Tidak ada penambahan kasus sintetis ke public.sdm_cases atau perubahan data utama oleh pemeriksaan ini.

Sumber nomor/tanggal/tahun SP2D belum diberikan; metadata tersebut tidak direka. Penyimpanan referensi kasus nyata, uji skala penuh di server, dan UAT tetap diperlukan sebelum aktivasi master produksi. Preview menggunakan proteksi Vercel yang sudah ada; pengguna mungkin perlu login Vercel sebelum login aplikasi.

Bukti layar lokal (diabaikan Git): .local-analysis/online-deployment-ready.jpg.
