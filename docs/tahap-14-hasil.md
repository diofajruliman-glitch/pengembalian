# Tahap 14 — rancangan penyimpanan referensi kasus, tanpa deploy

Status: lokal saja. Tidak ada git push, migrasi Supabase, aktivasi API baru, atau perubahan tabel utama. Tombol Simpan referensi (belum aktif) tetap disabled dan sudah diperiksa pada browser lokal.

Draft supabase/recovery-case-links.draft.sql menyiapkan empat tabel di recovery_test: batch persetujuan, item/snapshot kasus, referensi kasus-ke-NIP master, dan audit. Referensi menyimpan case ID, NIP, revisi master, akun admin, alasan dan waktu persetujuan. Tidak menyalin nominal master menjadi nilai baru pada sdm_cases; hubungan ini nantinya menjadi dasar pembacaan nominal dari master.

Prepare memeriksa akun admin, pilihan 1–500 kasus tanpa duplikasi, revisi master, versi updated_at kasus, kecocokan NIP/nama/bank, kasus tidak diarsipkan, kewajiban master tersedia, dan dukungan nominal/bukti master untuk status Lunas Terverifikasi. Snapshot seluruh isi kasus ditangkap di database.

Commit mewajibkan alasan, memeriksa pemilik batch, revisi master dan isi kasus lagi, lalu menulis referensi dan audit dalam satu transaksi. Pengulangan commit tidak menggandakan referensi/audit. Referensi yang sama dari batch baru diakui sebagai alreadyLinked. Kegagalan kasus di tengah batch membatalkan seluruh referensi baru. Tabel kasus manual hanya dibaca dengan lock, tidak diupdate.

Payload JavaScript hanya mengirim revisi master, ID kasus dan versi kasus; tidak berisi perintah update status/PIC/deadline/catatan/nominal. Snapshot Excel lokal dan kasus simulasi tanpa ID database valid tidak dapat menjadi payload penyimpanan.

43 tes otomatis lulus dan build berhasil. Pengujian PostgreSQL lokal menggunakan data simulasi: data manual sebelum/sesudah commit sama persis, audit hanya satu ketika commit diulang, revisi master berubah ditolak, perubahan catatan tanpa perubahan timestamp tetap ditolak saat commit, kegagalan kasus kedua membatalkan link kasus pertama, kasus arsip/nama berbeda/lunas tanpa bukti master ditolak, editor dan akses tabel langsung ditolak.

Batas: fungsi belum diterapkan ke server atau dibuka melalui API. Pengujian JWT asli, lintas koneksi/concurrency, beban dan penyimpanan dari browser belum dilakukan. Data simulasi public.sdm_cases di tes hanya ada di PGlite lokal, bukan database Supabase. Aktivasi izin API yang membaca kasus utama perlu ditinjau sebelum dijalankan lewat dashboard.

Langkah berikutnya tanpa deploy: bangun pembacaan Monitoring SDM melalui referensi tersimpan dengan nominal terbaru dari master dan label sumber/verifikasi, atau lengkapi pemetaan SP2D lokal. Penyimpanan status nonaktif dan keputusan tinjauan tetap belum aktif.
