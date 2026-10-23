# Portal pewawancara & BAP

Akun `interviewer` masuk langsung ke portal khusus dan hanya membaca peserta
room penugasannya. Admin/editor/viewer membuka menu **Portal & Hasil BAP**.
Viewer hanya membaca. Admin dapat mengubah jadwal sebelum wawancara dimulai
dan membuka kembali BAP dengan alasan yang dicatat dalam audit.

## Alur

1. Setiap SDM di antrean memiliki tombol utama **Buka BAP**. Tepat di bawahnya tersedia
   dua tombol sekunder berukuran lebih kecil: **Perbandingan kategori** dan **Draf LHP**.
   Masing-masing tombol membuka popup khusus dengan judul lengkap untuk SDM tersebut.
   Popup **Buka BAP** berisi isian/pratinjau BAP
   dan SPTJM. Pilih peserta yang hadir; urutan jadwal tidak wajib diikuti.
   Draf kategori/LHP tetap dipertahankan ketika popup ditutup lalu dibuka lagi, BAP dibuka,
   atau daftar difilter. Keluar atau pindah menu meminta konfirmasi jika masih
   ada perubahan yang belum disimpan.
2. Konfirmasi identitas dan tekan **Mulai wawancara**. Server mencatat waktu
   mulai aktual satu kali untuk riwayat. Isian identitas/administrasi dan 22 jawaban
   BAP baru dibuka setelah tombol ini berhasil; sebelum itu popup menampilkan
   verifikasi peserta dan pilihan penundaan. Hari/tanggal/bulan/tahun BAP mengikuti
   jadwal wawancara peserta dalam WIB, bukan tanggal saat tombol mulai atau unduh ditekan.
3. Lengkapi administrasi dan 22 jawaban. Nama/NIP tidak ditulis ulang.
   Pangkat dan jabatan diambil dari referensi NIP yang sama dengan surat panggilan
   pada Persuratan & Dokumen Resmi (`nipPositionReference.js`). Koreksi pemeriksa
   yang sudah diisi tetap dipertahankan. Data yang tidak cocok ditandai untuk
   diverifikasi dan dilengkapi.
4. Jawaban disimpan otomatis ke database **1 menit setelah berhenti mengetik**.
   Setiap perubahan isian mengulang hitungan jeda, sehingga penyimpanan menunggu
   jeda mengetik berikutnya.
   Gunakan **Simpan draf** untuk menyimpan atau memperbarui isian kapan saja. Tunggu
   konfirmasi tersimpan sebelum menutup. Gangguan koneksi ditampilkan dengan
   jelas; jangan tutup halaman sebelum penyimpanan berhasil atau menyalin jawaban.
5. Bila peserta atau pelaksanaan terkendala, gunakan **Aktivitas & kendala wawancara → Laporkan kendala** pada popup BAP. Tulis 5–2.000 karakter lalu tekan **Kirim laporan kendala**. Laporan langsung tersedia pada monitoring pimpinan setelah tersimpan; jawaban BAP dapat tetap dikerjakan. Gunakan **Tandai kendala teratasi** setelah penanganan, dengan catatan penanganan opsional.
6. Jika wawancara belum dapat dimulai atau harus berhenti sementara, tekan **Tunda wawancara**, isi alasan wajib 5–2.000 karakter, lalu **Simpan sebagai Tertunda**. Alasan dan jawaban yang sedang diisi disimpan bersama. Pimpinan melihat status Tertunda beserta alasan dan waktunya. Gunakan **Lanjutkan wawancara** untuk meneruskan isian.
7. Setelah semua identitas wajib, nama/NIP pewawancara pendamping, dan **22 jawaban** lengkap, tekan **Selesai wawancara**. Penyelesaian memerlukan klik ini; mengetik atau menyimpan draf tidak menyelesaikan wawancara otomatis. Pratinjau dapat dipakai untuk memeriksa isi tetapi tidak menjadi syarat menekan tombol selesai.
8. Buka **Pratinjau BAP** bila ingin mengunduh **Word/PDF**. Isian belum lengkap mengunci unduhan. Gunakan **Kembali ke isian / revisi** untuk memperbaiki. Unduhan tidak otomatis menyelesaikan wawancara. Tombol **Selesai wawancara** menandai pemeriksaan selesai. Pewawancara sesuai room dapat
   menekan **Revisi BAP** untuk memperbaiki berkas; status kembali menjadi draf.
   Tekan **Selesai wawancara** lagi setelah diperiksa. Perubahan revisi mengharuskan kategori,
   SPTJM dan LHP terkait ditinjau kembali. Riwayat perubahan tetap tersimpan;
   tanda tangan tetap kosong untuk pengesahan. Admin juga tetap dapat membuka
   kembali/melepas kunci dengan alasan audit.

