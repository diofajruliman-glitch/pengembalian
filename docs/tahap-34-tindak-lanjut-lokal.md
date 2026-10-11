# Tahap 34 — Tindak lanjut SDM nonaktif, bukti dan rekonsiliasi setoran

11 Oktober 2026. Implementasi lokal; belum ada aktivasi Supabase, unggah bukti riil, push, atau deployment.

## Alur petugas

1. Pilih Bottleneck atau Rencana Aksi. Tampilan awal adalah SDM yang sudah terhubung dan masih memiliki sisa.
2. `Tindak lanjut` mencatat hasil penanganan, PIC, status penanganan, dan tanggal tindakan berikutnya. Catatan baru menambah riwayat, tidak menimpa catatan lama.
3. `Cari SDM baru ditemukan nonaktif` mencari seluruh master yang masih memiliki sisa. Di dialog, pilih laporan nonaktif, lampirkan dokumen, dan isi alasan. Admin mengesahkan atau menolak laporan. Ini klasifikasi operasional berdasarkan dokumen, bukan keputusan kepegawaian.
4. Setelah status disahkan, admin menggunakan `Atur SDM terkait` untuk menghubungkan SDM ke kategori dan kegiatan yang sesuai. Checklist hanya muncul dalam mode ini. Viewer/editor tidak melihat checklist admin.
5. Setoran langsung dicatat dengan alokasi bank, jenis, tahun SP2D, tahap workbook berikutnya, nominal, tanggal, NTPN dan lampiran. Jika satu bukti mencakup beberapa kewajiban, alokasi per jenis/tahun dicatat terpisah; petugas wajib memeriksa total alokasinya.
6. Bukti pending belum mengurangi saldo. Admin berbeda dari pencatat memeriksa bukti dan penerimaan, lalu menyetujui atau menolak dengan alasan. Pencatatan oleh editor dan verifikasi oleh admin didukung. Ini pemeriksaan manusia; tidak ada integrasi verifikasi NTPN otomatis ke sistem penerimaan negara.
7. Setoran terverifikasi langsung mengurangi sisa di master aktif, Dashboard, Rekap Bank, kelompok SDM terkait, dan monitoring kasus melalui referensi. Saldo nol berpindah ke riwayat saldo lunas. Riwayat tautan dipertahankan; status kegiatan tidak otomatis selesai.

## Impor workbook kumulatif

Ledger workbook tetap disimpan terpisah dari setoran langsung. Snapshot menghitung pembayaran workbook ditambah setoran terverifikasi yang belum tercakup workbook. Setoran yang sudah dicocokkan mempertahankan bukti individual, tetapi tidak menambah nominal pembayaran lagi.

Impor meminta keputusan per setoran terverifikasi ketika pembayaran jenis/tahun terkait berubah, termasuk penambahan tahap lain. Bank/jenis/tahun/tahap setoran harus sama dengan kolom pembayaran yang memuatnya dalam workbook. Jika alokasi tahap tidak sesuai, jangan menganggapnya cocok; rekonsiliasi alokasi sebelum menyimpan. Konfirmasi `sudah termasuk` dibatasi oleh kenaikan nominal tahap. Impor tanpa tinjauan dan total melebihi kewajiban ditolak atomik. Penurunan tahap yang sudah dicocokkan dengan bukti individual ditahan untuk rekonsiliasi, bukan otomatis menghapus verifikasi.

Jika workbook berubah selama bukti pending, verifikasi tambahan ditolak hingga petugas memeriksa kembali. Jika bukti memang sudah termuat pada tahap yang sama, admin dapat memverifikasi sebagai bukti individual tanpa menambah pembayaran.

Guard dipasang pada wrapper impor yang ada, sehingga pemanggil frontend lama tidak dapat melewati tinjauan pencocokan. Fungsi lama disimpan dengan nama `recovery_master_rpc_before_casework`, akses langsungnya dicabut. API/tabel setoran tidak memberikan akses langsung ke schema privat.

## Ekspor

