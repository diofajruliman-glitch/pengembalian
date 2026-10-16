# Pemeriksaan kesiapan online — 16 Oktober 2026

Kesimpulan: fondasi aplikasi siap untuk uji internal, tetapi penyimpanan modul belum diaktifkan di Supabase online dan koreksi temuan validasi belum tersedia di UI. Tidak dilakukan deployment, migrasi, perubahan hak akses, atau perubahan data aplikasi.

## Pemeriksaan Supabase langsung

Proyek yang dipakai aplikasi: `tagokvlsirebfgltbxmq`. Dashboard dapat dibuka dengan sesi yang tersedia dan berstatus **Healthy**. Paket organisasi Free. Pemeriksaan dilakukan dengan SELECT metadata dan hitungan role, tanpa membaca isi transaksi atau menulis tabel aplikasi.

| Pemeriksaan | Hasil aktual |
| --- | --- |
| Ukuran database | 351.409.843 byte; PostgreSQL menampilkan 335 MB (sekitar 335 MiB) |
| Default transaksi read-only | off |
| public.discipline_datasets | Belum ada |
| public.discipline_followups | Belum ada |
| public.discipline_audit | Belum ada |
| public.discipline_rpc(text,jsonb) | Belum ada |
| public.current_app_role() | Tersedia |
| public.profiles | Tersedia |
| Jumlah profil menurut role | 2 admin, 2 editor, 1 viewer |

Dokumentasi Supabase saat pemeriksaan menyebut batas database paket Free 500 MB; ini berbeda dari metrik disk keseluruhan. Sumber: https://supabase.com/docs/guides/platform/database-size . Ukuran payload hasil workbook saat uji lokal sekitar 2.004.713 byte JSON per versi; bukan ukuran penyimpanan PostgreSQL aktual dan belum termasuk semua overhead. Data rekap modul sesuai dengan batas implementasi 5.000 SDM/12 MiB per snapshot. Tidak dilakukan pengujian tulis online.

Migrasi tambahan yang telah disiapkan: `supabase/discipline-module.sql`. Pengujian PostgreSQL lokal berhasil saat diterapkan dua kali terhadap skema recovery lengkap dan tidak mengubah 15 action plans lama. Struktur dan dependensi peran mendukung penggunaan proyek Supabase yang sama.

## Tombol dan alur yang benar-benar ada

| Kebutuhan | Implementasi |
| --- | --- |
| Ubah aturan/ketentuan penilaian | Ada untuk admin melalui Parameter & versi; pratinjau lalu tetapkan versi baru |
| Perbandingan Sekjen/sebelum/sesudah | Ada, dengan pop-up rincian |
| Simpan catatan pemeriksaan | Ada: status tindak lanjut, PIC, catatan, referensi dokumen, hasil keputusan |
| Koreksi tanggal/jam/nominal/NIK transaksi dari temuan audit | Belum ada |
| Menandai temuan audit selesai/diterima dengan alasan dan bukti | Belum ada; catatan tindak lanjut tidak otomatis menyelesaikan temuan |
| Ubah Terbukti/Tidak Terbukti | Belum ada, sesuai keputusan menunda verifikasi ulang |
| Simpan/Buka/Arsip dataset online | UI dan SQL siap; belum aktif di server karena tabel/RPC belum ada |
| Master transaksi mentah permanen | Belum ada; workbook dan transaksi berada dalam memori browser |
| Unggah berkas bukti | Belum ada di modul ini; saat ini hanya referensi teks/tautan |

Koreksi data saat ini dilakukan pada salinan workbook lalu diunggah sebagai dataset baru. Lampir ulang sumber untuk versi tersimpan hanya menerima SHA-256 yang identik, sehingga workbook yang sudah diperbaiki tidak dapat dianggap sumber yang sama. Hasil awal tidak ditimpa.

## Pemeriksaan lokal dan batas bukti

- Build terbaru berhasil; peringatan ukuran bundle utama tetap ada.
- 19 pengujian terfokus lulus, termasuk workbook asli, aturan, penyimpanan PostgreSQL, peran, arsip, dan garis riwayat versi. Rangkaian 110 pengujian penuh sebelumnya juga lulus; pemeriksaan ini tidak mengubah kode aplikasi.
- Detail proyek/deployment Vercel melalui konektor tertolak HTTP 403 untuk scope yang dituju. CLI Vercel tidak tersedia pada PATH; tidak dicoba menjalankan deployment atau mengambil token. Daftar proyek mengonfirmasi proyek pengembalian, tetapi detail konfigurasi serta environment online tidak dapat disahkan melalui konektor pada sesi ini.

