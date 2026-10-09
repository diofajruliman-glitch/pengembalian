# Tahap 11 — pesan impor dan pratinjau status nonaktif

Status: perubahan lokal, tanpa git push, deployment Vercel, migrasi atau impor data asli ke server.

Pesan error impor kini menjelaskan file yang sudah disimpan, histori hilang/kosong, ketidaksesuaian rekap, perubahan revisi, kewajiban alasan, serta koneksi gagal. Kegagalan jaringan tidak dinyatakan sebagai sukses atau kepastian bahwa commit belum terjadi; pengguna diminta memuat ulang master. Error juga membersihkan pesan status sebelumnya agar tidak bersamaan menampilkan lolos validasi dan gagal.

Label workbook pembanding diperjelas untuk koreksi nol. Parser sheet master tidak aktif memakai header dan NIP teks 18 digit. Kategori hanya SP3, Mengundurkan Diri, Meninggal Dunia dan BUP sesuai sumber. Duplikat/invalid/ambigu tidak ditandai otomatis. Tanggal/alasan sumber dipertahankan mentah, belum ditafsirkan sebagai tanggal efektif atau keputusan operasional.

Pencocokan Excel asli secara lokal: 265 catatan, 126 cocok, 139 belum cocok; 9 nama berbeda pada NIP yang cocok. Nama bank dipertahankan. Kategori sumber: SP3 7, Mengundurkan Diri 137, Meninggal Dunia 77, BUP 44. Catatan unmatched tidak menciptakan master SDM atau kewajiban baru. Tidak adanya catatan nonaktif dilabeli Belum ditandai nonaktif, bukan dianggap aktif.

Browser lokal berhasil membaca workbook asli dan menampilkan ringkasan. Master lokal memiliki filter Status SDM (sumber). Filter BUP menampilkan 41 SDM yang cocok, kewajiban 6.054.553, pengembalian 5.833.188 dan saldo 221.365. Status nonaktif hanya pratinjau: payload transport mengeluarkan metadata nonaktif sebelum staging, tidak menyimpan atau mengubah kasus manual.

Jumlah dan saldo seluruh workbook tetap: SDM 32.779, kewajiban 5.837.623.999, pengembalian 3.641.947.218, saldo 2.195.676.781. 36 tes otomatis lulus dan build berhasil.

Batas: status nonaktif belum persisten ke Supabase, tanggal sumber belum dinormalisasi, unmatched dan perbedaan nama perlu ditinjau. Patch validasi histori kosong tahap 10 masih lokal. Langkah berikutnya: siapkan tinjauan pencocokan yang dapat diekspor dan keputusan penggabungan dengan kasus manual, sebelum mengaktifkan penyimpanan status sumber. Tetap tanpa deploy.
