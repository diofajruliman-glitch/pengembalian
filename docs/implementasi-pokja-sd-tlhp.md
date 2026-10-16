# Hasil implementasi — 16 Oktober 2026

Nama aplikasi: **Pokja SD Tim TLHP — Monitoring Tindak Lanjut**. Modul: **Kategorisasi Disiplin ASN**. Implementasi adaptasi mesin analisis dalam aplikasi Vite/React yang sudah ada; tidak mengganti aplikasi dengan proyek Next.js atau menggandakan login. Fitur pengembalian tetap pada komponen dan tabel lamanya.

**Pemeriksaan terbaru: 138 pengujian lulus, 0 gagal, 0 skip; build berhasil.** Bagian berikut mencatat tahapan pemeriksaan; perilaku terbaru mengikuti bagian fokus dua status dan kategori acuan di akhir dokumen.

## Pemeriksaan yang selesai

- `npm run build`: lulus, termasuk worker analisis terpisah. Peringatan ukuran bundle utama yang besar masih ada.
- Seluruh **110 pengujian lulus**, tanpa skip, dengan `DISCIPLINE_WORKBOOK_PATH` diarahkan ke workbook final untuk pemeriksaan lokal.
- Workbook final asli dibaca dan hasilnya melalui putaran simpan/muat pada PostgreSQL lokal PGlite. Tidak ada data sumber dibundel atau dikirim ke database online.
- Browser: nama baru dan halaman modul tampil; unggah sumber asli menghasilkan 1.359 SDM dengan filter awal 1.057 Terbukti. Gabungan Tidak Terbukti + kategori Sedang sesudah ASN menampilkan 4 SDM.
- Browser: parameter aktivitas seri diubah, pratinjau dihitung, versi baru ditetapkan, kemudian versi awal dibuka kembali dengan parameter aslinya. Mengubah draft setelah pratinjau membatalkan pratinjau yang tidak lagi sesuai.
- Browser: ekspor kategori Berat menghasilkan 6 SDM berstatus Terbukti, NIK teks, parameter, dan audit seluruh sumber. Tidak ditemukan error console selama pengujian.
- Dashboard pengembalian tetap dapat dibuka. Pengujian regresi ledger, master, role, tindak lanjut, dan ekspor lama tetap lulus.
- Pengujian baru memeriksa urutan simpan versi lokal, penggunaan kembali induk tersimpan, catatan tindak lanjut gagal terkirim, dan pembatalan pembaruan snapshot ketika sesi pengguna berakhir.

## Batas yang masih berlaku

Belum dilakukan deployment atau migrasi database online. Skrip tambahan `supabase/discipline-module.sql` siap ditinjau dan dijalankan pada lingkungan tujuan; tidak ada migrasi atau perubahan pada tabel lama. Penyimpanan langsung lewat Supabase yang benar-benar online belum diuji karena modul belum diaktifkan di lingkungan tersebut. Tanpa aktivasi ini, hasil berada dalam memori sesi browser.

Tanggal batas ASN, jadwal kerja, kalender, dan sebagian batas penilaian masih merupakan parameter rekonstruksi/asumsi, sebagaimana ditampilkan pada halaman Parameter. Catatan keputusan diisi dari hasil pemeriksaan yang sudah ada; hasil skor tidak menetapkan hukuman.

Rincian pemakaian: [panduan modul](kategorisasi-judol.md). Aktivasi dan hak akses: [penyimpanan disiplin](discipline-storage.md).

## Pembaruan penanganan jam `-` — 16 Oktober 2026

Sesuai persetujuan pengguna, dataset baru menggunakan **Ikuti kategori waktu Hasil pairing**. Transaksi bertanda `-` menggunakan kategori waktu historis per NIK sebagai asumsi; nilai sumber tetap utuh. Waktu valid tetap dihitung dari jamnya, dan kategori akhir setiap periode dihitung ulang menggunakan parameter aktif. Opsi **Tetap perlu validasi waktu** tersedia melalui pratinjau dan versi baru; versi lama tidak ditimpa.

Ringkasan sesuai filter, tabel, pop-up rincian, audit sumber, dan ekspor mencatat jumlah serta asal asumsi. Migrasi lokal menambahkan dukungan validasi penghitung asal waktu dan parameter secara kompatibel dengan snapshot lama. Tidak ada migrasi database online atau deployment.

