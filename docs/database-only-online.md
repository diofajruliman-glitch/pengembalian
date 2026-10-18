# Sumber data operasional online

18 Oktober 2026. Kebijakan pengguna: daftar operasional online menggunakan data yang sudah tersimpan di database.

## Perubahan

- Matriks dan rencana aksi produksi dimulai kosong sampai pembacaan Supabase berhasil; kegagalan tidak menampilkan seed demo.
- Cache analisis browser tidak dipercaya pada sesi online. Perubahan akun membersihkan data sebelumnya dan respons terlambat tidak diterapkan ke akun baru.
- BNBA wawancara dan penerima surat Disiplin ASN menggunakan respons `discipline_rpc load` terbaru untuk ID versi tersimpan dan akun yang sedang aktif. Baris draft Excel atau perubahan lokal tidak menggantikan respons tersebut. Versi yang belum tersimpan menampilkan petunjuk pemilihan dataset online.
- Daftar statis `REAL_DISCIPLINE_DATA` tidak lagi diimpor atau digabungkan ke penerima surat. Jumlah peserta mengikuti database; tidak dipaksa menjadi 1.057 atau 1.357.
- Sumber penerima surat manual dinonaktifkan online. Sumber kosong menghasilkan nol dokumen dan tombol salin/cetak/unduh dinonaktifkan.
- Database, migrasi, data peserta dan hasil kategorisasi tidak diubah. Jadwal dan catatan wawancara masih merupakan kertas kerja lokal browser sesuai lingkup modul sementara.

## Verifikasi

Enam pengujian kebijakan sumber mencakup cache/draft yang ditolak, respons database yang digunakan, pergantian akun/versi, ID respons yang berbeda, kegagalan RPC, dan alur demo lokal. Rangkaian terkait: 127 lulus, satu pengujian workbook riil dilewati karena berkas acuannya tidak disediakan pada proses tes. Pengujian browser terisolasi membuktikan sumber kosong tetap nol penerima dan satu baris uji tetap satu penerima; tidak digabungkan dengan daftar statis. Bukti dan data uji berada di `.local-analysis/`, diabaikan Git dan tidak menjadi entry build Vite.

Pembuktian sumber melalui RPC tidak membuktikan kebenaran setiap baris database. Jumlah dan isi dataset online perlu diperiksa menggunakan sesi petugas yang berwenang; pemeriksaan anonim hanya mencapai halaman login.