Word dihasilkan dari template BAP yang mempertahankan naskah, kop dan footer
asli. Identitas memakai kolom label/titik dua/nilai yang sejajar; tabel isi dan
tanda tangan putih tanpa garis. Blok Faisal dipertahankan, dan di bawahnya
terdapat blok pewawancara pendamping dengan nama serta NIP tersendiri. Jawaban diakhiri
strip pengisi sisa baris, dengan jarak antarbagiannya. Kotak paraf dan nomor
halaman dari footer dicetak pada setiap halaman Word dan PDF. PDF mengambil setiap halaman A4 dari pratinjau; teks jawaban panjang
dipindah ke halaman lanjutan. PDF berisi gambar halaman untuk menjaga tampilan,
sehingga teksnya tidak dapat diseleksi seperti pada Word. Font/editor Word/WPS
dapat menghasilkan pemenggalan halaman berbeda dari pratinjau browser.

## Monitoring, progres, dan kendala

Portal pewawancara, menu **Portal Wawancara**, dan **Monitoring Wawancara**
membaca `interview_cases` serta `interview_activity` dari database bersama.
Akun pimpinan dengan role `viewer` dapat membaca seluruh room; akun
`interviewer` hanya membaca room penugasannya. Identitas peserta terhubung
melalui NIK dan ID dataset asal. Acuan awal adalah jadwal resmi 1.057 ASN pada
26–29 Oktober 2026 dengan 19 room. Perubahan tanggal, jam, dan room dari database
langsung dipakai oleh monitoring dan roster portal.

| Tampilan | Makna |
| --- | --- |
| Terjadwal | Wawancara belum dimulai pada data BAP. |
| BAP dibuka | Petugas berwenang sedang membuka BAP; identitas belum tentu dikonfirmasi dan waktu mulai belum dicatat. |
| Dalam wawancara | Tombol Mulai wawancara telah berhasil mencatat waktu mulai aktual. |
| Draf | BAP telah disimpan atau dibuka kembali untuk revisi; belum dinyatakan selesai. |
| Tertunda | Wawancara dihentikan sementara atau belum dapat dimulai; alasan wajib dan waktu penundaan tersimpan. |
| Selesai | BAP telah difinalisasi dan memiliki waktu selesai. |
| Kendala terbuka | Laporan kendala perlu ditangani; dapat menyertai status wawancara. |
| Belum dimuat / Belum terhubung | Status database belum tersedia atau peserta belum terhubung ke kasus BAP. |

Saat popup BAP dibuka petugas yang berhak, aplikasi mengirim sinyal pembukaan
segera lalu heartbeat setiap **20 detik** selama popup terbuka. Viewer tidak
mengirim sinyal ini. Indikator kehadiran berlaku selama **90 detik** sejak
heartbeat terakhir; menutup popup atau kehilangan koneksi tidak mempertahankan
indikator aktif tanpa batas. Waktu mulai dan status selesai tetap mengikuti
kasus BAP. Status Tertunda tidak menampilkan indikator BAP aktif walaupun heartbeat terakhir masih baru. Sinyal membuka berkas tidak menekan Mulai wawancara secara otomatis.

