# Tahap 7 — koneksi API pengujian pada proyek yang sama

Implementasi lokal siap. Belum diterapkan di server dan belum deploy.

public.recovery_test_rpc menjadi satu pintu API untuk lima operasi impor: begin, append, validate, diff, commit. Fungsi hanya menerima akun admin yang sudah login, meneruskan operasi ke recovery_test, dan menolak tindakan di luar daftar. Tabel utama public tidak ditulis. Hak schema/tabel recovery_test untuk authenticated tetap tertutup.

Antarmuka hanya memakai adapter tersebut bila mode isolated-test diaktifkan pada URL proyek yang sesuai. Mode produksi default tetap tidak mengaktifkan tombol penyimpanan. API hanya diperlihatkan kepada admin.

29 tes lulus dan build berhasil. Pengujian PostgreSQL lokal meliputi adapter ke wrapper, staging dan commit, penolakan editor/tanpa login/aksi di luar daftar, serta penolakan akses langsung tabel. JWT asli, API server, concurrency dan performa file penuh tetap belum diuji.

Langkah berikutnya memerlukan aktivasi izin execute untuk authenticated pada wrapper admin-only, lalu pengujian browser menggunakan data simulasi. Script konkret: supabase/recovery-isolated-api.sql. Jangan mengklaim koneksi server sudah aktif sebelum script dan pemeriksaan server selesai.
