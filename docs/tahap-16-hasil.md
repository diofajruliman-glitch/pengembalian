# Tahap 16 — jalur API referensi kasus siap untuk pengujian

Tanggal: 10 Oktober 2026. Perubahan lokal, belum diterapkan ke Supabase dan tidak deploy.

API publik yang disiapkan: recovery_case_test_rpc. Role authenticated hanya memperoleh execute pada wrapper; wrapper dan fungsi internal memeriksa role admin. Operasi dibatasi prepare referensi, commit referensi, metadata monitoring dan pembacaan monitoring. Tidak ada endpoint untuk update kasus/nominal/status/PIC/catatan. Schema/tabel pengujian tetap tidak dapat diakses langsung oleh authenticated.

Adapter aplikasi hanya aktif dengan VITE_RECOVERY_CASE_MODE=case-test pada URL proyek yang sesuai dan role admin. Default off. Panel menyediakan pencarian pilihan kasus yang lolos, batas 1–500 kasus, prepare di server, checkbox tinjauan, alasan wajib, commit terpisah serta pemuatan monitoring melalui referensi. Kasus simulasi tidak diberi akses penyimpanan. Data file lokal tanpa revisi master tersimpan tidak dapat menjadi payload.

47 tes lulus, build berhasil. Pengujian PostgreSQL lokal menjalankan adapter sebagai role authenticated dengan identitas admin: prepare, commit idempotent dan pemuatan tiga kasus berhasil. Operasi update_cases ditolak. Identitas editor ditolak. Fingerprint monitoring, pemeliharaan data manual, rollback dan pemeriksaan stale tetap lulus.

Skrip aktivasi gabungan: supabase/recovery-case-test-activation.sql. Satu transaksi, preconditions diperiksa, tidak menghapus/mereset tabel yang sudah ada dan tidak memasukkan kasus simulasi ke tabel utama. Berhenti bila schema referensi sudah diinisialisasi. Skrip hanya dibuat lokal, belum dijalankan.

Kendala berikutnya: izin API baru perlu konfirmasi saat aktivasi melalui dashboard, lalu uji autentikasi/browser asli. Tabel kasus utama sebelumnya kosong; skrip tidak menciptakan kasus contoh di sana. Pengujian simpan yang berhasil memerlukan kasus nyata yang telah ditinjau atau lingkungan data kasus simulasi yang terisolasi secara eksplisit. API tidak boleh dinyatakan siap produksi berdasarkan tes PGlite saja.

Pemetaan SP2D masih menunggu informasi sumber nomor/tanggal/tahun dari pengguna. Tidak ada push atau deployment pada tahap ini.

Skrip aktivasi gabungan juga diuji langsung di PostgreSQL lokal: aktivasi pertama berhasil, pengulangan berhenti CASE_TEST_ALREADY_INITIALIZED tanpa reset data.