Pemeriksaan akhir: **119 pengujian lulus, 0 gagal, 0 skip**, termasuk putaran simpan–muat hasil workbook asli pada PostgreSQL lokal; `npm run build` berhasil. Uji independen menegaskan sumber/historis tidak berubah, frekuensi/nominal serta kedua skornya tetap sama, dan seluruh hasil sesudah ASN identik dengan kebijakan validasi sebelumnya. Browser diuji untuk unggah, pilihan parameter, pratinjau, dua versi, kembali ke versi awal, filter 59 SDM yang terdampak, dan pop-up rincian; tidak ada peringatan/error console yang teramati.

Pada workbook sumber saat ini terdapat 614 transaksi berjam `-` milik 83 SDM. Di antara 1.057 SDM Terbukti, 476 transaksi milik 59 SDM menggunakan acuan waktu, seluruhnya sebelum batas 1 Oktober 2025. Hasil untuk populasi Terbukti dengan parameter bawaan:

| Kategori | Sebelum ASN | Sesudah ASN |
| --- | ---: | ---: |
| Berat | 281 | 6 |
| Sedang | 152 | 6 |
| Ringan | 607 | 265 |
| Perlu validasi | 0 | 0 |
| Tidak ada transaksi | 17 | 780 |

Angka di atas merupakan hasil tahap penanganan jam, sebelum pembaruan kelengkapan master dan kategori acuan berikut. Catatan sumber tetap tersedia di audit; hasil historis tidak ditimpa.

## Fokus dua status dan kategori acuan — pembaruan terakhir

Daftar, filter, pratinjau, audit SDM, tindak lanjut, dan ekspor difokuskan pada **1.357 SDM** dari workbook saat ini: 1.057 Terbukti dan 300 Tidak Terbukti. Dua SDM dengan status belum ditetapkan tetap ada pada snapshot sumber. Status penilaian tidak diubah oleh kategorisasi.

Sebanyak 20 SDM (16 Terbukti dan 4 Tidak Terbukti) memiliki rekap historis tetapi tidak memiliki baris rincian master. `sourceTransactionCount` menghitung seluruh sumber, terlepas dari rentang tanggal parameter. `missingTransactionDetails` membedakan kondisi ini dari hasil nihil pada suatu periode. Seluruh angka periode yang belum tersedia tetap `null`; tabel/pop-up memakai tanda — dan ekspor membiarkan sel kosong.

Sesuai arahan pengguna, kategori historis valid digunakan sebagai **kategori acuan Hasil pairing** pada kedua kolom periode. `categoryFromPairing` mencatat dasar tersebut; label di tabel, pop-up, audit, distribusi, dan ekspor menyatakan bahwa kategori merupakan acuan keseluruhan. Distribusi 20 acuannya: 16 Ringan, 1 Sedang, 3 Berat. Angka periode tidak disalin atau dialokasikan dari rekap historis. Kategori sumber yang tidak valid tetap memerlukan kelengkapan/validasi.

Untuk 1.057 SDM Terbukti, hasil dengan rincian dan kategori acuan dibedakan sebagai berikut:

| Kategori | Hasil hitung sebelum ASN | Hasil hitung sesudah ASN | Acuan keseluruhan Hasil pairing |
| --- | ---: | ---: | ---: |
| Berat | 281 | 6 | 3 |
| Sedang | 152 | 6 | 1 |
| Ringan | 607 | 265 | 12 |
| Tidak ada transaksi pada periode | 1 | 764 | 0 |

Kolom acuan memuat 16 SDM tanpa rincian. Acuan yang sama ditampilkan pada kedua kolom periode dan diberi label; ini tidak menyatakan tanggal kejadian. Ringkasan nominal/frekuensi hanya menjumlahkan rincian yang tersedia. Filter kelengkapan dan kategori dapat digabungkan untuk memeriksa acuan maupun hasil perhitungan.

Pemeriksaan akhir mencakup **138 pengujian penuh**, workbook asli, filter kedua status/kelengkapan/kategori, ekspor bertipe dengan nilai kosong, snapshot lama, validasi referensi kategori dan penolakan skor palsu, serta putaran simpan–muat pada PostgreSQL lokal. Build berhasil; peringatan ukuran bundle utama tetap ada. **Tidak ada migrasi database online atau deployment.**
