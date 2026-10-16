# Kategorisasi Disiplin ASN

Bagian dari **Pokja SD Tim TLHP — Monitoring Tindak Lanjut**, dengan subjudul tindak lanjut indikasi judi online, acuan Nodin Sekjen Nomor 3513/I/KP.06.08/09/2026 tanggal 14 September 2026. Menu tetap menggunakan `/#kategorisasi-judol` agar tautan lama kompatibel. Login, profil, dan seluruh fungsi pengembalian yang sudah ada dipertahankan.

## Alur sumber final

Admin mengunggah satu workbook `.xlsx` maksimal 60 MB. Worker browser membaca tiga sheet:

1. **Data Olah**: NIK kolom C, NIP B, nama F, hasil penilaian T, keterangan U. Terbukti dan Tidak Terbukti dipertahankan; kosong/Pilih menjadi Belum ditetapkan.
2. **Hasil pairing**: seluruh hasil historis Sekjen per NIK dipertahankan sebagai nilai sumber, bukan dihitung ulang. NIK duplikat tidak dipilih/ditimpa otomatis.
3. **data transaksi 2025**: NIK B, tanggal G, jam H, nominal I; NIK_PEMAIN K diperiksa silang jika terisi.

Daftar, pratinjau, audit SDM, tindak lanjut, dan ekspor difokuskan pada **Terbukti/Tidak Terbukti**. Filter awal Terbukti mengikuti data yang diunggah, tidak mengunci jumlah 1.057. Pilihan **Kedua status** menggabungkan kedua kelompok. Baris sumber dengan status lainnya tetap dipertahankan pada snapshot. Pencarian nama/NIK/NIP, hasil klarifikasi, kelengkapan data, kategori, dan periode filter bekerja bersamaan. Ringkasan dan ekspor mengikuti seluruh baris sesuai filter, bukan hanya halaman tabel. Audit yang diekspor mengikuti SDM terpilih; seluruh audit workbook tetap tersimpan dalam snapshot. NIK disamarkan pada tampilan; file ekspor memuat identitas lengkap untuk petugas berwenang.

Tiga hasil ditampilkan berdampingan: **Pairing Sekjen asli | Sebelum ASN | Sesudah ASN**. Default cakupan transaksi 1 Januari–31 Desember 2025, batas sesudah ASN inklusif 1 Oktober 2025. Jika rincian transaksi tersedia, ketiga komponen dihitung mandiri untuk setiap periode dari transaksi periode tersebut. Skor sebelum bukan hasil pengurangan skor keseluruhan dengan skor sesudah.

Tombol **Lihat** pada tabel perbandingan dan pratinjau parameter membuka pop-up rincian SDM. Pop-up memuat perbandingan tiga periode, keterangan Data Olah, serta catatan validasi bila tersedia. Tutup melalui tombol Tutup rincian, Esc, atau klik latar di luar dialog; fokus kembali ke tombol pembuka dan posisi daftar dipertahankan. Latar tidak dapat digunakan selama dialog terbuka; isi dialog dapat digulir pada layar kecil.

Tidak ada transaksi tetap dibedakan dari Ringan dan data yang perlu validasi. Tanggal/nominal/jam tidak valid, nomor sumber berulang, konflik identitas, NIK tidak terpasang, dan selisih historis dicatat. Periode yang terpengaruh data tidak lengkap tidak diberi kategori sehat atau skor akhir palsu.

## Rincian master belum tersedia dan kategori acuan

Setiap SDM baru mencatat `sourceTransactionCount` untuk seluruh baris master dengan NIK sama, termasuk tanggal di luar rentang parameter atau tanggal yang tidak valid. Jika tidak ada baris sumber, tetapi frekuensi atau nominal Hasil pairing positif, `missingTransactionDetails` bernilai true. Kedua periode tidak diisi angka 0: frekuensi, nominal, jumlah aktivitas, nilai komponen, serta skor total tetap `null` dan ditampilkan kosong/tanda —. Mengubah rentang tanggal tidak mengubah transaksi yang tersedia di luar rentang menjadi data master hilang.

