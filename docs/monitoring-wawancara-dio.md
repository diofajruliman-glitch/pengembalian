# Monitoring Wawancara — Dio dan pimpinan

Menu **Monitoring Wawancara** menghubungkan pelaksanaan di portal BAP dengan tampilan pimpinan. Saat backend terhubung, kartu room, BNBA, dan tab **Portal Wawancara** membaca status, waktu aktual, jawaban tersimpan, dan laporan kendala dari database bersama. Akun pimpinan dengan role `viewer` dapat membaca seluruh room. Admin/editor dapat menyiapkan catatan kerja; perubahan jadwal database dikirim oleh admin.

Populasi awal mengikuti seluruh ASN **Terbukti** pada versi aktif Kategorisasi Disiplin ASN, dengan jadwal resmi 1.057 ASN sebagai acuan bawaan jika sumber tersebut belum tersedia. Filter analisis tidak memperkecil populasi wawancara. Kasus BAP dari database yang berada di luar populasi lokal ikut ditampilkan agar aktivitasnya tetap terpantau. Nama dan identitas dicocokkan melalui NIK/NIP, tanpa menulis ulang peserta pada tiap catatan.

## Acuan jadwal resmi

Acuan pelaksanaan saat ini adalah **26–29 Oktober 2026**, **19 breakout room**, dan **14 slot per room per hari** dengan durasi **30 menit**. Jam kegiatan 08.30–12.00 dan 13.00–16.30 WIB. Alokasi awal memuat 265 peserta pada 26 Oktober, lalu 264 peserta pada masing-masing tanggal 27–29 Oktober. Jadwal resmi membagi kategori Berat/Sedang/Ringan ke 19 room.

Ketika terhubung, tanggal, jam, room, waktu mulai, dan waktu selesai pada monitoring mengikuti kasus BAP di database. Tampilan menggunakan 19 room resmi dan tetap menampilkan assignment lain yang tersedia pada kasus database, termasuk ketika draft lokal masih menggunakan roster lama. Nomor sesi diturunkan dari jam slot resmi; perubahan sesi lokal tidak menjadi waktu aktual wawancara. Data pemanggilan yang belum terhubung diberi label acuan lokal.

Kertas kerja lama dari `draft-penugasan-pewawancara.csv` dapat memiliki 18 room, 11 peserta per room per hari, durasi 40 menit, serta kebijakan Berat ke Itjen/OSDM. Draft tersebut tidak dikonversi atau dihapus otomatis. Periksa parameter dan penugasannya sebelum menyusun jadwal baru. Aturan validasi distribusi lokal tetap memakai konfigurasi workspace; jadwal resmi yang ditampilkan dari database tidak dipindah secara otomatis oleh aturan draft lokal.

## Status dan progres bersama

| Tampilan | Sumber dan arti |
| --- | --- |
| Terjadwal | Kasus BAP belum memiliki waktu mulai. |
| BAP dibuka | Ada heartbeat pembukaan BAP dari petugas berwenang dalam 90 detik terakhir; wawancara belum dimulai. |
| Dalam wawancara | Tombol Mulai wawancara telah mencatat waktu mulai aktual. |
| Draf | Jawaban telah disimpan atau BAP dibuka kembali untuk revisi; belum dinyatakan selesai. |
| Tertunda | Wawancara dihentikan sementara atau belum dapat dimulai, dengan alasan wajib serta waktu penundaan. |
| Selesai | BAP telah difinalisasi; waktu selesai tersedia. |
| Kendala terbuka | Laporan kendala masih perlu ditangani, terpisah dari status BAP. |
| Belum dimuat / Belum terhubung | Pembacaan belum tersedia atau peserta belum memiliki kasus BAP yang dapat dibaca. |

