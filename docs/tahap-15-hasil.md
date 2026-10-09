# Tahap 15 — pembacaan nominal terbaru melalui referensi kasus

Bagian lokal dari integrasi Monitoring SDM diselesaikan. Tidak ada git push, deploy Vercel, migrasi/aktivasi API Supabase, atau perubahan kasus utama.

Modul pembacaan memisahkan sumber nominal: kasus tanpa referensi memakai data manual, kasus dengan referensi valid memakai nominal terbaru master, sedangkan referensi invalid tidak diam-diam kembali ke nominal lama. Pengembalian sumber dan penerimaan terverifikasi dipisahkan. Status, PIC, deadline dan catatan manual tetap dipertahankan, termasuk jika status lunas perlu ditinjau akibat perubahan master.

Draft SQL recovery-case-read.draft.sql membaca kasus aktif, referensi, dan agregat master dalam satu query per halaman. Metadata awal/akhir memeriksa revisi master serta fingerprint isi kasus dan referensi, sehingga perubahan selama pembacaan tidak menghasilkan hasil sebagian yang dipercaya. Fungsi admin-only tetap private dan belum dirutekan melalui API aplikasi. Biaya fingerprint seluruh kasus perlu diuji pada beban nyata.

Antarmuka contoh Monitoring melalui referensi simulasi tersedia lokal, dengan pencarian, filter sumber nominal dan ekspor XLSX. Komponen dapat menerima hasil server saat jalur API diaktifkan nanti; saat ini hanya contoh lokal yang dihubungkan ke panel pratinjau.

46 tes otomatis lulus, build berhasil. Uji PostgreSQL lokal membuktikan referensi yang disetujui tetap memakai pembayaran terbaru 35.000 dan sisa 65.000 dari kewajiban 100.000, sementara nominal manual 999, PIC dan penanganan tetap utuh. Perubahan NIP setelah persetujuan membuat finance null untuk ditinjau. Fingerprint kasus berubah ketika catatan diubah; editor tidak dapat menjalankan fungsi baca.

Uji browser lokal menggunakan master dua tahap: contoh Mandiri menampilkan kewajiban 100.000, pembayaran sumber 30.000, sisa 70.000, terverifikasi 0; status/PIC/deadline/catatan manual tetap utuh. Ekspor difilter Simulasi master berisi dua kasus dan dibaca ulang: NIP tetap teks 18 digit, nominal dan data manual sesuai.

Batas: integrasi tahap pertama belum selesai di server. Penyimpanan dan pembacaan referensi masih perlu aktivasi API pengujian, pengujian JWT/browser asli serta concurrency/performa nyata. Belum ada promosi produksi. Pemetaan SP2D/tanggal/bukti, tinjauan nonaktif dan pengujian file penuh tetap diperlukan. Sumber nomor/tanggal/tahun SP2D ditanyakan kepada pengguna untuk tahap berikutnya.
