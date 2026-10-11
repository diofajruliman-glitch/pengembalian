# Persiapan aktivasi lampiran perubahan pengembalian

Pemeriksaan baca saja pada 11 Oktober 2026, proyek `tagokvlsirebfgltbxmq`.

## Hasil pemeriksaan langsung

- Database: 193.369.779 byte (Supabase SQL menampilkan 184 MB, satuan biner).
- Estimasi tambahan satu versi: 158.566.278 byte, berdasarkan sampel 2.000 baris dengan indeks/TOAST.
- Estimasi total: 351.936.057 byte, sekitar 352 MB desimal / 336 MiB. Ini estimasi, ukuran aktual diukur setelah impor.
- Tabel `recovery_adjustments.records` belum ada.
- Master: revisi 3; 32.779 SDM; kewajiban Rp5.837.623.999; pembayaran Rp3.641.947.218; kasus tambahan 0.
- Batas paket Free: 500 MB database menurut https://supabase.com/docs/guides/platform/database-size .

## Perubahan yang siap dijalankan

1. Jalankan `supabase/recovery-adjustments.sql`: membuat schema dan snapshot privat, indeks, RLS, fungsi impor admin dan fungsi baca untuk admin/editor/viewer yang sudah memiliki peran aplikasi. Anon tidak diberi akses. Tabel master lama tidak diubah.
2. Impor 98.255 baris dari `MASTER UPDATE- lampiran.xlsx`, termasuk NIP, nama, lokasi, nominal, status cuti, absensi dan alasan perubahan, ke proyek Supabase tersebut. Kredensial tidak disimpan di repositori. Aktivasi snapshot hanya setelah seluruh baris dan total tervalidasi.
3. Periksa ulang baseline master, total lampiran, kelompok tahun, rekap alasan dan akses berdasarkan peran. Catat ukuran database aktual.
4. Rilis aplikasi setelah pemeriksaan integrasi selesai; verifikasi akses menu pada aplikasi online.

Sumber lokal tidak masuk berkas publik atau Git. Histori awal/final merupakan perbandingan workbook; waktu impor tidak dianggap sebagai tanggal koreksi pegawai.

## Status

Kode dan SQL telah diuji lokal. Database produksi baru diperiksa dengan SELECT. Aktivasi schema/akses dan pengunggahan data belum dijalankan. Langkah berikutnya memerlukan konfirmasi khusus sebelum browser memperluas akses ke data pegawai dan mengunggah workbook ke Supabase.
