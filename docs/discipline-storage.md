# Penyimpanan Kategorisasi Disiplin ASN

Modul ini memakai koneksi dan profil `admin`, `editor`, `viewer` aplikasi yang sudah ada. Penyimpanannya terpisah dari pengembalian: tidak ada perubahan pada tabel, kebijakan, ledger, atau profil modul lama.

## Aktivasi

1. Jalankan `supabase/discipline-preflight.sql` untuk membaca dependensi, keberadaan tabel/RPC, RLS, dan izin akses langsung. Skrip hanya membaca metadata, dibungkus transaksi read-only, dan tidak membaca identitas atau transaksi SDM. Sebelum aktivasi, objek `discipline_*` memang belum tersedia.
2. Tinjau `supabase/discipline-module.sql`, lalu jalankan di SQL Editor proyek Supabase yang sama dengan aplikasi pada tahap aktivasi yang disepakati. Migrasi bersifat tambahan dan dibungkus satu transaksi. Dapat dijalankan ulang tanpa menghapus dataset. Jalankan kembali preflight setelah migrasi: RLS harus aktif, akses langsung anon/authenticated harus `false`, RPC hanya dapat dipanggil authenticated dan memakai security definer dengan search path tetap.
3. Gunakan akun dengan profil aplikasi yang sudah terdaftar. Tidak diperlukan akun atau kunci baru. Jangan memasukkan service-role key ke browser. Ketiga peran aplikasi dapat membaca semua dataset modul; pastikan cakupan ini sesuai sebelum aktivasi.
4. Setelah migrasi, uji impor/simpan dengan admin, baca dengan viewer, tindak lanjut dengan editor, dan arsip dengan admin pada lingkungan pratinjau. Persiapan lokal belum membuktikan penyimpanan online berhasil.

Migrasi ini belum otomatis dijalankan di server oleh implementasi. Aplikasi memberikan pesan khusus jika RPC belum tersedia; analisis workbook di browser tetap dapat digunakan. Mengunggah workbook tidak langsung menyimpan data online: pengguna harus menjalankan tindakan simpan versi.

## Data dan hak akses

| Objek | Isi |
| --- | --- |
| `discipline_datasets` | Snapshot hasil per NIK, nama berkas, versi, induk versi, parameter lengkap, provenance, status arsip |
| `discipline_followups` | Status, PIC, catatan, referensi dokumen, catatan keputusan per NIK dan dataset |
| `discipline_audit` | Peristiwa impor, versi baru, perubahan tindak lanjut beserta sebelum/sesudah, dan pengarsipan |

| Tindakan | Admin | Editor | Viewer |
| --- | --- | --- | --- |
| Membaca dataset, hasil, tindak lanjut, dan audit | Ya | Ya | Ya |
| Menyimpan impor atau versi parameter baru | Ya | Tidak | Tidak |
| Menyimpan tindak lanjut | Ya | Ya | Tidak |
| Mengarsipkan dataset | Ya | Tidak | Tidak |

Semua operasi melalui `public.discipline_rpc`. RLS aktif dan akses tabel langsung dicabut; tidak ada izin tulis langsung bagi akun aplikasi. RPC memeriksa identitas, peran, dan arsip di server. Menyembunyikan tombol bukan batas pengaman utama.

Snapshot hasil dan parameter tidak diperbarui setelah tersimpan. Perubahan parameter menghasilkan snapshot baru dengan `parentId`; induknya tetap tersedia. Nomor versi mengikuti rantai induk, sehingga dua cabang dari induk yang sama dapat sama-sama memiliki versi 2 tetapi ID berbeda. Tindak lanjut melekat ke ID dataset dan tidak otomatis disalin ke versi berikutnya. Mengarsipkan dataset mencegah perubahan tindak lanjut dan pembuatan versi turunan dari dataset itu. Snapshot dan tindak lanjut masih dapat dibaca. Tidak tersedia penghapusan atau pembatalan arsip melalui aplikasi.

Penyimpanan satu snapshot dan event audit dilakukan dalam satu transaksi RPC. Tidak ada dataset parsial yang ditampilkan. Penulisan tindak lanjut serta arsip mengunci dataset sehingga perubahan tidak dapat lolos bersamaan dengan pengarsipan. Nilai sebelumnya tetap tercatat dalam audit.

## Percobaan simpan ulang dan perubahan bersama

Setiap versi lokal memperoleh `requestId` sebelum permintaan simpan dikirim. Kunci ini tetap berada pada riwayat sesi bila respons terputus. Mengulang permintaan dengan akun, kunci, dan isi yang sama mengembalikan dataset yang sudah tersimpan tanpa membuat versi atau audit impor baru. Memakai kunci sama dengan isi/nama/induk berbeda ditolak sebagai `DISCIPLINE_REQUEST_CONFLICT`. Nama dataset dikunci setelah percobaan simpan dimulai agar percobaan ulang tetap identik. Kunci bukan deduplikasi berdasarkan isi workbook dan tidak dipertahankan setelah sesi browser dihapus.

