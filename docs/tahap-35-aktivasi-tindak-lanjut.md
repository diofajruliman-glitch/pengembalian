# Tahap 35 — Aktivasi tindak lanjut dan bukti privat

11 Oktober 2026. Pengguna menyetujui aktivasi API/akses lampiran dan rilis. Implementasi aplikasi: `da3b0c713b872f1316c04de7547bbf5af96ce715`.

## Aktivasi Supabase

Paket `supabase/recovery-casework.draft.sql` dijalankan melalui dashboard proyek `tagokvlsirebfgltbxmq`, hasil sukses. Definisi RPC master dan pemeriksa penghubungan sebelum aktivasi serta kontrol saldo disimpan dalam tabel privat `casework_activation_backup`.

Kontrol setelah aktivasi: master revisi 3, 32.779 SDM, kewajiban Rp5.837.623.999, pembayaran workbook Rp3.641.947.218, sisa Rp2.195.676.781. Perbandingan dengan baseline bernilai true. Ada 26 tabel privat dengan RLS. Bucket `recovery-evidence` privat. Anon tidak berhak execute API casework, authenticated tidak berhak mengakses schema privat secara langsung. Event dan setoran awal masing-masing 0.

## Pratinjau dan pengujian sesi asli

Deployment pratinjau `EHC3QfbvzLh7K5bxPGxqNr7t4KX4` Ready. URL: https://pengembalian-o6lih8r8w-diofajruliman-glitch.vercel.app/ . Flag casework aktif di Production dan Preview. Flag diagnostik hanya Preview.

Pengguna masuk sendiri sebagai admin. Master dan detail riwayat termuat. Menu Bottleneck dan Rencana Aksi menampilkan instruksi, pencarian, tindak lanjut, serta ekspor. Uji diagnostik melalui aplikasi mengunggah PNG satu piksel ke folder akun admin di bucket privat. Unduh dengan signed URL cocok byte per byte. URL publik ditolak HTTP 400. Objek diagnostik tetap privat untuk pemeriksaan. Uji ini tidak membuat catatan tindakan, status SDM, atau pembayaran.

Ekspor SDM terkait kategori 2 diunduh dari browser dan dibaca kembali: empat sheet, 21 SDM, kewajiban Rp66.649.381, pembayaran Rp26.213.980, sisa Rp40.435.401, sama dengan ringkasan aplikasi. NIP seluruhnya teks. File ekspor tidak diubah.

## Cakupan dan batas pengujian

72 tes otomatis dan build sebelumnya lulus. Tiga tes casework dan build diulang setelah penambahan backup dan diagnostik, lulus. Simulasi PostgreSQL terisolasi menguji status, izin peran, verifikasi oleh akun berbeda, pelunasan, pengurangan saldo dan pencocokan impor tanpa duplikasi. Uji browser asli memakai akun admin; belum ada login editor/viewer asli dalam sesi ini. Pembayaran atau keputusan status palsu tidak dimasukkan ke data produksi. Verifikasi NTPN tetap pemeriksaan petugas, bukan koneksi otomatis ke sistem penerimaan negara.

## Rilis

Commit yang telah diuji dikirim fast-forward ke `main`. Deployment produksi: `Cd14Dky1uxs46UvtXQ9FSBJ2vqsL`, URL utama https://pengembalian.vercel.app/ . Dashboard Vercel menunjukkan Ready, commit `da3b0c7`, main, Production, build 12 detik pada 11 Oktober 2026 10:44:16 WIB. Sesi admin tetap tersedia setelah aplikasi utama dimuat ulang.

Pemeriksaan aplikasi utama: master revisi 3 berhasil dimuat dengan saldo sesuai baseline. Bottleneck kategori 2 memuat 21 NIP terhubung, 20 sesuai filter nonaktif (satu status perlu pemeriksaan tidak termasuk filter), sisa filter Rp40.382.535. Dialog tindak lanjut berhasil membaca riwayat dan mengaktifkan tombol simpan untuk admin. Tombol diagnostik tidak ada pada produksi. Menu Rencana Aksi juga menampilkan alur penanganan baru. Tidak ada pesan error/warn pada log browser saat pemeriksaan. Bukti tampilan akhir tersimpan lokal di `.local-analysis/casework-production.jpg`.

## Penggunaan

Pilih kategori/kegiatan, buka SDM lalu `Tindak lanjut`. Catat hasil, PIC dan jadwal berikutnya. SDM baru diketahui nonaktif dilaporkan beserta dokumen dan diperiksa admin sebelum dihubungkan. Checklist muncul saat admin memilih `Atur SDM terkait`.

Untuk setoran langsung, pencatat memasukkan NTPN, nominal, tanggal, alokasi jenis/tahun/tahap dan lampiran. Admin berbeda memeriksa lalu memverifikasi untuk mengurangi sisa. Ketika workbook kumulatif diimpor lewat jalur yang ada, tinjau pencocokan setoran agar nominal yang sama tidak dihitung dua kali. Jika kolom tahapnya berbeda dengan alokasi setoran, selesaikan rekonsiliasi sebelum menyimpan.