Panel **Portal BAP · monitoring bersama** dan rekap menampilkan jumlah BAP dibuka, dalam wawancara, draf, tertunda, selesai, dan kendala terbuka. BNBA serta kartu room menampilkan **jumlah jawaban tersimpan dari 22 pertanyaan** dan persentasenya. Waktu sejak mulai berasal dari waktu aktual BAP. Aktivitas yang sedang berlangsung serta peserta tertunda tetap terlihat pada kartu room walaupun filter tanggal menunjuk hari lain; antrean berikutnya dan jumlah selesai mengikuti tanggal terpilih.

Pembacaan database berjalan setiap **5 detik** ketika halaman terlihat. Kembali ke tab, fokus aplikasi, atau koneksi pulih memicu pembacaan baru. Gunakan **Perbarui monitoring** bila diperlukan. Panel ringkasan, kartu room, BNBA, dan portal di dalam monitoring memakai hasil pembacaan yang sama. Status pelaksanaan tampil otomatis tanpa tindakan menyalin progres ke kertas kerja lokal.

Petugas yang berwenang mengirim sinyal ketika popup BAP dibuka dan heartbeat setiap **20 detik** selama popup terbuka. Viewer tidak mengirim sinyal pembukaan. Indikator kehadiran kedaluwarsa setelah **90 detik** tanpa heartbeat. Status BAP yang sudah dimulai atau selesai tetap mengikuti rekaman kasus. Tertunda mengalahkan sinyal pembukaan dan dikeluarkan dari daftar aktivitas aktif. Membuka BAP untuk persiapan tidak mencatat waktu mulai wawancara.

Progres pimpinan hanya mencakup isian yang sudah tersimpan. Penyimpanan BAP otomatis terjadi satu menit setelah berhenti mengetik, atau lebih cepat melalui **Simpan draf**. Jumlah isian pada editor dapat lebih tinggi daripada monitoring sebelum penyimpanan berhasil.

## Alur pelaksanaan terhubung

1. Cari peserta melalui **Portal Wawancara**, **BNBA & jadwal**, atau antrean **Portal & Hasil BAP**. Periksa jadwal dan room database.
2. Pewawancara menekan **Buka BAP**. Kartu room dan monitoring pimpinan akan menampilkan aktivitas pembukaan setelah pembacaan berikutnya.
3. Cocokkan identitas peserta, lakukan perpindahan di Zoom, lalu tekan **Mulai wawancara** pada BAP. Server mencatat waktu mulai aktual satu kali dan membuka isian administrasi/identitas serta 22 jawaban. Sebelum mulai, isian BAP belum ditampilkan.
4. Lengkapi administrasi dan 22 jawaban. Simpan draf untuk memperbarui progres bersama. Status, jawaban, dan kendala database tidak diubah melalui pilihan status lokal pada monitoring.
5. Bila ada kendala, gunakan **Aktivitas & kendala wawancara → Laporkan kendala** pada popup BAP. Laporan yang tersimpan dapat dibaca pimpinan saat wawancara masih berlangsung.
6. Jika peserta belum dapat diwawancarai atau perlu berhenti sementara, tekan **Tunda wawancara**, tulis alasan wajib, dan **Simpan sebagai Tertunda**. Lanjutkan melalui **Lanjutkan wawancara**; jawaban yang tersimpan tetap tersedia.
7. Setelah semua identitas wajib (termasuk pewawancara pendamping) dan 22 jawaban lengkap, tekan **Selesai wawancara**. Mengetik atau menyimpan jawaban tidak menyelesaikan otomatis. Pratinjau dianjurkan untuk memeriksa dokumen tetapi tidak menjadi syarat tombol selesai. Unduhan Word/PDF sendiri tidak mengubah status.
8. Gunakan **Kendali room** untuk meninjau aktivitas semua room, **Kendala terbuka** pada filter BNBA untuk tindak lanjut, dan ekspor CSV untuk rekap. Posisi serta catatan kunjungan pimpinan dan teks Broadcast tetap membantu koordinasi lokal di Zoom.