ID versi yang berhasil tersimpan dicatat sebelum mengirim tindak lanjut. Jika hanya sebagian catatan gagal terkirim, snapshot tetap tersimpan dan catatan tertunda dapat dikirim kembali tanpa menyimpan ulang versi. Induk versi tetap disimpan berurutan sebelum anaknya.

Form tindak lanjut terbaru mengirim `expectedUpdatedAt`: `null` untuk catatan baru, atau waktu revisi server yang menjadi dasar draf. Server menolak perubahan bila catatan sudah dibuat/diubah pengguna lain, dengan `DISCIPLINE_FOLLOWUP_CONFLICT`. Draf pengguna dipertahankan; pengguna memuat catatan terbaru, membandingkan, lalu memilih dasar penyuntingan sebelum menyimpan lagi. Pengiriman ulang catatan tertunda menggunakan pemeriksaan revisi yang sama. Mekanisme ini tidak mengubah status Terbukti/Tidak Terbukti.

Kedua isian protokol bersifat opsional agar pemanggil versi lama tetap kompatibel. Pemanggil tanpa `requestId` belum memperoleh jaminan percobaan ulang identik; pemanggil tanpa `expectedUpdatedAt` masih memakai perilaku pembaruan terakhir. Gunakan antarmuka terbaru setelah aktivasi.

## Batas data sumber

Workbook dan baris transaksi mentah tetap di memori browser. Data online berisi identitas dan hasil agregat per NIK yang memang diperlukan modul, catatan audit analisis, ringkasan, parameter, metadata sumber, serta tindak lanjut. Untuk menghitung ulang dari versi tersimpan setelah memuat ulang halaman, unggah kembali workbook yang sesuai; snapshot hasil tidak memuat transaksi mentah.

Payload hasil dibatasi 5.000 NIK unik dan 12 MiB JSON, dengan NIK teks 16 digit, struktur hasil periode, angka hingga dalam rentang aman JavaScript, nilai nonnegatif, dan jumlah transaksi bulat. Kunci baris/top-level yang tidak dikenal serta array transaksi mentah ditolak. Validasi server melindungi struktur penyimpanan; perhitungan bisnis tetap berasal dari mesin analisis dan versi parameter yang disimpan. Tidak ada kredensial atau isi sumber yang dicetak oleh client penyimpanan pada kegagalan.

Untuk transaksi dengan jam sumber `-`, hasil periode dapat menyimpan tiga angka provenance: `timeFromPairing` (jumlah aktivitas yang memakai asumsi kategori waktu Hasil pairing), `timeFromPairingInside`, dan `timeFromPairingOutside`. Ketiganya wajib dikirim bersama sebagai bilangan bulat nonnegatif; total harus sama dengan jumlah dalam dan luar, tidak melebihi frekuensi, dan rincian dalam/luar tidak melebihi angka efektif `dalam`/`luar`. Jumlah asumsi ditambah `unknown` juga tidak boleh melebihi frekuensi. Angka `dalam`/`luar` sudah mencakup asumsi tersebut; `unknown` hanya mencatat jam yang masih belum dapat diklasifikasikan. Provenance ini menjelaskan asumsi dan tidak menyatakan bahwa jam transaksi aslinya sudah diketahui.

Parameter opsional `rules.missingTimePolicy` menerima `pairing` atau `validate`. Pilihan `pairing` mengizinkan mesin analisis memakai kategori waktu sumber Hasil pairing untuk jam `-` yang memenuhi syarat; `validate` mempertahankan jam tersebut sebagai perlu validasi. Kebijakan yang dipakai, angka provenance, dan audit analisis ikut tersimpan dalam snapshot versi bersangkutan.

Perluasan ini tetap memakai `schemaVersion: 1`: ketiga angka provenance dan kebijakan jam bersifat tambahan. Snapshot lama yang belum memiliki isian tersebut tetap valid, dapat dibaca, dan tidak ditulis ulang ketika migrasi dijalankan kembali. Perubahan kebijakan menghasilkan versi baru; hasil serta parameter sebelumnya tetap dipertahankan.

Baris hasil terbaru juga menyimpan pasangan `missingTransactionDetails` (boolean) dan `sourceTransactionCount` (jumlah seluruh baris transaksi mentah yang berpasangan dengan NIK, termasuk di luar rentang analisis). Jika jumlah tersebut nol tetapi frekuensi atau nominal Hasil pairing historis positif, `missingTransactionDetails` wajib `true`. Seluruh angka kedua periode, skor, dan penghitung audit/provenance bernilai `null`, dengan kategori komponen kosong. Hasil historis tetap dipertahankan, sehingga rincian yang belum tersedia tidak disimpan sebagai nol transaksi.