Kedua menu menyediakan `Ekspor Excel SDM terkait` serta `Ekspor Excel hasil filter / bermasalah`. Filter `Status perlu pemeriksaan` dapat digunakan untuk daftar bermasalah. Empat sheet berisi daftar SDM, riwayat pembayaran, hasil tindak lanjut terakhir/daftar bukti, dan konteks filter/revisi/kegiatan. Sheet hasil memuat catatan SDM terakhir lintas kegiatan; riwayat lengkap per tindakan tersedia di dialog beserta kategori/kegiatan asalnya. NIP dipertahankan sebagai teks. File lampiran tidak dimasukkan ke Excel.

## Bukti dan akses

- Paket `supabase/recovery-casework.draft.sql` menambahkan tabel event dan setoran privat, API, guard impor, serta bucket privat `recovery-evidence`.
- Admin/editor mencatat tindakan dan mengunggah bukti; admin memeriksa status/bukti; viewer membaca riwayat/bukti sesuai peran aplikasi yang berlaku secara global.
- Lampiran PDF/JPG/PNG maksimal 10 MB; objek tidak ditimpa. URL baca ditandatangani untuk 60 detik. Objek dan catatan tidak memiliki operasi hapus melalui modul ini. Unggahan yang gagal dicatat sebagai event dapat meninggalkan objek privat; retensi/pembersihan objek harus ditetapkan sebelum pemakaian luas.
- Flag `VITE_RECOVERY_CASEWORK_MODE` default `off`; aktif hanya dengan `production-casework`, URL proyek yang sesuai, dan master produksi.
- Pengesahan manusia tetap diperlukan. Status `Selesai Penanganan` bukan pengesahan pelunasan. Akun tanpa hak operasi tidak diberi tombol pencatatan.

## Verifikasi lokal

- Seluruh 72 tes lulus; tes casework terkait diulang setelah penyempurnaan SQL dan lulus.
- PostgreSQL lokal (PGlite): riwayat, klasifikasi nonaktif/disahkan/ditolak, izin role, bucket privat dan kebijakan objek, verifikasi terpisah, saldo, pencocokan impor atomik, retry idempotent, serta saldo monitoring kasus terhubung. Storage schema dan objek metadata disimulasikan; layanan upload/signing Supabase asli belum diuji.
- Simulasi UI browser: checklist muncul hanya saat admin mengatur daftar; viewer tidak mempunyai pengaturan/pencatatan; simpan catatan menghasilkan riwayat. Ekspor dari browser dibaca kembali: empat sheet, NIP teks, sisa Rp400.000 sesuai data simulasi.
- Build berhasil; peringatan ukuran bundle Vite tetap ada.
- Bukti lokal di `.local-analysis/casework-dialog.jpg` dan fixture simulasi lokal; tidak berisi personel/bukti nyata.

## Aktivasi yang masih diperlukan

Tinjau schema/prosedur Supabase terkini dan backup; jalankan paket sekali setelah persetujuan perluasan API/akses lampiran. Uji upload dan URL bukti dengan akun editor/admin berbeda serta viewer pada preview yang memakai flag aktif. Uji pembayaran simulasi di lingkungan terisolasi, pemuatan ulang saldo, penghubungan SDM baru, impor workbook berikutnya dengan pencocokan, dan ekspor sebelum mempromosikan produksi. Jangan mengklaim fitur aktif hanya berdasarkan build atau uji lokal.

## Pemeriksaan server sebelum aktivasi

Kueri baca-saja melalui dashboard Supabase pada 11 Oktober mengembalikan master revisi 3, 32.779 SDM, kewajiban Rp5.837.623.999, pembayaran workbook Rp3.641.947.218, serta tabel casework belum ada (0). Tidak ada migrasi yang dijalankan. Pemeriksaan tambahan kebijakan storage belum selesai; dashboard meminta konfirmasi dan kueri tersebut dibatalkan. Inspeksi kebijakan dan bucket tetap menjadi prasyarat aktivasi.
