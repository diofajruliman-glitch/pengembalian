# TukinUMrecovery PSNK

**Versi MVP 0.1 — sumber deploy Vercel, belum dipublikasikan.**

Aplikasi monitoring pengembalian Tunjangan Kinerja (Tukin) dan Uang Makan PPPK TA 2025 dengan target penyelesaian 31 Desember 2026. Dibangun dari spreadsheet `Matriks_Bottleneck_Pengembalian_Tukin_Uang_Makan_PSNK_2026.xlsx` (10 bottleneck dan 15 rencana aksi), tanpa menyertakan data personal SDM/NIP di kode sumber.

## Fitur

- Dashboard otomatis memuat master tersimpan untuk admin saat masuk (jika koneksi master aktif), atau memakai pratinjau master yang dipilih selama sesi. Untuk role tanpa akses master tersimpan atau jika master tidak tersedia, Dashboard memakai rekap 3 bank. Angka master tetap merupakan nominal workbook, bukan bukti penerimaan terverifikasi. Rekap Bank manual tetap terpisah dan tidak ditimpa oleh master.
- Setelah batch master berhasil disimpan, aplikasi memuat ulang revisi tersimpan dan mengaktifkannya sebagai sumber Dashboard dan Master & Progres. Jika pembacaan ulang gagal, Dashboard tidak menganggap pratinjau sebagai master tersimpan; tampilkan peringatan dan coba muat ulang.
- Menu Rekap Bank memakai kewajiban dan pengembalian per bank dari master aktif bila tersedia; debit gagal dan cut-off ditampilkan hanya jika bersumber dari rekap manual. Tampilan master bersifat baca-saja agar tidak menimpa rekap manual.
- Monitoring BNBA/SDM dengan satu NIP 18 digit teks, status, sisa otomatis, bank, PIC, tenggat, bukti/NTPN.
- Matriks 10 bottleneck, status yang dapat diperbarui oleh editor/admin.
- 15 rencana aksi bertahap Oktober–Desember 2026 dengan status dan progres.
- Rekap Mandiri, BRI, BSI dan cut-off rekonsiliasi.
- Impor **.xlsx** dari sheet `Tracker_SDM` sumber; ekspor CSV untuk WPS/Excel.
- Supabase Auth dan RLS 3 peran (`admin`, `editor`, `viewer`), audit perubahan di database.
- Mode demo/pratinjau tanpa konfigurasi backend, **bukan untuk data riil**.

## Arsitektur

Frontend Vite + React di Vercel; login, database PostgreSQL dan Row Level Security di Supabase. Vercel hanya menayangkan frontend; data tidak disimpan pada filesystem Vercel. Semua operasi data Supabase diperiksa kebijakan RLS.

## 1. Menjalankan lokal

Prasyarat: Node.js modern dan npm.

```bash
npm install
npm run dev
```

Tanpa `.env.local`, `npm run dev` berjalan sebagai **pratinjau lokal** dengan konten rencana kerja dan data bank kosong. Deploy produksi tanpa konfigurasi akan menampilkan layar **konfigurasi belum lengkap**, bukan membuka halaman data pratinjau. Jangan memasukkan data internal/riil di mode demo.

## 2. Setup database Supabase

1. Buat proyek **Supabase privat khusus aplikasi internal**.
2. Masuk ke **SQL Editor** dan jalankan `supabase/schema.sql` untuk membuat tabel, RLS, audit events, dan data master bottleneck/rencana aksi.
3. Di **Authentication > Providers > Email**, matikan **public sign-ups**. Buat pengguna hanya melalui panel Supabase admin (atau undangan terkontrol).
4. Sesudah membuat akun pengguna di Authentication, buka tabel `auth.users` / User Management dan dapatkan UUID milik admin.
5. Tetapkan role yang benar lewat SQL Editor (contoh, ganti UUID dan nama):

```sql
insert into public.profiles (id, nama, role)
values ('UUID_AKUN_ADMIN', 'Administrator PSNK', 'admin');
```

Untuk petugas lainnya, buat profil dengan role `editor` (dapat memperbarui) atau `viewer` (hanya melihat). **Jangan memberikan role kepada akun yang belum diverifikasi.**

> **Penting:** Akun Auth saja tidak otomatis mendapat akses data; harus ada profil yang sah di `public.profiles`. RLS membatasi pembacaan dan perubahan. `audit_events` hanya dapat dibaca admin di SQL Editor.

## 3. Konfigurasi koneksi

Salin `.env.example` ke `.env.local`, isi dengan Project URL dan **Publishable Key** Supabase:

```env
VITE_SUPABASE_URL=https://PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_XXXXX
```

`Publishable Key` dirancang dapat dipakai browser dengan RLS aktif. **Jangan pernah menaruh `service_role`, secret key, database password, atau token admin** dalam variabel `VITE_` maupun source frontend.

## 4. Deploy di Vercel

