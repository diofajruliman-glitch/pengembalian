# Tahap 22 — Master asli tersimpan dan aplikasi produksi online

10 Oktober 2026. Pengguna menyetujui aktivasi API khusus admin dan impor workbook dasar.

## Hasil produksi

URL utama: https://pengembalian.vercel.app/. Deployment Vercel dpl_ARZUAv6xVA9nywRqyiWkWAAxnBtK berstatus READY, target production, branch main, commit 6e92f7c9c0d27d60c4161da7a7588c5ada33c5ad. Build sekitar 9 detik. Main diperbarui dengan fast-forward; tidak ada force push. VITE_RECOVERY_IMPORT_MODE=production-master dipasang untuk production dan branch preview yang digunakan untuk verifikasi.

Schema recovery_live dan API public.recovery_master_rpc diaktifkan dalam transaksi. 13 tabel memiliki RLS; akses schema/fungsi internal untuk authenticated tetap ditolak, dan anon tidak memiliki execute pada API. Permintaan REST anonim ditolak HTTP 401/kode 42501. Pemeriksaan role editor melalui SQL juga ditolak FORBIDDEN; ini simulasi klaim identitas melalui SQL, bukan login editor di browser.

Impor menggunakan sesi admin asli pada preview yang terhubung ke master produksi. Workbook asli dibaca lokal, lalu hanya field master yang disepakati dikirim melalui staging API. Nomor rekening tidak termasuk payload.

Gangguan jaringan menghentikan percobaan pertama pada 56.000 record staging. Master final saat itu masih 0 SDM/revisi 0. Perbaikan membuat begin mengembalikan batch milik aktor yang sama untuk hash/manifest yang sama, memakai advisory lock; manifest/revisi berbeda ditolak. Transpor mencoba ulang gangguan jaringan secara terbatas pada operasi produksi yang idempotent. Batch parsial diperiksa ulang dengan pengiriman ulang yang tidak menambah record ganda, sedangkan batch tervalidasi dapat dilanjutkan tanpa append ulang. Tidak ada perubahan izin akses pada patch pemulihan.

Batch yang sama 5a5f5706-1f71-43e3-874b-3bb9fa53f543 akhirnya lolos validasi dan committed: 158.164 record = 32.779 SDM + 98.337 kewajiban + 27.048 pengembalian. Master revisi 1, audit 125.385 record. Pemeriksaan ulang workbook committed melalui browser ditolak dengan pesan FILE_ALREADY_COMMITTED; jumlah batch tetap 1, pembayaran 27.048 dan revisi 1.

## Rekonsiliasi

| Bank | Kewajiban | Pengembalian sumber | Sisa |
|---|---:|---:|---:|
| Mandiri | 4.764.218.371 | 3.474.149.260 | 1.290.069.111 |
| BRI | 803.116.138 | 64.490.329 | 738.625.809 |
| BSI | 270.289.490 | 103.307.629 | 166.981.861 |
| Total | 5.837.623.999 | 3.641.947.218 | 2.195.676.781 |

| Tahun SP2D | SDM berkewajiban positif | Kewajiban | Pengembalian sumber | Sisa |
|---|---:|---:|---:|---:|
| 2025 | 17.321 | 3.891.595.790 | 2.911.320.431 | 980.275.359 |
| 2026 | 5.486 | 1.946.028.209 | 730.626.787 | 1.215.401.422 |

Angka SQL server dan tampilan browser sama dengan workbook. Master menyimpan seluruh 32.779 SDM; monitoring nominal menghitung 20.176 SDM unik berkewajiban positif. Kosong/nol tidak masuk hitungan tahun; SDM dapat masuk kedua tahun. Penerimaan terverifikasi masih 0, terpisah dari nominal pengembalian Excel.

## Verifikasi aplikasi

- 54 tes lulus dan build lokal berhasil. Dua tes tambahan mencakup respons begin/append/commit yang hilang tanpa duplikasi ledger/audit serta pemulihan batch parsial dengan penolakan manifest berubah.
- Refresh preview tanpa workbook lokal berhasil memuat seluruh master dari Supabase; label Master produksi tersimpan/revisi 1. Filter tahun 2025/2026 sesuai tabel di atas.
- Ekspor dari master database untuk BRI/2026/TUKIN/Tahap I dibaca kembali: 171 SDM dan transaksi, total pengembalian 60.978.029, NIP teks 18 digit, serta tahun/tahap sesuai.
- API monitoring referensi produksi dapat dibaca melalui sesi admin. Daftar kasus manual masih 0; tidak ada kasus simulasi yang dibuat pada server. Penyimpanan referensi untuk kasus positif diuji pada PostgreSQL lokal dengan workbook penuh, bukan diklaim sebagai pengujian simpan kasus nyata di server.
- Data utama tetap 3 profil, 10 bottleneck, 15 rencana aksi; kasus manual tetap 0 dan recovery_test tetap berisi 3 SDM simulasi terpisah.
- URL produksi merespons HTTP 200 dengan judul aplikasi, header nosniff/DENY, bundle baru, mode produksi dan URL Supabase yang sesuai. Browser domain utama menampilkan login tanpa console error. Sesi admin end-to-end digunakan pada preview; login admin pada origin domain utama belum diuji karena belum ada sesi di origin tersebut.
- Tidak ditemukan console error pada pembacaan master/ekspor/integrasi yang diuji. Peringatan ukuran chunk Vite tetap ada. Pemeriksaan ini tidak mengklaim pemantauan seluruh log runtime atau semua alur kasus nyata.

## Pemakaian dan batas saat ini

Masuk dengan akun admin di alamat utama, lalu buka Master & Progres untuk data tersimpan, filter bank/tahun SP2D/jenis/tahap dan ekspor Excel. Workbook kumulatif tahap berikutnya disiapkan dan ditinjau sebelum commit; koreksi ke nol memerlukan pembanding dan alasan. Status nonaktif dari sheet pendukung masih merupakan tinjauan file lokal; metadata tersebut belum diimpor sebagai status produksi. Penghubungan Monitoring SDM memerlukan kasus manual yang telah ditinjau. Rekap bank terverifikasi/dashboard lama tetap mengikuti data manualnya, sedangkan progres sumber workbook tersedia pada Master & Progres. Bukti penerimaan tetap perlu diverifikasi melalui proses terpisah.

Bukti layar lokal yang diabaikan Git: .local-analysis/production-master-year-server-pass.jpg dan .local-analysis/production-deployment-ready.jpg. Workbook asli, hasil ekspor berisi NIP, serta hasil analisis mentah tidak dimasukkan ke Git.
