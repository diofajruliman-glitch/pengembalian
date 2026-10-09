# Tahap 4 — master dan monitoring lokal terintegrasi

Status: lokal, belum di-push atau deploy. Tidak ada migrasi atau impor Supabase produksi.

## Alur tersedia

Pratinjau Excel Master → pemeriksaan workbook → Buka master lokal & Monitoring SDM → Master & Progres.

Halaman ini memakai hasil parser workbook yang sama. Data tidak diketik ulang atau dijumlahkan dari rekap manual. Data tersimpan di memori React selama sesi, tidak di localStorage, dan hilang saat refresh/keluar. Modul kasus SDM produksi lama tetap terpisah sampai migrasi dan staging database diuji.

## Tampilan dan ekspor

- Cari NIP/nama/provinsi; filter bank, tahun kewajiban sesuai kolom Excel, Tukin/UM dan tahap.
- Jumlah SDM, kewajiban, pengembalian Excel, sisa, capaian serta penerimaan terverifikasi ditampilkan terpisah.
- Snapshot awal berstatus pending; tidak mengakui seluruh penerimaan Excel sebagai terverifikasi.
- Riwayat tiap SDM menampilkan kewajiban per tahun/jenis dan pembayaran per tahap.
- Filter tahap memilih SDM dengan pembayaran positif pada tahap tersebut. Sisa tetap memakai seluruh pembayaran dari tahun/jenis terpilih; tidak mengurangi hanya satu tahap.
- Ekspor XLSX mengikuti filter, dengan sheet Monitoring SDM dan Pengembalian per tahap. NIP ditulis sebagai String, nominal sebagai Number.
- Tahun pengembalian, bukti, dan SP2D tidak dibuat-buat; belum dipetakan.

## Hasil verifikasi

22 tes otomatis lulus, termasuk filter, saldo multi-tahap, penerimaan terverifikasi terpisah, serta baca ulang XLSX. Build berhasil.

Browser lokal berhasil memuat seluruh workbook asli (32.779 SDM). Total kewajiban Rp5.837.623.999, pengembalian Excel Rp3.641.947.218, sisa Rp2.195.676.781; capaian 62,39% menurut Excel.

Filter BRI/UM/2026 cocok dengan sumber: kewajiban Rp250.896.650, pengembalian Rp3.512.300, sisa Rp247.384.350. Export browser untuk BRI/UM/2026/Tahap I berhasil diunduh, dibaca ulang dan berisi 43 baris pembayaran dengan total Rp3.512.300. Seluruh NIP valid sebagai teks 18 digit.

## Yang masih menahan deployment

Pengujian Supabase staging dan concurrency lintas koneksi belum dilakukan. Tombol commit produksi tetap tidak aktif. Tampilan ini belum menggunakan query master Supabase, belum menyatukan kasus manual dengan master baru, dan belum memetakan nonaktif/SP2D/bukti/tanggal. Ekspor saat ini menggunakan format tabel normalisasi, belum mengembalikan persis layout lebar workbook bank asli.