Panduan operasi tertera pada tab **Panduan Dio**. Acuan Host/Co-Host: [Zoom — Managing meeting breakout rooms](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062540). Perpindahan peserta, pengiriman Broadcast, dan tindakan host dilakukan pada Zoom.

## Melaporkan dan menangani kendala

Admin/editor serta pewawancara pada room penugasannya dapat mengirim kendala sebelum atau selama wawancara. Tulis keterangan **5–2.000 karakter**, lalu tekan **Kirim laporan kendala**. Formulir laporan terpisah dari jawaban BAP. Laporan terbuka dapat diperbarui atau ditandai teratasi dengan catatan penanganan opsional. Laporan baru ditolak setelah BAP selesai; kendala terbuka yang sudah ada tetap dapat ditandai teratasi.

Pimpinan/viewer membaca isi, status, dan waktu laporan pada kartu room, BNBA, serta portal. Rincian BAP dan ekspor CSV memuat waktu penyelesaian serta catatan penanganan. Teks pada kolom **Catatan lokal koordinasi Zoom** tidak diterbitkan sebagai laporan bersama; gunakan panel kendala BAP untuk laporan lintas akun.

`interview_activity` memiliki nomor revisi sendiri. Perubahan laporan memeriksa revisi aktivitas agar laporan petugas lain tidak tertimpa. Konflik mempertahankan isi formulir untuk disalin; batalkan dan buka kembali formulir setelah meninjau laporan terbaru. Heartbeat tidak menaikkan revisi laporan. Pembukaan atau pelaporan kendala tidak menaikkan revisi BAP, mengubah jawaban/kunci pemeriksaan, atau menginvalidasi kategori, SPTJM, dan LHP. Audit privat menyimpan pembukaan pertama dan perubahan laporan; heartbeat berulang tidak membanjiri riwayat permanen.

## Penundaan dan kelanjutan wawancara

**Tunda wawancara** adalah perubahan status kasus BAP menjadi **Tertunda**, dengan
alasan wajib 5–2.000 karakter dan waktu penundaan. Tindakan ini dapat dilakukan
sebelum mulai maupun ketika wawancara berjalan oleh petugas berwenang. Jawaban
serta identitas yang sedang diisi disimpan bersama penundaan; keterangan yang
sudah tersimpan dan waktu mulai tidak dihapus.

Peserta tertunda mempunyai hitungan dan filter tersendiri. Pada kartu room,
bagian **Tertunda** memperlihatkan nama peserta, alasan, waktu, dan progres yang
sudah tersimpan. Peserta ini tidak masuk wawancara aktif atau BAP dibuka dan tidak
memiliki timer yang berjalan pada kartu monitoring. Jadwal/distribusi dikunci
selama Tertunda, termasuk jika wawancara belum pernah dimulai.

Tekan **Lanjutkan wawancara** pada BAP untuk membuka kembali isian. Waktu mulai
lama dipertahankan; jika penundaan terjadi sebelum mulai, waktu mulai dicatat
saat dilanjutkan. Alasan/waktu penundaan terakhir dipertahankan untuk audit dan
CSV, tetapi banner alasan aktif hanya ditampilkan saat status Tertunda.

Pelaporan kendala dapat berjalan bersamaan dengan wawancara; laporan itu sendiri
tidak menghentikan isian. Gunakan Tunda wawancara bila pelaksanaan perlu dihentikan.
Status **Terkendala** pada kertas kerja offline tetap merupakan catatan lokal dan
tidak berubah menjadi Tertunda database secara otomatis.

## Jadwal lokal dan distribusi

**Penugasan & parameter**, distribusi massal, dan impor menyusun draft lokal. BNBA terhubung tetap menampilkan jadwal database. Admin dapat meninjau jumlah perbedaan dan menekan **Kirim perubahan jadwal lokal** pada panel database bersama. Server memeriksa revisi, bentrok slot, dan apakah peserta sudah mulai; satu masalah membatalkan seluruh batch. Perubahan penugasan/label pewawancara lokal tidak mengubah akun atau assignment database.

