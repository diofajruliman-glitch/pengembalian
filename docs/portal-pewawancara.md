# Portal pewawancara & BAP

Akun `interviewer` masuk langsung ke portal khusus dan hanya membaca peserta
room penugasannya. Admin/editor/viewer membuka menu **Portal & Hasil BAP**.
Viewer hanya membaca. Admin dapat mengubah jadwal sebelum wawancara dimulai
dan membuka kembali BAP dengan alasan yang dicatat dalam audit.

## Alur

1. Pilih peserta yang hadir dari antrean; urutan jadwal tidak wajib diikuti.
2. Konfirmasi identitas dan tekan **Mulai wawancara**. Server mencatat waktu
   mulai aktual satu kali. Tanggal BAP dihitung dalam WIB dan tidak berubah
   ketika dokumen diunduh di hari lain.
3. Lengkapi administrasi dan 22 jawaban. Nama/NIP tidak ditulis ulang.
   Pangkat/jabatan kosong ditandai untuk diverifikasi dan dilengkapi; aplikasi
   tidak mengasumsikan pangkat atau jabatan yang tidak ada pada sumber.
4. Jawaban disimpan ke database setiap empat detik setelah perubahan. Tunggu
   konfirmasi tersimpan sebelum menutup. Gangguan koneksi ditampilkan dengan
   jelas; jangan tutup halaman sebelum penyimpanan berhasil atau menyalin jawaban.
5. Buka **Pratinjau BAP**. Isian yang belum lengkap mengunci unduhan dan finalisasi.
   Gunakan **Kembali ke isian / revisi** untuk memperbaiki.
6. Unduh **Word** atau **PDF**. Unduh tidak otomatis memfinalisasi.
7. **Finalisasi BAP** mengunci perubahan. Admin harus memasukkan alasan jika
   berkas perlu dibuka kembali. Tanda tangan tetap kosong untuk pengesahan.

Word dihasilkan dengan mengisi placeholder pada paket DOCX asli yang diberikan
pengelola. PDF mengambil setiap halaman A4 dari pratinjau; teks jawaban panjang
dipindah ke halaman lanjutan. PDF berisi gambar halaman untuk menjaga tampilan,
sehingga teksnya tidak dapat diseleksi seperti pada Word. Font/editor Word/WPS
dapat menghasilkan pemenggalan halaman berbeda dari pratinjau browser.

## Monitoring dan kategorisasi

Portal menggunakan 1.057 jadwal resmi 26–29 Oktober 2026 dari sumber yang sama
dengan Monitoring Wawancara. Identitas dicocokkan dengan NIK pada dataset
Disiplin ASN tersimpan; setiap berkas mereferensikan ID dataset asal.

Panel database bersama pada monitoring menampilkan progres BAP setiap 15 detik.
Kertas kerja operasional Zoom tetap lokal. Admin dapat meninjau jumlah perbedaan
jadwal dan menekan **Kirim perubahan jadwal lokal** untuk meneruskannya ke portal.
Batch ditolak seluruhnya jika ada versi data berubah, slot bentrok, atau peserta
sudah memulai wawancara. **Ambil jadwal dari portal** menyalin jadwal/progres BAP
ke kertas kerja lokal. Perubahan label pewawancara lokal tidak mengganti akun
atau penugasan database.

Tombol **Buka BAP** tersedia pada baris BNBA monitoring. Di Kategorisasi Disiplin
ASN tersedia tautan hasil BAP, termasuk peserta terpilih. Jawaban tidak mengubah
kategori/sanksi secara otomatis.

## Database

Skema aktivasi ada di `supabase/interview-portal.sql` dan sudah diterapkan pada
project yang terhubung. Untuk instalasi baru, jalankan aktivasi akun lebih dulu,
kemudian skema portal. Jadwal dapat disiapkan dengan:

```bash
node scripts/prepare_interview_schedule.mjs > /tmp/interview-schedule.sql
```

Tinjau hasilnya, lalu jalankan pada database tujuan. Seed hanya menambah peserta
yang cocok dengan dataset aktif dan tidak menimpa pemeriksaan yang sudah ada.
Script aktivasi awal bukan script untuk dijalankan ulang pada tabel yang sudah ada.

RLS membatasi pembacaan berdasarkan peran dan room. Seluruh mutasi memakai RPC
dengan pemeriksaan aktor, kepemilikan room, kunci pemeriksaan, dan nomor revisi.
Implementasi berprivilege berada di skema `interview_private`, di balik wrapper
publik berjenis `SECURITY INVOKER`. Skema private tidak boleh dimasukkan ke daftar
schema Data API yang diekspos. Tabel audit tidak memiliki grant atau policy untuk
akses langsung pengguna. Tidak ada kata sandi atau kunci admin di frontend.

## Verifikasi

```bash
node --test tests/bapPortal.test.js tests/interviewerAccounts.test.js tests/interviewOfficialSchedule.test.js tests/interviewStorage.test.js tests/interviews.test.js tests/interviewRoutingIntegration.test.js
npm run build
```

Pengujian browser mencakup antrean, mulai pemeriksaan, pengisian, simpan otomatis,
pratinjau enam halaman dengan jawaban panjang, revisi, unduhan Word/PDF, tampilan
ponsel, login nyata, pembatasan room, dan logout. Data jawaban untuk pengujian
browser menggunakan backend simulasi, sehingga tidak mengisi BAP peserta riil.