Pembacaan kasus dan aktivitas berjalan setiap **5 detik** ketika halaman
terlihat, serta dicoba kembali saat kembali ke tab, fokus aplikasi, atau koneksi
pulih. Tombol **Perbarui monitoring** dapat dipakai untuk pembacaan manual.
Monitoring memakai satu pembacaan bersama untuk panel ringkasan, room, BNBA,
dan portal di dalam halaman tersebut; pengguna tidak perlu menyalin progres
ke kertas kerja lokal.

Progres menunjukkan **jawaban yang sudah tersimpan dari 22 pertanyaan** dan
persentasenya. Isian yang masih diketik belum masuk rekap pimpinan. Penyimpanan
BAP otomatis tetap menunggu satu menit setelah berhenti mengetik; **Simpan draf**
memperbarui progres lebih cepat. Kartu room menampilkan waktu sejak mulai;
aktivitas yang masih berlangsung tetap terlihat saat filter tanggal berbeda.
Antrean dan rekap selesai mengikuti tanggal terpilih.

Laporan kendala dapat dikirim sebelum atau selama wawancara, lalu diperbarui
atau ditandai teratasi. Laporan baru setelah BAP selesai ditolak; kendala yang
masih terbuka dapat ditandai teratasi. Admin/editor serta pewawancara sesuai
room dapat mengelola kendala; viewer hanya membaca. Kartu room, BNBA, dan portal
menampilkan isi laporan serta waktu pelaporan. Rincian BAP dan ekspor juga
menampilkan waktu serta catatan penanganan. Gunakan filter **Kendala terbuka**
pada BNBA untuk meninjau laporan yang memerlukan perhatian.

Status **Tertunda** berbeda dari laporan kendala. Laporan dapat menandai masalah
sambil wawancara tetap berjalan; **Tunda wawancara** mengubah status kasus BAP
menjadi Tertunda dan menghentikan isian sampai dilanjutkan. Monitoring memberi
hitungan/filter tersendiri dan menempatkan peserta tertunda di bagian terpisah
pada kartu room, tanpa timer aktif. Jadwalnya dikunci dari perubahan atau
distribusi, termasuk jika penundaan terjadi sebelum waktu mulai dicatat.

Saat dilanjutkan, jawaban tersimpan serta waktu mulai yang sudah ada dipertahankan.
Jika belum pernah dimulai, waktu mulai dicatat ketika Lanjutkan wawancara berhasil.
Alasan/waktu penundaan terakhir tetap tersimpan untuk audit dan ekspor; banner
penundaan aktif hanya tampil selama status Tertunda. CSV mencantumkan **Alasan
penundaan terakhir** dan **Waktu penundaan terakhir**, termasuk sesudah dilanjutkan.
Status lokal **Terkendala** pada mode offline tetap merupakan catatan browser.

Kendala mempunyai revisi tersendiri pada `interview_activity`. Perubahan laporan
tidak menaikkan `interview_cases.revision`, mengambil alih kunci BAP, mengubah
jawaban, atau membatalkan status selesai maupun dokumen terkait. Heartbeat tidak
menaikkan revisi laporan. Konflik perubahan laporan antarakun ditolak;
catatan formulir tetap tersedia untuk disalin sebelum membuka laporan terbaru.
Hanya pembukaan pertama dan perubahan laporan masuk audit aktivitas permanen.

Jika pembacaan gagal, halaman memperlihatkan gangguan koneksi dan waktu
pembaruan terakhir. Data terakhir diberi penanda; status lokal tidak menggantikan
status database. Jika kasus BAP berhasil dibaca tetapi aktivitas/kendala belum
pernah berhasil dibaca, kendala ditampilkan **belum tersedia**. Laporan lama yang
sudah dimuat dipertahankan dengan penanda data terakhir sampai pembacaan pulih.

