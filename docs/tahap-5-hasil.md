# Tahap 5 — alur penyimpanan untuk pengujian

Status: implementasi lokal. Tidak ada deployment atau migrasi produksi pada tahap ini.

Antarmuka hasil pemeriksaan Excel kini memiliki panel penyimpanan master. Mode pengujian dapat menyiapkan batch ke tabel staging, melakukan validasi, menampilkan perubahan terhadap database per 50 baris, meminta tinjauan seluruh halaman serta alasan impor/koreksi, kemudian melakukan commit terpisah. Status sukses hanya muncul setelah RPC commit berhasil.

Mode tersebut membutuhkan VITE_RECOVERY_IMPORT_MODE=staging dan URL proyek Supabase pengujian. URL proyek produksi tagokvlsirebfgltbxmq diblokir secara eksplisit. Tanpa konfigurasi pengujian, panel terkunci dan tidak memanggil RPC.

27 tes lulus dan build berhasil. Transport aplikasi diuji melalui fungsi PostgreSQL lokal PGlite: prepare, append, validate, diff sebelum/sesudah, dan commit. Tes mencakup endpoint produksi terkunci, kegagalan append menghentikan alur, serta commit wajib terpisah dan beralasan. PGlite bukan pengganti pengujian server Supabase.

Kendala: pengguna belum memiliki proyek Supabase pengujian. Migrasi, RLS dengan JWT asli, concurrency lintas koneksi, batas waktu dan jaringan belum diuji di layanan tersebut. Fitur baca master persisten dan integrasi kasus manual/SP2D tetap belum selesai. Jangan aktifkan produksi berdasarkan hasil lokal ini.

Langkah berikutnya: siapkan proyek Supabase pengujian, terapkan dua draft migrasi hanya di proyek tersebut, uji menggunakan data simulasi dahulu, kemudian verifikasi impor workbook asli sesuai otorisasi. Kunci rahasia/password tidak perlu dikirim lewat chat.
