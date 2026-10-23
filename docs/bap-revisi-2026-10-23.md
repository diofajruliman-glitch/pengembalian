# Pemulihan klik Revisi BAP

23 Oktober 2026 (Asia/Jakarta).

Keluhan: klik **Revisi BAP** pada BAP selesai gagal. Pemeriksaan database online
menunjukkan aksi `revise` sudah tersedia. Uji sementara sebagai pemilik BAP
melalui role `authenticated` berhasil membuka revisi dan menyimpan; seluruh
perubahan uji dibatalkan melalui subtransaksi. Log RPC dalam 24 jam terakhir
yang diperiksa berstatus 200. Penyebab spesifik kejadian pengguna belum dapat
dipastikan tanpa pesan error dari browser.

Perbaikan menangani dua kondisi yang sebelumnya menghentikan klik tersebut:

- Bila revisi lokal tertinggal, baca BAP terbaru lalu ulangi pembukaan satu kali.
  Jawaban dan identitas formulir diisi dari respons terbaru.
- Bila respons jaringan hilang setelah server membuka draf milik akun yang sama,
  lanjutkan draf tersebut tanpa menulis pembukaan ulang kedua kalinya. Bila
  permintaan belum sampai dan BAP masih selesai, coba satu kali dengan revisi
  server. Bila respons kedua juga gagal, baca ulang sekali tanpa penulisan
  ketiga. Draf milik petugas lain tetap tidak diambil alih.

Simpan jawaban tetap memakai pemeriksaan revisi semula dan tidak mencoba ulang
otomatis. Tindakan yang sedang berjalan dijaga dari klik ganda dan polling.

Ditemukan pula bahwa skrip dasar `interview-portal.sql` belum memuat `revise`:
instalasi dasar atau pengulangan skrip dapat menonaktifkan revisi. Definisi dasar
diselaraskan dengan `interview-revisions.sql`, termasuk penolakan revisi null.
Jangan jalankan ulang skrip dasar pada produksi untuk perbaikan ini karena
fungsi produksi sudah memuat validasi tanda tangan yang lebih baru.

Validasi: 26 tes API, portal, revisi, tanda tangan, kategori, SPTJM, LHP dan entry
aplikasi lulus; `npm run build` berhasil. Simulasi browser pada komponen portal
asli memicu konflik saat klik revisi, lalu berhasil membuka draf dengan jawaban
server terbaru. Peserta dan jawaban simulasi bersifat fiktif.

Tidak diperlukan perubahan skema atau data produksi untuk pembaruan frontend ini.

## Konfirmasi pesan error dari pengguna

Pengguna kemudian memberikan pesan lengkap: `Failed to fetch dynamically
imported module: https://pengembalian.vercel.app/assets/docx-preview-BdP050U6.js`.
Ini menunjukkan kegagalan pemuatan modul pratinjau di browser. Tab lama masih
merujuk nama aset dari build sebelumnya setelah aplikasi diperbarui, sesuai
[penjelasan Vite](https://vite.dev/guide/build.html#load-error-handling).
Perbaikan pemulihan RPC sebelumnya bukan penyelesaian untuk pesan tersebut.

Modul `docx-preview`, `html2canvas`, dan `jspdf` kini diimpor statis bersama portal
BAP yang tetap dimuat secara lazy. Dengan demikian, ketiganya sudah tersedia
sebelum formulir BAP dibuka; pratinjau dan ekspor PDF tidak menunda unduhan
modul tersebut sampai pengguna menekan tombol dokumen.

Jika portal BAP sendiri gagal dimuat karena aset berganti atau koneksi terputus,
lazy loader menampilkan tombol **Muat ulang aplikasi**, tanpa memuat ulang secara
otomatis. HTML pada `/` dan `/index.html` menggunakan `Cache-Control: no-cache`;
cache aset dengan hash tetap dipertahankan.

Validasi tambahan: 19 tes dokumen, entry aplikasi, pemulihan modul dan graph
dependensi hasil bundling lulus; build produksi berhasil. Tes bundling memeriksa
bahwa ketiga pustaka dokumen berada pada graph impor statis sebelum aksi dokumen.
Tes pemulihan memakai pesan persis yang dilaporkan pengguna dan memastikan
reload hanya terjadi setelah tombol ditekan. Tab yang sudah memuat kode lama
tetap perlu dimuat ulang sekali setelah memastikan draf tersimpan.
