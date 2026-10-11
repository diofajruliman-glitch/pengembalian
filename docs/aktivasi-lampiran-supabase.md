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

## Status saat persiapan

Kode dan SQL telah diuji lokal. Database produksi baru diperiksa dengan SELECT. Aktivasi schema/akses dan pengunggahan data belum dijalankan. Langkah berikutnya memerlukan konfirmasi khusus sebelum browser memperluas akses ke data pegawai dan mengunggah workbook ke Supabase.

## Aktivasi aktual

Pengguna menyetujui aktivasi, impor, dan akses baca admin/editor/viewer pada chat ini. Migrasi berhasil dijalankan melalui dashboard Supabase. Batch 1 dibuka dengan akun admin aplikasi yang terdaftar. Sebanyak 50.000 baris diimpor lewat CSV; sisanya lewat SQL berkelompok dengan kondisi snapshot belum aktif dan retry idempotent. Semua file unggahan privat berada di .local-analysis dan tidak dikirim ke Git.

Pemeriksaan seluruh baris (source 42 kolom, NIP teks, awal/final sama dengan sumber, delta dan flag berubah konsisten) serta kontrol master lulus. RPC commit memvalidasi 98.255 baris, 32.779 SDM unik, nominal awal/final sebelum aktivasi pada 11 Oktober 2026 pukul 12:14:17 WIB. Database setelah impor, sebelum optimasi, berukuran 344.168.115 byte (328 MiB); ukuran pascaoptimasi belum diukur ulang. Anon tidak dapat execute fungsi baca; authenticated tidak mendapat akses schema langsung.

Rekap fungsi baca Supabase SP2D lama 2025 + update 2025 + TAHAP 1 SEND BPK: 26.731 data, 16.562 SDM unik, awal Rp2.636.484.407, final Rp2.101.861.578,847826. Kategori: cuti/absensi 173, tendik 683, WIT 109, WITA 1.093, tidak berubah 24.673. Ketujuh BNBA atribusi kolom S berjumlah Rp3.246.324, sesuai pemeriksaan lokal. Seluruh komponen nominal sesuai BA setelah pembulatan.

Seluruh 79 pengujian otomatis lulus. Commit aplikasi 0667bfb49b2e93c686feabe2259158e0f6d31117 dikirim fast-forward ke main. Deployment produksi AbYZdeBZj9GdYCNeNvw3kFAiJhr1 berstatus Ready, build 7 detik, pukul 12:16:10 WIB. URL utama https://pengembalian.vercel.app/#perubahan-pengembalian . Riwayat per SDM telah diverifikasi di aplikasi online: Oktober, November, Desember 2025 dan 42 kolom sumber. Uji filter 7 BNBA lanjutan dihentikan sesuai arahan pengguna.

Optimasi recovery-adjustments-performance.sql diterapkan setelah pembacaan awal mencapai batas waktu 30 detik. Kolom turunan dan indeks mempercepat rekap; JSON sumber tetap utuh. Aplikasi online kemudian memuat seluruh 98.255 baris. Tujuh tes integrasi lulus setelah optimasi, termasuk kesesuaian filter SQL dan JavaScript. Untuk instalasi baru, jalankan migrasi dasar lalu migrasi performa sebelum membuka menu.
