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
   Pangkat dan jabatan diambil dari referensi NIP yang sama dengan surat panggilan
   pada Persuratan & Dokumen Resmi (`nipPositionReference.js`). Koreksi pemeriksa
   yang sudah diisi tetap dipertahankan. Data yang tidak cocok ditandai untuk
   diverifikasi dan dilengkapi.
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

Untuk mengisi pangkat/jabatan yang masih kosong pada data portal lama:

```bash
node scripts/prepare_interview_positions.mjs > /tmp/interview-positions.sql
```

Tinjau dan jalankan SQL tersebut. Pencocokan memakai NIP, hanya mengisi kolom
sumber yang kosong, serta mempertahankan jawaban, koreksi pemeriksa, dan BAP yang
sudah difinalisasi. Akun pewawancara menerima identitas melalui database sesuai
room; seluruh referensi NIP tidak dimuat ke frontend portal.

## Perbandingan kategori sebelum dan sesudah wawancara

Buka peserta lalu perluas **Perbandingan kategori awal dan hasil wawancara**.
Panel menampilkan kategori awal setelah ASN, kategori historis, status sumber,
nama dataset dan versinya. Snapshot awal diambil dari dataset asal peserta dan
tersimpan terpisah; jawaban BAP maupun usulan tidak menimpa data ini.

Pewawancara dapat memilih usulan kategori, menuliskan alasan dan hasil verifikasi
bukti, serta merujuk nomor jawaban BAP yang telah tersimpan. Draf dapat dibuat
selama wawancara; pengajuan kepada admin memerlukan BAP yang sudah difinalisasi,
alasan minimal 20 karakter, kategori yang dipilih, dan setidaknya satu jawaban
pendukung. Tidak ada kesimpulan atau sanksi yang dipilih otomatis dari pengakuan,
penyangkalan, nominal transaksi, atau kondisi ekonomi.

Status penilaian: **Belum diisi → Draf / Perlu pendalaman → Diajukan → Ditetapkan**.
Admin dapat menetapkan kategori akhir yang berbeda dari usulan dengan alasan,
atau mengembalikannya untuk pendalaman. Editor/pewawancara tidak dapat menetapkan
kategori akhir; viewer hanya membaca. Riwayat menampilkan 15 perubahan terakhir,
nama petugas, waktu WIB, kategori, dan pertimbangan. Seluruh peristiwa tersimpan
pada tabel riwayat tanpa izin ubah/hapus langsung dari aplikasi.

Penilaian merujuk nomor revisi BAP. Jika BAP dibuka atau diubah, keputusan lama
langsung ditampilkan sebagai **Perlu ditinjau ulang**, bukan kategori akhir aktif.
Pemeriksa perlu meninjau dan mengajukan kembali berdasarkan BAP terbaru. Hasil
ini belum mengubah kategori awal dalam modul analisis atau menghasilkan LHP.

Aktivasi tambahan: `supabase/interview-categories.sql` (sudah diterapkan pada
project yang terhubung). Jalankan sekali setelah skema portal pada instalasi
baru. Trigger menangkap kategori awal untuk peserta baru berikutnya.

## SPTJM

Buka peserta dan perluas **SPTJM — pernyataan, pratinjau dan unduhan**. Nama,
NIP, NIK, jabatan, unit kerja dan tanggal mengikuti BAP. Wilayah dan nomor HP
berasal dari data surat panggilan; data kosong tetap ditandai untuk dilengkapi.

Pilihan **Mengakui / Tidak mengakui** tidak diisi otomatis dari jawaban bebas.
Q11 dan Q12 ditampilkan sebagai acuan agar pewawancara dapat mencocokkan isi
bersama peserta. Untuk pengakuan, tersedia periode sudah berhenti, masih
berlangsung, atau tidak diingat secara pasti. Pilihan tidak mengakui tidak
menghasilkan kalimat yang menyatakan peserta pernah mulai bermain. Kalimat
periode disesuaikan pada template agar tidak memaksa keterangan yang berbeda.
Pernyataan bukti terlampir hanya dicetak jika pewawancara menandai bahwa dokumen
pendukung disertakan secara terpisah bersama SPTJM; tidak ada unggahan otomatis.

Draf dapat disimpan dan dipratinjau selama wawancara. Unduhan Word/PDF memerlukan
BAP final, semua isian wajib lengkap, serta konfirmasi bahwa peserta telah
memeriksa isi pernyataan. Perubahan isian menghapus konfirmasi lokal sampai
peserta mengonfirmasinya kembali. Jika revisi BAP berubah, unduhan SPTJM lama
dikunci sampai peninjauan dan konfirmasi ulang. Tidak ada tanda tangan digital
atau pengesahan otomatis; ruang tanda tangan dan materai mengikuti template.

Word memakai paket DOCX asli lampiran SPTJM. PDF mengikuti halaman pratinjau.
Aktivasi: `supabase/interview-statements.sql` setelah skema portal. Untuk mengisi
kontak dari jadwal resmi pada instalasi baru, siapkan SQL berikut untuk ditinjau
kemudian dijalankan pada database yang sesuai:

```bash
node scripts/prepare_sptjm_contacts.mjs > /tmp/sptjm-contacts.sql
```

Seed hanya mengisi kontak yang kosong pada SPTJM yang belum dikonfirmasi.
RLS membatasi peserta berdasarkan room; mutasi memeriksa aktor, pemilik
pemeriksaan, revisi BAP dan revisi SPTJM. Perubahan dicatat pada audit private.
SPTJM ini tidak mengubah hasil kategorisasi dan belum menghasilkan LHP.
