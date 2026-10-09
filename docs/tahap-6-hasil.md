# Tahap 6 — pengujian server pada proyek Supabase yang ada

Tanggal: 9 Oktober 2026. Proyek: tagokvlsirebfgltbxmq. Sesuai arahan pengguna, tidak membuat proyek Supabase tambahan.

Schema recovery_test dibuat pada database yang sudah digunakan. Berisi sembilan tabel pengujian dan fungsi impor yang terpisah dari tabel public aplikasi utama. Seluruh tabel pengujian memiliki RLS aktif. Hak schema, tabel, sequence dan fungsi untuk public/anon/authenticated dicabut; schema belum dibuka ke aplikasi/API.

Pengujian melalui SQL Editor dengan data simulasi lulus: append ulang tanpa duplikasi, validasi batch, detail perubahan, commit ulang tanpa duplikasi, koreksi 25.000 menjadi nol, rekap tidak cocok ditolak, dan operasi tanpa identitas login ditolak. Tersisa satu SDM simulasi, dua batch committed dan satu batch preview yang sengaja tidak cocok; semua hanya di recovery_test.

Jumlah baris tabel utama sebelum dan sesudah tetap sama: profiles 3, bottlenecks 10, action_plans 15, sdm_cases 0. Skrip migrasi dan smoke test tidak menulis ke tabel public tersebut. Data workbook asli belum dikirim atau diimpor ke server.

Batas pengujian: SQL Editor memakai role postgres dan identitas simulasi sesi, bukan JWT browser asli. Pengujian API, RLS dengan JWT asli, concurrency lintas koneksi dan performa workbook lengkap masih belum dilakukan. Database fisik yang sama berbagi sumber daya; schema terpisah tidak memisahkan kapasitas server.

Tidak ada deployment baru. UI penyimpanan pada proyek produksi masih terkunci. Langkah selanjutnya: siapkan jalur pengujian API yang hanya menuju recovery_test, tinjau izin aksesnya, lalu uji browser sebelum mengaktifkan master produksi.

Verifikasi lokal: 28 tes otomatis lulus, termasuk skrip schema terisolasi dan smoke test yang sama.
