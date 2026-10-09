# Tahap 12 — daftar tinjauan SDM nonaktif dan ekspor

Status: lokal, tanpa git push, deploy, perubahan API/migrasi Supabase atau penggabungan kasus.

Panel nonaktif kini menyediakan daftar tinjauan 15 baris per halaman, pencarian NIP/nama sumber/nama master, filter kategori dan hasil pencocokan, serta ekspor XLSX sesuai filter. Filter aktif dan jumlah catatan ekspor tetap terlihat saat tabel ditutup, dengan tombol hapus filter.

Hasil sumber asli secara lokal: 265 catatan dibagi menjadi 117 Cocok (NIP dan nama), 9 Nama berbeda (NIP cocok), 139 Belum cocok. Status NIP ambigu tersedia untuk sumber mendatang dan tidak ditandai otomatis. Cocok tidak berarti status nonaktif sudah diverifikasi atau keputusan penggabungan kasus disetujui.

Ekspor memuat NIP sebagai teks, nama sumber dan nama master berdampingan, bank, kategori, hasil pencocokan, tanggal/alasan mentah dari sumber, dan catatan tinjauan. Sheet Masalah Sumber memuat kode masalah dan nomor baris untuk catatan tidak valid. Angka serial tanggal Excel dipertahankan, belum ditebak menjadi tanggal.

37 tes lulus dan build berhasil. Browser lokal diuji memakai workbook asli. Unduhan Nama berbeda berisi 9 catatan, Belum cocok 139 catatan; keduanya dibaca ulang dan seluruh NIP tetap teks 18 digit serta hasil pencocokan mengikuti filter. File tersimpan lokal di Downloads, tidak diunggah ke layanan eksternal.

Nama dan jumlah bank/SDM tidak ditimpa. Metadata nonaktif tetap dikeluarkan dari payload staging pembayaran. Tidak ada status kasus, PIC, tindak lanjut atau kewajiban yang dibuat otomatis.

Batas: daftar ini merupakan bahan tinjauan, belum menyimpan keputusan pemeriksa, belum mengimpor kembali hasil tinjauan, dan belum menghubungkan ke kasus manual. Perbedaan nama dan NIP belum cocok membutuhkan pemeriksaan sumber. Langkah berikutnya: rancang penghubungan kasus berdasarkan NIP dengan pratinjau perubahan dan pelestarian status/PIC/catatan manual; tetap tanpa deploy.
