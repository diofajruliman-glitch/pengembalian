# Tahap 23 — Dashboard dan Monitoring SDM dari master tersimpan

Tanggal: 10 Oktober 2026. Pengembangan lokal; belum dipush atau dideploy.

## Hasil

- Perubahan pengguna pada commit 797ccb4 dan 1cc8002 dipertahankan.
- Dashboard dan Rekap Bank tetap menggunakan snapshot dari database. Pratinjau workbook yang belum disimpan tidak lagi menggantikan nominalnya. Perpindahan mode atau pemuatan workspace juga tidak menghapus snapshot dashboard yang sudah dimuat.
- Monitoring SDM menampilkan progres pegawai dengan kewajiban positif dari snapshot tersimpan yang sama: pencarian NIP/nama/provinsi, filter bank/tahun SP2D/jenis/tahap, saldo, riwayat pembayaran, dan ekspor XLSX sesuai filter.
- Kasus khusus tetap digunakan untuk tindak lanjut; tidak ada penyalinan nominal master ke tabel kasus manual.
- Pengembalian tercatat tetap dipisahkan dari penerimaan terverifikasi. Izin membaca master tetap admin; izin database tidak diperluas.

## Validasi

- `node --test tests/*.test.js`: 55 lulus, 0 gagal. Termasuk regresi pratinjau tidak mengganti saldo tersimpan dan alur workbook tahap berikutnya, koreksi nol, duplikasi, serta histori yang hilang.
- `npm run build`: berhasil; peringatan ukuran chunk Vite di atas 500 kB masih ada.
- Browser lokal, data simulasi tanpa koneksi database: filter 2026/tahap 2 menghasilkan kewajiban 200, pengembalian 20, sisa 180, terverifikasi 0; riwayat UM 2026 tahap 2 tampil. Tidak ada error console pada pengujian ini.
- Bukti tampilan lokal disimpan di `.local-analysis/stored-sdm-integration-proof.jpg` (diabaikan Git).

## Batas tahap ini

Tampilan baru belum diuji dengan sesi login produksi dan belum online. Tidak ada perubahan data Supabase. Pengujian impor berikutnya dilakukan melalui fixture workbook lokal; belum menerima file bank tahap berikutnya yang asli. Status nonaktif masih perlu rekonsiliasi dan penyimpanan tersendiri. Integrasi penanggung jawab/rencana aksi/bottleneck dengan identitas master belum ditambahkan pada tahap ini.