Kotak centang BNBA mendukung pilihan per peserta, satu halaman, dan seluruh hasil filter. Pilihan bertahan saat pindah halaman/filter. Peserta yang sudah memiliki waktu mulai BAP, tertunda, atau telah selesai dikunci dari distribusi; pilihan dikeluarkan ketika status terbarunya sudah mulai. Penerapan draft menolak perubahan terhadap peserta yang diketahui sudah mulai serta menolak saat koneksi monitoring sedang bermasalah.

**Distribusikan / ubah pilihan** menyediakan pemindahan ke pewawancara lain dengan jadwal tetap, atau penyusunan jadwal bagi peserta terpilih. Pratinjau memperlihatkan jumlah berubah/tetap, penempatan sebelum/sesudah, dan rentang tanggal. Catatan, nama Zoom, dan catatan pimpinan lokal dipertahankan. Bentrok pada room atau pewawancara utama ditolak. Kebijakan kategori asli Pairing Sekjen dan flag perlu validasi tetap mengikuti konfigurasi workspace serta data sumber.

**Impor jadwal Excel / CSV** menyediakan template. Header: NIK, NIP, Nama (opsional), Tanggal, Jadwal/Jam Mulai, Sesi, Room/Pewawancara Utama, Durasi (menit), dan Catatan (opsional). NIK/NIP harus teks lengkap 16/18 digit; identitas numerik/notasi ilmiah ditolak. Bila keduanya terisi, keduanya harus merujuk peserta yang sama. Pencocokan nama saja tidak digunakan.

Tanggal menerima YYYY-MM-DD, DD/MM/YYYY, atau tanggal Excel asli; jam memakai HH:MM WIB atau pecahan waktu Excel per menit. Sesi/durasi yang kosong memakai default impor lama **1/40 menit**, sehingga isilah durasi **30 menit** secara eksplisit untuk acuan resmi sekarang. Workbook berisi satu sheet atau sheet **Jadwal**; batas 8 MiB, 5.000 baris, dan 100 kolom. Masalah per baris memblokir penerapan seluruh impor. Tidak ada perubahan sampai Terapkan ditekan.

**Jadwal per pewawancara** menyiapkan CSV/ZIP untuk distribusi berkas lokal. Berkas tersebut tidak mengirim pesan atau memberikan akses akun otomatis.

## Ekspor dan penyimpanan

Ekspor **Rekap seluruh BNBA**, **Ekspor sesuai filter**, serta CSV roster portal terhubung memuat status BAP asli, jumlah/persentase jawaban tersimpan, alasan/waktu penundaan terakhir, laporan/status kendala, waktu pelaporan/penyelesaian, catatan penanganan, sumber jadwal, serta kesegaran pembacaan. Kolom catatan koordinasi Zoom dan pimpinan diberi label lokal. NIK/NIP dipertahankan sebagai teks; nilai formula, kutip, pemisah, dan baris baru diamankan untuk CSV.

Jadwal draft, nama Zoom, catatan koordinasi, penugasan room lokal, dan posisi/catatan pimpinan disimpan melalui `localStorage` per akun serta sumber/versi dataset. Catatan ini belum tersinkron antarperangkat. Viewer membaca status/progres/kendala database lintas room, tetapi hanya dapat melihat catatan browser pada lingkup akun lokalnya. Admin/editor dapat mengubah kertas kerja lokal; hanya admin mengirim perubahan jadwal ke database.

Cadangan JSON memuat workspace lokal dan tidak mencadangkan jawaban atau laporan kendala database. Pemulihan berlaku pada sumber/versi yang sama dan memerlukan pratinjau sebelum mengganti draft lokal. Unduh cadangan sebelum membersihkan browser atau berpindah perangkat. Revisi penyimpanan mencegah tab lain menimpa draft diam-diam; pemulihan catatan korup mempertahankan salinan raw lama.

