# Monitoring wawancara sementara — Dio

Menu **Monitoring Wawancara** menggunakan seluruh ASN berstatus **Terbukti** pada versi aktif Kategorisasi Disiplin ASN. Filter pencarian/kategori pada analisis tidak memperkecil populasi wawancara. Tidak ada identitas 1.057 ASN yang disalin ke kode sumber. Tombol penghubung juga tersedia di modul kategorisasi.

## Acuan penugasan dan kapasitas

Draft penugasan berasal dari `draft-penugasan-pewawancara.csv`: 18 room, pewawancara utama sesuai sumber, Dio sebagai petugas lalu lintas Room 1–9. Petugas lalu lintas Room 10–18 tetap kosong/belum ditetapkan; Abi Setiadi Halim tercatat sebagai pewawancara lintas. Pewawancara lintas diperlakukan sebagai koordinasi kunjungan, bukan satu petugas tetap yang wajib hadir serentak di sembilan room.

Pengguna mengonfirmasi **11 responden per room per hari**. Dengan 18 room aktif, kapasitasnya 198/hari dan 1.057 peserta memerlukan enam hari kegiatan. Acuan awal wawancara 40 menit, jeda lima menit, mulai 08.00 WIB: sesi ke-11 berlangsung 15.30–16.10 WIB. Tanggal mulai wajib diisi; tidak otomatis dianggap tanggal rapat. Jumlah room, jeda, jam mulai, dan kapasitas dapat disesuaikan setelah rapat Senin, 19 Oktober 2026. Sabtu/Minggu dilewati secara bawaan; hari libur lain belum diperhitungkan.

Susun jadwal melalui **Penugasan & parameter → Pratinjau jadwal → Terapkan draft ke kertas kerja**. Pratinjau menampilkan rentang tanggal dan contoh penempatan. Generator hanya mengisi peserta tanpa penempatan; jadwal lama, peserta selesai, kendala, dan permintaan jadwal ulang tidak ditimpa. Bentrok waktu pada room atau pewawancara utama ditolak, termasuk pada penempatan manual. Semua sesi harus selesai sebelum pergantian tanggal.

## Pelaksanaan

1. Cari peserta pada **BNBA & jadwal**, cocokkan NIP/NIK dan nama Zoom, lalu verifikasi identitas dan catat Menunggu.
2. Lakukan Assign/Move To pada Zoom, kemudian simpan status **Di room**. Identitas wajib diverifikasi dan jadwal harus lengkap. Timer memakai waktu mulai aktual; hanya satu peserta aktif per room/pewawancara utama.
3. **Kendali room** menampilkan peserta aktif, hitung mundur, kelebihan waktu, peserta berikutnya, dan jumlah antrean sesuai tanggal. Rincian memungkinkan perpindahan room tanpa mengulang timer. Durasi/jadwal sesi aktif dikunci.
4. Catat posisi pimpinan di Main Room/room tujuan dan kunjungannya. Teks pengingat dapat disalin untuk Broadcast pada Zoom.
5. Setelah perpindahan keluar dilakukan di Zoom, catat **Selesai**. Tersedia status Tidak hadir, Terkendala, dan Jadwal ulang beserta catatan. Penjadwalan ulang dilakukan per peserta melalui rincian.
6. Ekspor seluruh BNBA atau sesuai filter ke CSV, serta unduh cadangan JSON.

Panduan operasi tertera di tab **Panduan Dio**. Acuan Host/Co-Host: [Zoom — Managing meeting breakout rooms](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062540). Aplikasi mencatat tindakan; tidak mengendalikan Zoom, mengirim undangan, atau memindahkan peserta otomatis.

## Penyimpanan dan batas penggunaan sementara

Catatan menggunakan `localStorage` per akun dan sumber/versi dataset; tidak ditulis ke database Supabase dan belum tersinkron antarperangkat atau antarpetugas. Nama/NIP/kategori tetap dibaca dari dataset; penyimpanan operasional hanya memuat kunci peserta, jadwal, status, catatan, penugasan room, dan posisi pimpinan. Viewer hanya dapat membaca/mengekspor catatan di lingkup akunnya. Admin/editor dapat mengubah.

Cadangan JSON hanya dapat dipulihkan ke sumber/versi yang sama, melalui pratinjau sebelum mengganti draft lokal. Cadangan memuat metadata operasional, sehingga sumber BNBA tetap perlu tersedia agar nama peserta dapat ditampilkan. Bersihkan browser/pindah perangkat hanya setelah mengunduh cadangan. Perubahan tab lain dideteksi melalui revisi; konflik meminta muat ulang. Data korup tidak ditimpa diam-diam; pemulihan menyimpan salinan raw lama sebelum penggantian. Kegagalan penyimpanan tidak diberi pesan berhasil.

Tidak ada migrasi database atau deployment pada implementasi ini. Setelah rilis frontend, menu menggunakan dataset yang telah dimuat pengguna melalui alur yang sudah ada. Versi dataset berbeda membuka draft terpisah; sistem tidak menggabungkan hasil wawancara antarversi secara otomatis.

## Verifikasi

Tes model mencakup seleksi Terbukti, sumber/versi, roster CSV, kapasitas 1.057 peserta, akhir pekan, bentrok, verifikasi identitas, timer, pemindahan, penjadwalan ulang, dan keamanan ekspor CSV. Tes penyimpanan mencakup isolasi akun/sumber, konflik revisi, format korup, batas kapasitas, izin browser, serta pemulihan yang mempertahankan data lama. Pengujian browser memakai BNBA simulasi (bukan data personal riil) untuk integrasi menu, penjadwalan, catatan sebelum jadwal, verifikasi, timer, pergantian status, dan muat ulang.