Jadwal kerja, nama Zoom, catatan koordinasi, dan posisi/catatan kunjungan pimpinan
pada kertas kerja tetap lokal per browser/akun/sumber. Catatan ini tidak menjadi
laporan kendala bersama. Gunakan panel kendala pada BAP untuk laporan lintas akun.
Admin dapat meninjau perbedaan lalu menekan **Kirim perubahan jadwal lokal**;
batch ditolak seluruhnya jika revisi berubah, slot bentrok, atau peserta sudah
mulai/tertunda. Mengubah label penugasan room lokal tidak mengganti akun database.
Ekspor monitoring bersama membedakan catatan lokal dari laporan kendala dan
mencantumkan sumber jadwal serta kesegaran pembacaan. Mode offline mempertahankan
format ekspor dan penyimpanan lokalnya.

Tombol **Buka BAP** tersedia pada BNBA monitoring dan pencarian/roster portal.
Di Kategorisasi Disiplin ASN juga tersedia tautan hasil BAP, termasuk peserta
terpilih. Jawaban dan kendala tidak mengubah kategori/sanksi secara otomatis.

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

### Aktivasi monitoring bersama

Jalankan `supabase/interview-monitoring-activation.sql` setelah skema portal,
`supabase/interview-revisions.sql`, dan `supabase/interview-signatories.sql` pada
instalasi baru. SQL menambahkan `interview_activity`, audit privat, RLS, grant
baca, dan RPC `interview_activity_action` untuk sinyal pembukaan serta laporan
kendala. Status, jawaban, dan revisi BAP berada pada tabel terpisah.

Pada **23 Oktober 2026**, aktivasi monitoring ini sudah diterapkan ke project
Supabase yang terhubung melalui `execute_sql`. Penerapan tersebut tidak membuat
entri riwayat migrasi Supabase. Frontend dirilis melalui branch `main` ke proyek
Vercel `pengembalian` pada https://pengembalian.vercel.app. Pemeriksaan baca akun pimpinan sebagai `viewer` berhasil
mengakses 1.057 kasus dan tabel aktivitas. Pemeriksaan tidak menambahkan sinyal
aktivitas atau jawaban peserta produksi.

Verifikasi 23 Oktober 2026: 145 pengujian terkait BAP/wawancara lulus,
diikuti 19 pemeriksaan terarah pada proyeksi status, ekspor, tampilan, dan API
setelah perbaikan terakhir; build produksi berhasil. Uji browser lintas tab
dengan tiga peserta sintetis memeriksa BAP dibuka, mulai, laporan kendala saat
jawaban belum disimpan, simpan draf tanpa konflik, progres 1/22 pada akun
pimpinan, kendala teratasi, status selesai 22/22, dan penanda data usang saat
pembacaan aktivitas terputus. Data peserta produksi tidak digunakan sebagai
fixture. RPC pembukaan juga diuji di database terhubung dalam transaksi yang
di-rollback; revisi BAP tetap sama dan tidak ada aktivitas uji yang disimpan.

### Aktivasi alur Tertunda

`supabase/interview-deferral.sql` menambahkan status `Tertunda`, kolom
`deferred_reason`, `deferred_at`, `deferred_by`, dan aksi BAP `defer`. Penundaan
merupakan perubahan kasus BAP dengan pemeriksaan revisi/kepemilikan; jawaban dan
waktu mulai dipertahankan. Aksi `start` melanjutkan dan alasan terakhir tetap
tersimpan. Jalankan setelah skema portal, revisi, penandatangan, dan aktivasi
monitoring bersama. SQL penundaan telah diterapkan pada project terhubung pada
**23 Oktober 2026** melalui `execute_sql`, tanpa entri riwayat migrasi. Uji
transaksi defer → start dan penolakan selesai saat tertunda berhasil di database
terhubung, lalu di-rollback. Jumlah/status dan jawaban peserta produksi tetap
sama. Deployment frontend diverifikasi terpisah dari aktivasi database melalui
status produksi Vercel dan pemeriksaan halaman online.

