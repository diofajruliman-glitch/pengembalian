# Tahap 13 — pratinjau penghubungan master dan Monitoring SDM

Status: implementasi lokal, tanpa git push, deploy, migrasi, atau penyimpanan hubungan kasus.

Monitoring SDM kini menyediakan panel Pratinjau hubungan master dan kasus. Penghubungan memakai NIP teks 18 digit. Nominal lama dan nominal master ditampilkan berdampingan. Master dikonsolidasikan dari semua tahun/jenis/tahap, dengan rincian per tahun/jenis dan pembayaran per tahap.

Kasus manual diambil lengkap melalui pembacaan bertahap 500 baris, termasuk kasus arsip, bukan hanya 25 baris yang terlihat. Pembacaan dan pratinjau tidak menyediakan operasi tulis. Perubahan jumlah kasus selama pembacaan ditolak untuk dimuat ulang. Pembacaan ini belum memberikan snapshot atomik lintas halaman; perubahan isi tanpa perubahan jumlah masih bisa terjadi, sehingga tetap pratinjau saja.

Status, PIC, deadline, catatan, bukti dan data manual disalin ke hasil pratinjau tanpa ditimpa. Perbedaan nama/bank, NIP master ambigu, kasus duplikat/arsip dan status Lunas Terverifikasi yang tidak didukung master ditahan. Nominal master ambigu tidak ditampilkan sebagai saldo yang dapat dipercaya.

Sumber nonaktif tanpa kasus tetap menjadi bahan tinjauan: nama berbeda/belum cocok ditahan, yang cocok hanya disarankan untuk ditinjau kebutuhan tindak lanjutnya. Tidak membuat kasus/tagihan atau keputusan otomatis. Metadata tinjauan sekarang dibawa pada snapshot lokal; tidak dikirim dalam payload staging pembayaran.

41 tes lulus dan build berhasil. Browser lokal diuji dengan workbook stage-added.xlsx dan tiga kasus simulasi yang diberi label SIMULASI: dua dapat ditinjau, satu ditahan. Contoh Mandiri: kewajiban manual 999 vs master 100.000; pengembalian master 30.000 dari dua tahap; status Proses Penagihan, PIC, deadline dan catatan manual tetap utuh. Tabel kasus aplikasi utama tetap kosong dalam mode lokal.

XLSX hasil browser dibaca ulang: tiga kasus, NIP sebagai teks, nominal sebelum/master sesuai, serta status/PIC/deadline/catatan dipertahankan. Sheet Sumber tanpa Kasus tersedia untuk bahan tindak lanjut. File unduhan: TukinUMrecovery-pratinjau-kasus-simulasi-semua.xlsx.

Batas: belum ada penyimpanan referensi master pada kasus, persetujuan pemeriksa, atau uji kasus asli dari server. Master produksi dan SP2D/bukti/tanggal tetap belum diaktifkan. Langkah berikutnya: siapkan penyimpanan referensi kasus ke master pada lingkungan pengujian, dengan pemeriksaan ulang revisi master dan perubahan kasus sebelum commit; atau lengkapi pemetaan SP2D secara lokal terlebih dahulu. Tetap tanpa deploy sampai diminta pengguna.
