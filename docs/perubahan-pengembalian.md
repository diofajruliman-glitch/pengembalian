# Menu Perubahan Pengembalian

Menu baca saja untuk rincian sheet `3 bulan` dari `MASTER UPDATE- lampiran.xlsx`. Data disimpan per NIP, tahun periode, dan bulan. SP2D lama/update merupakan dimensi tahun pembayaran yang terpisah dari tahun periode. Menu tidak mengubah saldo, transaksi, atau master bank yang sudah ada.

## Tampilan

Filter SP2D lama, SP2D update, status SEND BPK, bulan, zona wilayah, status awal/final, cuti, tendik, alasan, serta nama/NIP dapat dikombinasikan. Awalnya hanya baris dengan selisih nominal ditampilkan. Pilih `Semua data` untuk rekap penuh. Rekap selalu menghitung seluruh hasil filter, bukan hanya halaman BNBA yang terlihat. Jumlah baris dan SDM unik dibedakan. Rekap lama, update, dan perpindahan lama → update tersedia.

Riwayat per SDM menampilkan setiap bulan dan versi impor, nominal awal/final, selisih, alasan beserta dasar klasifikasinya, dan seluruh kolom sumber. Awal/final adalah perbandingan dalam workbook, bukan dua kejadian bertanggal. Waktu impor tidak dinyatakan sebagai waktu koreksi Excel. Versi lama tetap disimpan ketika versi berikutnya diaktifkan.

## Aturan data