Pembaruan alur ini lulus **157 pengujian** serta build produksi. Browser simulasi
lintas tab memverifikasi isian tersembunyi sebelum Mulai, alasan kosong ditolak,
penundaan sebelum/sesudah mulai, penyimpanan jawaban bersama alasan, kelanjutan
tanpa kehilangan jawaban, dan tombol Selesai terkunci sampai seluruh isian
lengkap. Mengisi 22 jawaban tetap menghasilkan draf sampai tombol Selesai ditekan.

## Verifikasi

```bash
node --test tests/interviewLifecycle.test.js tests/interviewDeferralDatabase.test.js tests/interviewProgressApi.test.js tests/interviewMonitoringDatabase.test.js tests/interviewLiveMonitoring.test.js tests/interviewMonitoringView.test.js tests/interviewMonitoringExport.test.js tests/bapPortal.test.js tests/interviewerAccounts.test.js tests/interviewOfficialSchedule.test.js tests/interviewStorage.test.js
npm run build
```

Tes monitoring memeriksa pembacaan lintas room untuk viewer, pembatasan penulisan,
revisi kendala terpisah, progres tersimpan, kedaluwarsa indikator pembukaan,
pembacaan parsial/gagal, pindah jadwal/room, dan keamanan ekspor CSV. Verifikasi
browser menggunakan backend simulasi untuk menghindari pengisian keterangan atau
aktivitas peserta riil. Cakupan portal dokumen meliputi mulai pemeriksaan,
pengisian dan penyimpanan, pratinjau, revisi, serta unduhan Word/PDF.

Untuk mengisi pangkat/jabatan yang masih kosong pada data portal lama:

```bash
node scripts/prepare_interview_positions.mjs > /tmp/interview-positions.sql
```

Tinjau dan jalankan SQL tersebut. Pencocokan memakai NIP, hanya mengisi kolom
sumber yang kosong, serta mempertahankan jawaban, koreksi pemeriksa, dan BAP yang
sudah difinalisasi. Akun pewawancara menerima identitas melalui database sesuai
room; seluruh referensi NIP tidak dimuat ke frontend portal.

## Perbandingan kategori sebelum dan sesudah wawancara

Pada kartu SDM di antrean, tekan tombol kecil **Perbandingan kategori awal dan hasil
wawancara** di bawah tombol **Buka BAP** untuk membuka popup kategorisasi.
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
Blok identitas memakai tiga kolom tanpa garis (label, titik dua, dan isi) agar
Nama, NIP, NIK, Jabatan, Unit Kerja, Provinsi, Kabupaten/Kota, dan Nomor Handphone
sejajar. Isian panjang membungkus pada kolom isi tanpa menggeser titik dua.
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

### Draf LHP

Pada kartu SDM di antrean, tekan tombol kecil **Draf LHP — analisis, rekomendasi dan unduhan** di bawah tombol **Buka BAP** untuk membuka popup LHP tersendiri. Identitas mengikuti BAP; dasar, temuan awal PPATK **2025**, 22 keterangan BAP, perbandingan kategori, serta pertimbangan peninjau menjadi bahan awal. Nominal/frekuensi yang tidak tersedia ditampilkan sebagai belum tersedia, bukan nol. Seluruh bagian dapat direvisi. Rekomendasi tindak lanjut diisi pemeriksa, tanpa pemetaan sanksi otomatis.

Simpan draf, periksa pratinjau, lalu kembali revisi bila diperlukan. Unduhan Word/PDF memerlukan BAP selesai, kategori akhir yang sudah ditetapkan atas revisi BAP terkini, SPTJM terkonfirmasi atas BAP terkini, seluruh bagian lengkap, serta peninjauan isi LHP. Setiap dokumen tetap bertanda **DRAF — BELUM DISAHKAN**; peninjauan aplikasi bukan pengesahan pejabat. Nomor boleh kosong sampai ditetapkan. Template LHP merupakan format kerja modular, bukan template resmi yang diunggah pengguna.

