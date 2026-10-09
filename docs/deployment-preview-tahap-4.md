# Deployment preview tahap 4

Preview diterbitkan dari feature/master-import-staged. Produksi tidak dipromosikan karena integrasi master Supabase, staging lintas koneksi, serta pemetaan SP2D masih belum selesai.

22 tes lulus dan build berhasil. Konfigurasi login Supabase tersedia untuk branch preview. Preview menggunakan layanan login dan modul lama dari Supabase yang sama; modul Excel baru tetap memproses file di browser tanpa commit ke database. Data master hilang ketika refresh.

Preview dilindungi Vercel Authentication. Login Vercel dapat diperlukan sebelum login aplikasi.

## Verifikasi preview lanjutan

Login admin berhasil diperiksa lewat sesi browser. Ditemukan dan diperbaiki parser workbook tanpa sharedStrings.xml (teks inline). Commit b867551, deployment dpl_AKoji56BzTMT2VmA5qLEX6j1YLS7 berstatus READY. 23 tes lulus, build berhasil.

Pengujian browser pada preview menggunakan data simulasi tiga SDM/tiga bank: kewajiban 1.200, pembayaran 30, saldo 1.170. Alur parser ke halaman Master & Progres dan unduhan XLSX berhasil dengan kontrol keyboard. File unduhan dibaca ulang: tiga SDM dan tiga transaksi, NIP tetap teks 18 digit. Tidak ada impor master ke Supabase produksi.

Produksi tetap ditahan sampai integrasi penyimpanan master, pengujian Supabase staging dan pemetaan SP2D selesai.