1. Unggah proyek ke repository GitHub **privat**, tanpa file `.env.local`.
2. Di Vercel → **Add New Project** → impor repository tersebut.
3. Framework preset **Vite** (mengikuti `vercel.json`), build `npm run build`, output `dist`.
4. Tambahkan **dua** environment variables `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` di Vercel → Project Settings → Environment Variables untuk Production/Preview sesuai kebutuhan.
5. Deploy, kemudian uji login. Berikan URL Vercel **hanya kepada petugas berwenang**. Publik dapat membuka halaman login; data tetap hanya boleh terbuka setelah Auth + RLS berhasil.
6. Untuk akses lebih ketat, pertimbangkan deployment protection / identity-aware proxy jika tersedia, serta batasi pengguna Auth.

## 5. Impor dari spreadsheet

1. Buka menu **Monitoring SDM** → **Impor Excel**, pilih file Excel yang berisi sheet `Tracker_SDM` dengan header yang sama seperti sumber.
2. Pastikan NIP tetap sebagai **teks 18 digit**, bukan bilangan Excel; Excel numerik dengan >15 digit presisi dapat berubah sehingga data ditolak.
3. Pratinjau menampilkan jumlah baris yang valid atau error. Jika error, betulkan file sebelum mengimpor.
4. Konfirmasi jika data akan ditambah/di-*upsert* berdasarkan NIP. **Impor dapat menimpa data NIP yang sudah ada**. Gunakan hanya setelah rekonsiliasi dan persetujuan final.
5. Impor per batch 100 baris; **bukan transaksi tunggal**. Jika gagal di tengah, cek jumlah tersimpan sebelum mengulang; jangan menganggap proses atomik.
6. Rekap total bank **tidak** dihitung dari sheet ini karena tracker berisi kasus khusus, bukan selalu seluruh SDM bank. Isi bank dari hasil rekonsiliasi terpisah.

## 6. Aturan bisnis dan kehati-hatian

- Kewajiban dan realisasi di tracker adalah **gabungan Tukin + Uang Makan** dari spreadsheet. Jika membutuhkan pemisahan nominal tiap jenis, perlu versi lanjutan dan migrasi skema setelah sumber tervalidasi.
- Sisa dihitung otomatis `kewajiban_total - realisasi_total` di PostgreSQL (generated column).
- Database **menolak** status `Lunas Terverifikasi` jika realisasi belum sama dengan kewajiban, tidak ada referensi bukti, atau tanggal pembayaran kosong. **Bukti yang ditulis manual belum diverifikasi otomatis**.
- Rekap bank dan tracker adalah **dua sudut pandang data**, jangan dijumlahkan antar-sheet atau menganggap tracker mencakup seluruh SDM.
- Kasus meninggal dunia/resign/pensiun tetap membutuhkan telaah/keputusan resmi; aplikasi tidak otomatis menentukan kewajiban keluarga.
- Aplikasi ini **MVP**: belum ada approval berjenjang, upload lampiran bukti ke private storage, import atomik/staging, sinkron e-Kinerja, integrasi bank, verifikasi penerimaan/NTPN otomatis, atau verifikasi keamanan independen.
- **Role saat ini berlaku untuk seluruh wilayah; belum ada pembatasan Katim per provinsi/kabupaten. Jangan membuka akses bagi Katim regional hingga kebijakan row-level wilayah ditambahkan dan diuji.**
- **Uji keamanan, restore backup, dan audit akses wajib dilakukan sebelum produksi**. Jadwalkan backup, masa simpan data, dan prosedur insiden sesuai tata kelola instansi.
- Target 15 Desember adalah target operasional; pelunasan final 31 Desember 2026. Yang masih ditagih/dikaji **tidak boleh dianggap lunas**.

## Struktur

```
├── index.html
├── src/
│   ├── main.jsx         # UI, autentikasi, CRUD, import/ekspor
│   ├── style.css        # UI responsif
│   └── seed.json        # 10 bottleneck dan 15 rencana aksi tanpa PII
├── supabase/
│   └── schema.sql       # tabel, RLS, audit, data master
├── .env.example
├── package.json
├── vite.config.js
└── vercel.json
```

## Batas status proyek

Proyek ini disiapkan untuk di-deploy, **belum** terhubung ke Supabase, belum dibuatkan akun admin, belum di-deploy ke Vercel, dan belum diuji terhadap data produksi. Aktivasi membutuhkan akun Supabase/Vercel milik pengguna dan pengujian keamanan sebelum digunakan oleh petugas.

## Pengelolaan Matriks Bottleneck

Admin dan editor dapat menambah, mengedit seluruh kolom, dan menghapus kategori dari matriks. Hapus mengisi `deleted_at`; data dapat dipulihkan melalui Supabase dengan mengosongkan kolom tersebut. Nomor baris dibuat otomatis oleh sequence. Untuk database yang sudah ada, jalankan `supabase/bottleneck-crud.sql` sebelum deploy versi ini. Viewer hanya dapat melihat.