Jika BAP, penilaian atau SPTJM berubah, unduhan dinonaktifkan. Gunakan **Susun ulang dari sumber terbaru** (meminta konfirmasi karena mengganti bagian narasi); nomor, tempat dan rekomendasi dipertahankan. Periksa kembali semuanya sebelum menandai telah ditinjau. Menutup popup mempertahankan perubahan lokal; perubahan belum tersimpan memicu peringatan saat keluar atau pindah menu.

Aktivasi database: `supabase/interview-reports.sql` melalui migrasi Supabase. Tabel ber-RLS, pembacaan dan RPC dibatasi room/role, penulisan menggunakan pemeriksaan pemilik wawancara dan revisi sumber, serta tersimpan pada audit privat. Migrasi menyiapkan draf kosong untuk kasus yang ada dan trigger untuk kasus baru. `scripts/prepare_lhp_template.py` membangun ulang template Word. PDF berupa gambar halaman pratinjau A4; tata letak Word dapat berbeda menurut font/editor.

Validasi: `node --test tests/lhp.test.js tests/sptjm.test.js tests/interviewCategories.test.js tests/bapPortal.test.js`, `npm run build`; uji browser mencakup narasi panjang lintas halaman, unduhan Word/PDF, invalidasi revisi, dan tampilan akun pewawancara tanpa mengubah keterangan peserta.


### Pembaruan format dan revisi BAP

Terapkan `supabase/interview-revisions.sql` setelah skema portal. Migrasi hanya
memperbarui fungsi tindakan: tidak mengubah jawaban peserta. Aksi `revise`
memeriksa role/room/revisi, mempertahankan waktu mulai serta isi, menulis audit,
dan membuka draf untuk aktor berwenang. Revisi yang usang ditolak.

`node --test tests/bapTemplateLayout.test.js tests/interviewRevisions.test.js`
menguji struktur kop inline, footer paraf, perataan identitas, tanda tangan bersih,
serta otorisasi dan riwayat revisi. Uji browser memeriksa jawaban panjang,
kop di PDF, paraf tiap halaman, tanggal jadwal, simpan manual, dan jeda mengetik 60000 ms (diulang setiap perubahan).


### Penandatangan pewawancara pendamping

BAP memuat tiga blok: yang diperiksa di kiri, pemeriksa Faisal di kanan, serta
pewawancara pendamping di bawah Faisal. Ruang tanda tangan tetap kosong.
Nama/NIP peserta dan identitas Faisal tidak diganti oleh identitas pewawancara.

Pada **Identitas & administrasi → Pewawancara pendamping**, nama awal mengikuti
akun yang menangani berkas (`locked_by`), atau penugasan room jika belum dimulai.
Admin/viewer yang membuka berkas memakai sumber petugas berkas tersebut.
Untuk akun unit/room, isi nama lengkap orang yang melaksanakan wawancara.
Nama/NIP yang sudah disimpan dalam BAP dipertahankan saat dibuka ulang.

Data akun saat pembaruan ini belum memuat NIP. Pewawancara melengkapi NIP
18 digit pada kolom tersebut; aplikasi tidak menebak atau memakai NIP peserta.
Draf dan simpan otomatis boleh menyimpan NIP yang belum lengkap. Unduhan
serta finalisasi memerlukan nama dan NIP pewawancara yang lengkap dan valid.
Berkas lama yang telah selesai dapat dilengkapi melalui **Revisi BAP**.

Aktivasi tambahan: `supabase/interview-signatories.sql` setelah migrasi revisi.
RPC `interview_signatory_source` dibatasi per role dan room. Identitas pendamping
disimpan dalam `identity_details` melalui RPC BAP yang memeriksa revisi dan
mencatat audit; penyiapan ini tidak mengganti jawaban atau identitas berkas lama.
Tes: `tests/interviewSignatories.test.js`, `tests/bapTemplateLayout.test.js`,
dan `tests/bapPortal.test.js`, ditambah pemeriksaan browser dan Word/PDF.