Tanpa backend, mode pratinjau lokal memakai alur lama: verifikasi identitas, Menunggu, Di room, timer, Selesai, Tidak hadir, Terkendala, dan Jadwal ulang dicatat di browser. Ekspor offline tetap memakai format lokal. Catatan dan status offline tidak dikirim otomatis ketika backend tersedia kembali.

## Gangguan koneksi

Halaman menunjukkan kesalahan dan pembaruan terakhir. Data terakhir pada baris, kartu, dan ekspor ditandai saat koneksi terganggu. Status lokal tidak dipakai sebagai pengganti keberhasilan baca database. Saat data kasus berhasil dimuat tetapi aktivitas/kendala belum pernah terbaca, indikator pembukaan dan kendala ditampilkan **belum tersedia**, bukan nol.

Jika laporan lama sudah dimuat, pembacaan aktivitas yang gagal mempertahankan laporan itu dengan penanda data terakhir; kasus BAP yang berhasil dibaca tetap diperbarui. Pembacaan berikutnya memulihkan tampilan setelah koneksi kembali. Jangan menganggap data terakhir sebagai kepastian kondisi terbaru sebelum gangguan pulih.

## Aktivasi database dan rilis

Untuk instalasi baru, jalankan `supabase/interview-monitoring-activation.sql` setelah `supabase/interview-portal.sql`, `supabase/interview-revisions.sql`, dan `supabase/interview-signatories.sql`. SQL menambahkan tabel aktivitas, audit privat, RLS baca mengikuti kasus/room, grant, dan RPC `interview_activity_action`. Tidak diperlukan publikasi Realtime: pembaruan menggunakan polling.

Aktivasi monitoring sudah diterapkan ke project Supabase yang terhubung pada **23 Oktober 2026** melalui `execute_sql`; penerapan tersebut belum memiliki entri riwayat migrasi Supabase. Pembacaan akun pimpinan sebagai viewer telah diperiksa untuk 1.057 kasus dan tabel aktivitas. Pemeriksaan tidak menulis aktivitas simulasi atau jawaban peserta produksi. Frontend dirilis melalui branch `main` ke proyek Vercel `pengembalian` pada https://pengembalian.vercel.app; hasil deployment diverifikasi terpisah dari aktivasi database.

Aktivasi alur Tertunda disediakan pada `supabase/interview-deferral.sql`, dijalankan setelah skema portal/revisi/penandatangan serta aktivasi monitoring. SQL menambah status dan kolom alasan/waktu/petugas penundaan pada kasus BAP; aksi `defer` memeriksa revisi kasus dan `start` melanjutkan. **Aktivasi SQL penundaan sudah diterapkan pada 23 Oktober 2026** melalui `execute_sql`, tanpa entri riwayat migrasi. Uji defer/lanjut pada database terhubung di-rollback; tidak ada status atau jawaban peserta produksi yang diubah.

## Verifikasi

```bash
node --test tests/interviewLifecycle.test.js tests/interviewDeferralDatabase.test.js tests/interviewProgressApi.test.js tests/interviewMonitoringDatabase.test.js tests/interviewLiveMonitoring.test.js tests/interviewMonitoringView.test.js tests/interviewMonitoringExport.test.js tests/interviewStorage.test.js tests/interviews.test.js tests/interviewRoutingIntegration.test.js
npm run build
```

Tes monitoring mencakup pemisahan BAP dibuka/mulai/selesai, batas kehadiran 90 detik, progres jawaban tersimpan, laporan dan revisi kendala, pembatasan role/room, pembacaan gagal/parsial, seluruh room termasuk Room 19, perubahan jadwal, serta ekspor bersama yang tidak mengubah keluaran offline. Tes penyimpanan dan distribusi menjaga isolasi akun/sumber, konflik revisi, catatan lama, validasi slot, dan keamanan impor/ekspor. Uji browser untuk perubahan monitoring menggunakan backend simulasi; tidak mengisi BAP peserta produksi.
