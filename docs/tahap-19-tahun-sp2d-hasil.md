# Tahap 19 — Tahun SP2D dalam workbook dasar

10 Oktober 2026. Pengguna memastikan SP2D ada pada workbook dasar. Pemeriksaan ulang menemukan kolom tahun SP2D pada empat sheet tersembunyi. Pemeriksaan sebelumnya berfokus pada tiga master bank dan belum memetakan sheet pendukung tersebut.

| Sheet | Kolom | Baris sumber | Tahun 2025 | Tahun 2026 | Cocok dengan master | Perlu tinjauan |
|---|---|---:|---:|---:|---:|---:|
| Sheet12 | C, Tahun Sp2d UPDATE | 5.125 | 4.452 | 673 | 4.745 | 380 |
| DATA DEBET TAHAP IV | C, Tahun Sp2d | 1.344 | 1.118 | 226 | 1.341 | 3 |
| Sheet1 | C, Tahun Sp2d | 20.176 | 17.583 | 2.593 | 18.645 | 1.531 |
| Hasil debet tahap III | C, Tahun Sp2d | 1.300 | 1.087 | 213 | 1.298 | 2 |

Angka di tabel merupakan baris setiap sumber, bukan jumlah SDM unik gabungan: SDM dapat muncul pada beberapa tahap. Pencocokan memerlukan NIP teks 18 digit, nama dan bank sama, serta kewajiban positif untuk tahun terkait pada master bank. Ketidakcocokan tidak otomatis menjadi kewajiban, tidak mengubah identitas master dan tidak menghapus transaksi.

Pratinjau impor kini menampilkan bagian Tahun SP2D — pemeriksaan sumber. Worker membaca empat sheet pendukung yang dikenali, menghasilkan ringkasan tahun serta jumlah tinjauan. Ringkasan ini tidak dikirim dalam payload impor database; tidak membuat dokumen SP2D atau alokasi nominalnya. Nominal tetap dari tiga master bank yang direkonsiliasi: kewajiban 5.837.623.999 dan pengembalian 3.641.947.218.

Kolom nomor SP2D dan tanggal penerbitan belum ditemukan dalam pemeriksaan header workbook. Kolom tanggal proses debet/hold, tanggal BAO, dan kode pada header tahap tidak ditafsirkan otomatis sebagai tanggal/nomor SP2D. Data tahun yang ditemukan tidak menyatakan penerimaan sudah terverifikasi.

50 tes otomatis lulus dan build berhasil. Tes baru menegaskan NIP numerik, tahun kosong, duplikasi, dan ketidakcocokan identitas ditahan; hasil pemeriksaan tidak mengubah saldo/payload atau menciptakan tanggal dan nomor dokumen. Parser juga dijalankan pada workbook asli dengan hasil tabel di atas. Perubahan ditujukan ke preview; master produksi belum diaktifkan.

Deployment preview dpl_HwSzzMBgFvxaJd9LpSLT3wNPhazS berstatus READY, commit 88c84a5. Uji browser dengan sesi admin asli dan workbook dasar menampilkan tabel dengan hasil identik; 32.779 SDM tetap lolos rekonsiliasi master bank. Tidak ditemukan console error pada alur yang diperiksa. Bukti lokal: .local-analysis/sp2d-years-online-pass.jpg. Ringkasan SP2D tetap lokal dan tidak ada perubahan schema atau data Supabase pada tahap ini.