- `#N/A` menjadi kosong; angka nol tetap nol. Selisih tidak dihitung jika salah satu nominal kosong. Error Excel lainnya tetap terlihat pada sumber, tidak dianggap angka.
- Zona waktu disesuaikan otomatis dari provinsi. Jika provinsi kosong, kabupaten memakai pemetaan yang tidak ambigu dari pasangan provinsi/kabupaten workbook. Jika wilayah tidak dikenal, gunakan zona sumber yang valid. Zona sumber tetap tersimpan.
- Wilayah WIT: Maluku/Papua. Wilayah WITA: Sulawesi/Gorontalo, Bali, NTB/NTT, Kalimantan Selatan/Timur/Utara. Wilayah WIB: Sumatera/Jawa, Kalimantan Barat/Tengah. Referensi: [BMKG](https://www.bmkg.go.id/tanda-waktu).
- Keterangan eksplisit pada `cek selisih`/`S` dipertahankan. Cuti bertanggal hanya diklasifikasikan bila beririsan dengan bulan data. Status `tendik`/`TENDIK/CM` dikenali; `bukan tendik sr` tidak diklasifikasikan sebagai tendik.
- Sesuai aturan pemilik workbook, baris berselisih tanpa alasan khusus lainnya diklasifikasikan WIT/WITA berdasarkan wilayah; sisanya `Penyesuaian absen eSDM dan e-Absensi`. Dasar ini ditampilkan sebagai aturan, sehingga berbeda dari keterangan eksplisit sumber.
- Perubahan status awal/final ditampilkan sebagai alasan tambahan. Satu baris bisa memiliki beberapa alasan; nominalnya hanya dihitung sekali.
- Nilai rumus memakai cache workbook tanpa membuka sumber eksternal atau menghitung ulang. Rekap pivot yang berbeda dari rincian ditampilkan sebagai pemberitahuan. Nominal rincian tidak diganti angka pivot.

## Data lokal

Sumber asli, NDJSON, manifest, dan hasil persiapan berada di `.local-analysis/adjustments/`, yang dikecualikan dari Git. Data tidak dimasukkan ke `src`, `public`, atau hasil build. Endpoint Vite hanya menerima koneksi loopback dengan host/origin lokal yang cocok; endpoint tidak ada di build produksi maupun preview build. Jangan menyalin data ini ke direktori publik.

Persiapan memakai Python untuk membaca XML Excel secara streaming dan Node untuk menerapkan aturan. Contoh (gunakan runtime yang tersedia):

```text
python scripts/extract_adjustment_workbook.py "C:/Users/USER/Downloads/MASTER UPDATE- lampiran.xlsx"
node scripts/prepare_adjustments.mjs
npm run dev -- --host 127.0.0.1
```

Snapshot awal: 98.255 baris, 32.779 SDM unik, 7.898 selisih nominal. Rincian pengembalian awal berjumlah Rp2.954.469.439, sementara cache rekap Rp4.573.949.749,4635. Menu memakai rincian. Data lokal sudah dapat dilihat melalui menu ini.

## Aktivasi Supabase

1. Periksa kapasitas database proyek; file Excel terkompresi bukan ukuran penyimpanan tabel. `records.ndjson` awal sekitar 93 MB. Pengukuran lokal pada 2.000 baris PostgreSQL termasuk indeks/TOAST menghasilkan proyeksi sekitar 159 MB untuk satu versi lengkap. Sampel ini bukan pengukuran kapasitas proyek Supabase; setiap versi menambah pemakaian. Jalankan `node scripts/measure_adjustments.mjs` untuk mengulang estimasi. Ukur kapasitas nyata sebelum aktivasi, terutama bila menggunakan paket Free.
2. Jalankan `supabase/recovery-adjustments.sql` melalui SQL Editor proyek aplikasi. Migrasi hanya menambahkan schema privat dan dua RPC; tidak memodifikasi master yang ada. Tabel menerapkan RLS dan tidak dapat diakses langsung oleh anon/authenticated. RPC baca memeriksa admin/editor/viewer; RPC impor hanya admin.
3. Gunakan `scripts/import_adjustments.mjs` dari komputer ini. Masukkan URL/key/JWT sesi admin lewat `ADJUSTMENT_SUPABASE_URL`, `ADJUSTMENT_PUBLISHABLE_KEY`, `ADJUSTMENT_ADMIN_JWT`, atau `--auth-stdin` dengan satu objek JSON `{url,key,token}`. Jangan commit token, menaruhnya di variabel `VITE_`, atau memakai service_role. Skrip tidak mencetak data SDM atau token.
4. Impor menyiapkan potongan 250 baris, dapat diulang setelah respons jaringan hilang, memvalidasi jumlah/baris/nominal, lalu mengaktifkan versi secara atomik. Sebelum commit lengkap, pembaca tetap melihat versi aktif sebelumnya. Versi yang sudah commit tidak dapat ditimpa. File identik dengan versi aturan identik tidak diduplikasi.
5. Aplikasi yang dikonfigurasi Supabase otomatis membaca RPC ini setelah login. Tidak membutuhkan flag baru. Data lokal tidak menjadi fallback untuk sesi produksi.

Migrasi, impor dan deployment produksi sudah dijalankan setelah persetujuan pengguna. Hasil aktivasi dicatat dalam docs/aktivasi-lampiran-supabase.md.

## Verifikasi implementasi

77 tes aplikasi lulus; lima tes fitur baru diulang setelah penyesuaian akhir dan lulus. Build produksi lulus. Uji HTTP data asli mengonfirmasi 98.255 baris / 32.779 SDM / 7.898 selisih, kombinasi SP2D 2025 → 2026 dan BELUM MASUK BPK menghasilkan 95 baris berselisih, serta riwayat contoh SDM memuat tiga bulan dan 42 kolom sumber. Permintaan lintas origin dan POST pada endpoint lokal ditolak 403. Uji browser memverifikasi filter gabungan, rekap, dan riwayat per SDM. Migrasi juga telah diterapkan ke Supabase produksi.

Tautan lokal langsung: `http://127.0.0.1:5175/#perubahan-pengembalian` ketika server berjalan pada port tersebut.

Rekap alur: menu menampilkan kelompok data awal STATUS SP2D lama + TAHAP 1 SEND BPK, perpindahan ke tahun berikutnya, saldo awal setelah pemutakhiran, koreksi final dikurangi awal, final kelompok awal, tambahan BELUM MASUK BPK, dan total seluruh STATUS SP2D UPDATE. Tombol Lihat BNBA mengganti seluruh filter sehingga tidak mewarisi pencarian/alasan sebelumnya. Filter awal sekarang semua data. Rekap alur independen dari filter rincian. Angka payroll Mandiri/BSI adalah referensi PDF 9 September 2026, bukan agregasi workbook karena kolom bank tidak tersedia. Aktivasi produksi dicatat dalam dokumen aktivasi.

Rekap alasan utama per bulan menggunakan satu kategori per baris: keterangan sumber eksplisit didahulukan, kemudian prioritas TENDIK, MATERNITY, LEAVE, WIT, WITA, ATTENDANCE. Catatan tendik eksplisit dikenali juga pada snapshot lama dengan evidence origin aturan. Baris delta kosong MISSING, nominal tetap UNCHANGED meski status berubah. Filter primaryReason tersedia di JS dan SQL tanpa mengubah data snapshot. Pengurangan/penambahan dijumlahkan terpisah; automaticRows menunjukkan alasan utama tanpa catatan sumber eksplisit. Angka BA tabel 3-11 dibandingkan pada rupiah bulat. Workbook total dan tendik/WIT sesuai; distribusi cuti-absensi berbeda +Rp3.246.324 dan WITA -Rp3.246.324 menurut atribusi saat ini. Tidak ada pemaksaan nominal/kategori untuk menyamakan BA. Uji BNBA Desember tendik: 315 data/SDM unik, pengurangan Rp116.443.864. Fungsi baca sudah diterapkan ke Supabase produksi.

Penyelesaian atribusi 11 Oktober 2026: tujuh baris Desember (82426, 83245, 84897, 87678, 88023, 88643, 94053) bernilai total Rp3.246.324 memiliki cek selisih cuti dan S Penyesuaian wita. Keterangan kategori spesifik di S sekarang didahulukan. Keterangan S yang hanya menyebut absen secara umum tidak mengalahkan cuti/tendik yang spesifik. Seluruh nominal dan alasan tambahan tetap dipertahankan. Filter sourcePriority=changed dan kartu penjelasan membuka tujuh BNBA terkait. Hasil setelah pembulatan: cuti/absensi 173 data Rp54.069.022; WIT 109 data Rp6.023.720; WITA 1.093 data Rp44.467.814; tendik 683 data Rp430.062.273; tidak berubah 24.673 data. Semua komponen pencocokan BA sesuai. Audit tanpa identitas disimpan privat di .local-analysis/adjustments/attribution-audit.json. Tujuh pengujian dan build lulus. Fungsi baca Supabase sudah diperbarui pada produksi.

Optimasi produksi: jalankan supabase/recovery-adjustments-performance.sql setelah migrasi dasar. Rekap memakai kolom turunan tersimpan dan indeks; hanya rincian halaman dan riwayat yang mengambil JSON lengkap. Jika aturan atribusi diubah kemudian, kolom turunan harus dihitung ulang melalui migrasi yang sesuai; sumber JSON snapshot tetap dipertahankan. Riwayat online per SDM sudah diverifikasi menampilkan tiga bulan dan 42 kolom sumber. Uji filter 7 BNBA lanjutan tidak diteruskan sesuai arahan pengguna.
