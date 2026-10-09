# Tahap 2 — pratinjau impor workbook

Status: lokal, belum di-push/deploy. Tidak ada perubahan database produksi.

## Fitur

Menu Pratinjau Excel Master tersedia untuk admin/editor dan pratinjau lokal. Pilih workbook terbaru dan, opsional, workbook sebelumnya. File diproses dalam Web Worker, tanpa unggahan ke server. Hasil hanya agregat: jumlah SDM, kewajiban, pengembalian Excel, sisa, rincian tahap, transaksi baru, koreksi pembayaran/kewajiban dan tahap baru. Kolom sisa lama diberi peringatan jika berbeda.

Pembandingan ini terhadap workbook yang dipilih pengguna, belum terhadap database. Tombol penyimpanan tidak tersedia. Hasil tidak otomatis menjadi penerimaan terverifikasi. Angka formula memakai hasil tersimpan di Excel; workbook tidak dihitung ulang oleh parser.

## Pengujian

- 9 pengujian otomatis lulus, termasuk kolom kosong XML, header/tahap bergeser, NIP numerik, duplikasi, koreksi nol, kelebihan bayar dan rekap dua periode.
- Pembaca yang dipakai browser diuji langsung dengan workbook asli sekitar 30 MB. Nominal ketiga bank cocok dengan rekap; 32.779 SDM, tanpa duplikasi antarbank.
- Browser lokal berhasil menampilkan pratinjau workbook asli dan rincian Mandiri I–VI, BRI I–III, BSI I–III.
- Workbook asli sebagai file terbaru dan pembanding menghasilkan nol transaksi baru, nol koreksi dan nol tahap baru untuk seluruh bank.
- Masalah memori saat uji awal diperbaiki: pratinjau tidak menyimpan ratusan ribu sel pembayaran nol, kecuali nol diperlukan untuk koreksi pembayaran lama. Uji browser setelah perbaikan lulus.
- Build lulus. Audit dependency setelah perbaikan versi fflate menunjukkan nol kerentanan yang dilaporkan.

## Batas tahap ini

Belum ada simpan atomik, audit koreksi yang tersimpan, pembandingan database, pemetaan SP2D/bukti/tanggal, impor nonaktif, atau ekspor XLSX. Detail koreksi per NIP belum ditampilkan, hanya jumlah dan selisih agregat. Semua ini tetap gerbang sebelum aktivasi penyimpanan/deployment.

Berikutnya: staging batch, preview detail koreksi, commit atomik dan pengujian role/rollback; lalu integrasi Monitoring SDM dengan master baru.