Sesuai persetujuan pengguna, bila kategori akhir historis valid (Ringan/Sedang/Berat dan status sumber tidak perlu validasi), `categoryFromPairing` bernilai true. **Kategori asli Hasil pairing digunakan sebagai acuan keseluruhan pada kedua kolom periode**, dengan status **Kategori acuan Hasil pairing; rincian periode belum tersedia**. Kategori ini tidak dihitung ulang menggunakan bobot versi baru dan tidak mengalokasikan transaksi ke periode mana pun. Data historis asli tidak diubah. Bila kategori sumber tidak valid/tidak tersedia, penanda kategori tetap **Rincian transaksi belum tersedia**.

Filter **Kelengkapan data** tetap dapat menemukan seluruh SDM tanpa rincian, walaupun kategorinya sudah menggunakan acuan. Filter kategori Ringan/Sedang/Berat dapat digabungkan dengan kelengkapan tersebut. Ringkasan frekuensi/nominal hanya menjumlahkan data yang tersedia, dengan penjelasan bila belum lengkap; jika seluruh hasil filter tidak memiliki rincian, kartu menampilkan **Belum tersedia**. Distribusi kategori mencantumkan berapa SDM yang memakai acuan Hasil pairing, terpisah dari hasil perhitungan yang memiliki rincian. API menyertakan `referenceCount` dan `referenceCategories` pada ringkasan tiap periode.

Pop-up, audit `missing-transaction-details`, dan ekspor menyebut dasar kategori acuan serta keterbatasan periode. Ekspor merekam filter aktif, kelengkapan, jumlah baris master, dan kolom **Kategori acuan Hasil pairing**; semua angka periode yang belum tersedia tetap kosong. Snapshot lama tidak ditimpa dan penghitung kelengkapan yang belum pernah dicatat tidak diasumsikan nol. Lampirkan sumber asli untuk menghitung versi turunan dengan penanda baru.

## Parameter dan versi

Bobot 60% frekuensi, 30% deposit, dan 10% waktu aktivitas berasal dari nota dinas. Batas frekuensi, bobot kategori 20/30/50 dan waktu 30/70 mengikuti pola sheet Hasil pairing. Default batas deposit Rp605.000/Rp2.545.000 dan batas skor kategori 34/46 merupakan rekonstruksi dari hasil teramati, bukan batas tertulis resmi. Jadwal Senin–Kamis 07:30–16:00, Jumat sampai 16:30, dan batas tanggal adalah asumsi yang dapat ditinjau. Kalender libur, shift, dan zona waktu tidak dikoreksi otomatis.

Aktivitas seri default Dalam Jam mengikuti pola sumber, atau dapat diubah menjadi Luar Jam/Perlu validasi. Default normalisasi jam HHMMSS melengkapi nol di depan untuk angka 1–6 digit; asumsi ini dapat dinonaktifkan sehingga hanya bentuk 6 digit diterima. Contoh `000100` dibaca sebagai `00:01:00`, sedangkan `000000` merupakan jam `00:00:00` yang valid.

Parameter **Penanganan jam bertanda -** memiliki dua pilihan. Default dataset baru **Ikuti kategori waktu Hasil pairing** (`missingTimePolicy: pairing`) memasangkan NIK transaksi dengan kategori waktu historis Dalam/Luar Jam Kerja. Hanya teks `-` (setelah trim) yang boleh menggunakan acuan tersebut. Jam valid dibaca normal; kolom kosong, teks/angka jam tidak valid, pairing tidak tersedia/duplikat, atau kategori historis yang tidak valid tetap perlu validasi. Pilihan **Tetap perlu validasi waktu** (`validate`) mempertahankan perlakuan sebelumnya.