## Saran sebelum penggunaan operasional penuh

1. Tambahkan alur penyelesaian temuan validasi sumber dengan nilai awal, koreksi, alasan, bukti, pemeriksa, dan audit. Ini terpisah dari verifikasi ulang Terbukti/Tidak Terbukti yang masih ditunda.
2. Aktifkan migrasi khusus modul pada waktu yang disepakati, lalu uji simpan–muat–arsip dengan akun nyata admin/editor/viewer di pratinjau. Pemeriksaan saat ini tidak mengotorisasi atau menjalankan langkah tersebut.
3. Pastikan siapa yang berhak melihat data disiplin. Implementasi memakai role lama sehingga semua lima profil yang sah dapat membaca seluruh dataset baru; gunakan akses khusus modul bila lingkupnya harus lebih sempit.
4. Tetapkan pengelolaan sumber: simpan workbook asli secara terkendali atau bangun penyimpanan master transaksi privat jika ingin koreksi dan hitung ulang tanpa unggah ulang.
5. Untuk penggunaan bersama lebih intensif, tambahkan idempotency penyimpanan versi dan deteksi konflik catatan tindak lanjut. Saat ini ada jejak audit, tetapi pembaruan tindak lanjut terakhir menjadi nilai aktif.

Tidak diperlukan perubahan total aplikasi atau proyek Supabase baru untuk rancangan yang sekarang.

## Pembaruan lokal setelah persetujuan penanganan jam `-`

Parameter **Ikuti kategori waktu Hasil pairing** telah diterapkan untuk dataset baru. Opsi **Tetap perlu validasi waktu** tetap tersedia; hasil lama tidak ditimpa. Asumsi per transaksi tercatat di ringkasan, rincian, audit, dan ekspor. Ini bukan fitur koreksi jam asli atau penetapan status Terbukti/Tidak Terbukti.

Hasil workbook asli menunjukkan 476 transaksi pada 59 SDM Terbukti memakai acuan waktu, seluruhnya sebelum 1 Oktober 2025. Hasil sesudah ASN, frekuensi, nominal, dan sumber historis tidak berubah. **119 pengujian penuh lulus**, termasuk kesesuaian format penyimpanan baru di PostgreSQL lokal; build dan pemeriksaan browser juga berhasil. Rincian: [hasil implementasi](implementasi-pokja-sd-tlhp.md).

Pembaruan ini hanya lokal. Temuan sebelumnya mengenai tabel/RPC online yang belum tersedia, hak akses, master transaksi permanen, penyelesaian audit, serta batas verifikasi deployment tetap berlaku. Tidak ada deployment atau eksekusi migrasi online pada pembaruan ini.

## Pembaruan fokus dua status dan kategori acuan

Daftar analisis, pratinjau, audit SDM, tindak lanjut, dan ekspor kini difokuskan pada Terbukti/Tidak Terbukti; workbook saat ini memuat 1.357 SDM pada kedua status tersebut, sementara 2 status belum ditetapkan dipertahankan pada snapshot sumber. Filter kelengkapan, kategori, periode, dan pencarian bekerja bersama; audit dan ekspor mengikuti SDM sesuai filter.

Pada 20 SDM tanpa rincian master (16 Terbukti dan 4 Tidak Terbukti), kategori asli Hasil pairing digunakan sebagai acuan keseluruhan sesuai arahan pengguna: 16 Ringan, 1 Sedang, 3 Berat. Tabel, rincian, distribusi, dan ekspor memberi label acuan. Jumlah transaksi, nominal, aktivitas, serta skor sebelum/sesudah ASN tetap tidak tersedia (`null`), karena tanggal rinciannya belum ada. Snapshot penyimpanan mencatat kondisi ini dan validator lokal menolak angka nol/skor yang dipaksakan pada periode tersebut.

Ini merupakan pembaruan analisis lokal. Database online belum diaktifkan dan aplikasi belum di-deploy; kelengkapan master tetap memerlukan data sumber agar perhitungan periode dapat dilakukan.