Penanda tambahan `categoryFromPairing` menentukan apakah kategori akhir Hasil pairing asli dapat ditampilkan sebagai acuan. Pada hasil baru, nilainya `true` hanya jika rincian belum tersedia, kategori historis adalah `Ringan`, `Sedang`, atau `Berat`, dan status historis bukan `Perlu validasi`. Kedua periode memakai kategori historis tersebut dengan status persis **Kategori acuan Hasil pairing; rincian periode belum tersedia**. Angka periode tetap `null`; kategori ini merupakan acuan asli dan belum merupakan hasil perhitungan sebelum/sesudah ASN secara terpisah. Jika kategori historis tidak memenuhi syarat, penandanya `false` dan kedua periode memakai kategori serta status **Rincian transaksi belum tersedia**. Baris yang rincian transaksinya tersedia memakai `categoryFromPairing: false` dan hasil perhitungan periode biasa.

Server menolak penanda yang tidak berpasangan, jumlah sumber negatif/pecahan, penanda yang bertentangan dengan bukti historis, penggunaan kategori acuan tanpa penanda yang sesuai, kategori acuan yang berbeda dari hasil asli, label yang hanya diterapkan pada satu periode, atau angka nol/skor pada periode yang rincian sumbernya belum tersedia. Baris dengan rincian yang tersedia tetap mengikuti validasi angka biasa dan tidak boleh memakai status kategori acuan.

Isian ini bersifat tambahan: snapshot lama tanpa pasangan isian kelengkapan tetap valid, dan snapshot yang sudah menandai rincian belum tersedia tetapi belum memiliki `categoryFromPairing` tetap mempertahankan label lama. Tidak ada penulisan ulang snapshot maupun perubahan struktur tabel. Pengguna perlu menghitung serta menyimpan versi baru untuk memakai tampilan kategori acuan pada hasil lama.

Referensi dokumen adalah teks atau tautan yang dimasukkan pengguna; implementasi ini tidak mengunggah berkas dokumen ke bucket.

## Kontrak JavaScript

```js
import {disciplineStorage, followupStatuses} from './storage.js'

const storage = disciplineStorage(supabase) // null jika client tidak tersedia
const list = await storage.listDatasets() // metadata saja
const dataset = await storage.loadDataset(id) // metadata + result + auditEvents
const saved = await storage.saveVersion({
  name: 'Analisis 2025',
  filename: 'sumber.xlsx',
  result, // {rows, audits, stats, rules, metadata, source?, provenance?}
  parentId: null, // ID snapshot lama jika versi turunan
  requestId: crypto.randomUUID() // buat sekali dan gunakan kembali saat retry
})
const followups = await storage.loadFollowups(saved.id)
await storage.saveFollowup({
  datasetId: saved.id,
  nik: '0000000000000001',
  expectedUpdatedAt: null, // untuk edit, gunakan updatedAt hasil baca server
  patch: {
    status: 'Dalam pemeriksaan',
    pic: 'Tim',
    notes: 'Catatan pemeriksaan',
    documentReference: 'Nomor dokumen / tautan',
    decisionNote: ''
  }
})
await storage.archiveDataset(saved.id)
```

Metadata dataset: `{id,name,filename,parentId,version,schemaVersion,status,createdAt,createdBy,archivedAt,rowCount}`. `status` bernilai `active` atau `archived`; `schemaVersion` saat ini 1.

Hasil tindak lanjut: `{datasetId,nik,status,pic,notes,documentReference,decisionNote,updatedAt,updatedBy}`. Patch hanya mengubah isian yang dikirim. Pilihan status diekspor sebagai `followupStatuses`: `Belum ditindaklanjuti`, `Dalam pemeriksaan`, `Menunggu dokumen`, `Selesai`. Catatan keputusan menyimpan keputusan yang sudah ada dan tidak otomatis mengubah hasil kategorisasi menjadi hukuman final.

Client melempar Error dengan pesan Indonesia dan `.code`: `DISCIPLINE_NOT_READY` (migrasi belum aktif), `DISCIPLINE_FORBIDDEN`, `DISCIPLINE_NOT_FOUND`, `DISCIPLINE_ARCHIVED`, `DISCIPLINE_INVALID_RESULT`, `DISCIPLINE_INVALID_INPUT`, `DISCIPLINE_UNKNOWN_NIK`, `DISCIPLINE_REQUEST_CONFLICT`, `DISCIPLINE_FOLLOWUP_CONFLICT`, atau kesalahan koneksi umum.

## Pemeriksaan lokal

```powershell
node --test tests/disciplineStorage.test.js
```

Tes menggunakan PostgreSQL lokal PGlite untuk RPC, transaksi, peran, audit, hasil immutable, arsip, isolasi dari tabel pengembalian, kompatibilitas snapshot lama, penolakan angka provenance asumsi waktu yang tidak konsisten, pembedaan rincian transaksi yang belum tersedia dari nilai nol, serta kategori acuan historis yang tetap memakai angka periode `null`. Tidak mengakses server Supabase. Pemeriksaan tambahan terhadap workbook asli dapat dijalankan secara lokal tanpa mencetak identitas:

```powershell
$env:DISCIPLINE_WORKBOOK_PATH = 'C:\lokasi\workbook-final.xlsx'
node --test tests/disciplineStorage.test.js
```