Transaksi dengan jam `-` tetap memiliki nilai sumber yang sama. Kategori historis digunakan sebagai asumsi klasifikasi transaksi, bukan pengganti jam nyata. Jumlah transaksi dalam/luar untuk menghitung skor mencakup asumsi tersebut; penghitung `timeFromPairing`, `timeFromPairingInside`, dan `timeFromPairingOutside` merinci asalnya. `unknown` hanya menghitung jam yang masih belum dapat ditentukan. Catatan audit `time-from-pairing` menyimpan baris transaksi serta kategori dan baris Hasil pairing yang menjadi acuan. Kategori waktu mayoritas dan skor akhir dihitung ulang per periode menggunakan bobot versi aktif; kategori akhir historis tidak disalin. Masalah tanggal, nominal, duplikat transaksi, dan konflik identitas tetap memerlukan validasi.

Ringkasan sesuai filter, label pada tabel, pop-up **Lihat**, audit, dan ekspor menampilkan penggunaan acuan waktu Hasil pairing. Hasil lama tanpa parameter ini tetap dibaca sebagai kebijakan `validate` pada panel versi; hasilnya tidak otomatis dihitung ulang. Penghitung yang belum dicatat pada versi lama ditampilkan sebagai tidak dicatat/kosong. Perubahan kebijakan melalui pratinjau membuat versi baru dan mempertahankan versi sebelumnya.

Admin mengubah parameter melalui **Parameter & versi**, menghitung pratinjau, lalu menetapkannya sebagai versi baru. Versi sebelumnya dan Hasil Pairing Sekjen tidak diubah. Bobot harus berjumlah 100%; ambang, nilai kategori, jam, dan tanggal divalidasi. Hasil tersimpan memuat versi parameter dan SHA-256 workbook. Setelah memuat hasil online tanpa transaksi mentah, lampirkan kembali sumber asli dengan SHA-256 sama untuk membuat versi turunan.

## Tindak lanjut, penyimpanan, arsip

Tindak lanjut per SDM memuat status pemeriksaan, PIC, catatan, referensi BAP/dokumen, dan hasil keputusan yang sudah ada. Skor tidak membuat keputusan hukuman. Catatan melekat ke versi masing-masing; nilai versi baru tidak diam-diam memakai catatan versi lama.

Tanpa koneksi, data hanya berada di memori sesi. Berpindah menu mempertahankan dataset; keluar/berganti akun/muat ulang menghapus data yang belum disimpan. Simpan online menggunakan RPC dan tabel terpisah `discipline_*`; tidak ada penulisan ke tabel pengembalian. Workbook dan transaksi mentah tidak diunggah. Panduan aktivasi, izin, dan kontrak API di [discipline-storage.md](discipline-storage.md). Migrasi belum dijalankan otomatis.

Dataset tersimpan bersifat immutable. Arsip menutup perubahan parameter/tindak lanjut pada versi tersebut, sementara pembacaan dan ekspor tetap tersedia. Arsip hanya tersedia setelah dataset disimpan online. Saat menyimpan versi lokal baru, versi pendahulunya yang belum tersimpan ikut disimpan berurutan agar nomor dan garis riwayat tetap konsisten.

## Kompatibilitas hasil Excel lama

Tombol **Baca hasil Excel lama** mempertahankan alur pembacaan sheet Penilaian Pasca ASN dari workbook analisis awal dan pasangan hasil kolom T melalui unggahan Data Olah terpisah. Mode ini membaca cache hasil rumus Excel, tidak menghitung ulang sumber mentah.

## Validasi

`node --test tests/*.test.js` memeriksa regresi dan logika modul. `npm run build` memeriksa bundel aplikasi/worker. Pengujian PostgreSQL lokal memeriksa transaksi atomik, profil admin/editor/viewer, snapshot versi, audit, dan penolakan perubahan arsip. Browser diuji untuk unggah workbook asli, filter gabungan, hitung pratinjau versi baru, kembali ke versi lama, dan ekspor hasil filter.

Sebelum dipublikasikan, jalankan migrasi tambahan di lingkungan tujuan dan uji login serta penyimpanan dengan akun berwenang pada deployment pratinjau. Kode ini tidak mengubah konfigurasi hosting atau menjalankan migrasi produksi secara otomatis.
