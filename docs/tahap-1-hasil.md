# Tahap 1 — fondasi impor master kumulatif

Status: lokal, belum di-push dan belum deploy. Migrasi database masih draf dan belum dijalankan.

Sumber: `Rekap Master Pengembalian Uang Makan dan Tukin PPPK 2025 (22).xlsx`, rekap terbaru 9 Oktober 2026.

## Hasil validasi workbook asli

| Bank | SDM | Kewajiban | Pengembalian menurut Excel | Sisa dihitung |
|---|---:|---:|---:|---:|
| Mandiri | 31.207 | 4.764.218.371 | 3.474.149.260 | 1.290.069.111 |
| BRI | 428 | 803.116.138 | 64.490.329 | 738.625.809 |
| BSI | 1.144 | 270.289.490 | 103.307.629 | 166.981.861 |

Jumlah 32.779 SDM. Tidak ada duplikasi NIP lintas bank. Total kewajiban Rp5.837.623.999, pengembalian Rp3.641.947.218, sisa Rp2.195.676.781. Parser cocok dengan nominal rekap di workbook. Nilai ini belum merupakan verifikasi bukti penerimaan.

Mandiri memiliki 26.046 sel pengembalian positif; BRI 214; BSI 788. Nilai nol tetap dibaca untuk deteksi koreksi, tetapi tidak menjadi transaksi pembayaran baru. Uji unggahan snapshot yang sama menghasilkan nol transaksi tambahan.

## Peringatan sumber

Kolom Sisa Tagihan Mandiri menjumlah Rp2.147.804.128, lebih besar Rp857.735.017 daripada sisa terbaru. Contoh rumus BX6 membaca AT/AU/BS/BT (Tahap V), sementara sisa Tahap VI tersedia. Sisa untuk sistem baru dihitung dari kewajiban final dikurangi seluruh kolom pembayaran per tahap; kolom sisa Excel dipakai sebagai pemeriksaan saja. Workbook asli tidak diubah.

Hubungan SP2D dan bukti setiap pembayaran belum tersedia dalam pemetaan ini. Tanggal pengembalian tidak disimpulkan dari tahun kewajiban. Seluruh hasil Excel diberi status pending, bukan verified. Daftar nonaktif (265 orang, 139 belum cocok dengan bank) belum diintegrasikan pada tahap ini.

## Yang sudah dibuat

- Pembaca header bertingkat berbasis jenis, tahun dan tahap; posisi kolom boleh bergeser.
- Pemisahan kewajiban dan transaksi historis, pemeriksaan nominal/NIP/duplikasi/kelebihan bayar.
- Perbandingan snapshot: transaksi baru, tidak berubah, koreksi dan data tidak muncul; kehilangan baris tidak berarti hapus.
- Draf tabel SDM, kewajiban, SP2D, alokasi SP2D, pembayaran, batch impor dan audit koreksi. Tidak memberi akses tulis browser sebelum RPC commit atomik dibuat.
- Skrip validasi workbook asli. Salinan ekstraksi berisi data internal tersimpan hanya dalam `.local-analysis`, yang dikecualikan Git. Laporan ini hanya berisi agregat.

## Gerbang sebelum deployment tahap berikutnya

1. Tambahkan UI pratinjau bank, tahap baru dan koreksi; pastikan file berat diproses tanpa membekukan layar.
2. Bangun validasi dan commit batch atomik, pemeriksaan ulang saat menyimpan, audit koreksi dan penanganan unggahan ulang.
3. Petakan tanggal, hasil debit/blokir versus penerimaan, daftar nonaktif, dan bukti; SP2D boleh belum dipetakan tetapi harus dinyatakan.
4. Uji RLS untuk admin/editor/viewer, batch gagal, koreksi kosong versus nol, dan ekspor/impor balik.
5. Deployment hanya setelah build, uji fungsi dan rekonsiliasi lulus. Tidak menjalankan migrasi atau mengimpor sumber pribadi secara otomatis.

## Menjalankan pemeriksaan lokal

`node --test tests/masterWorkbook.test.js`

`scripts/extract_master_for_validation.py` menerima path Excel dan path JSON lokal sebagai argumen; `scripts/validate_master.mjs` membaca JSON tersebut dan mengeluarkan ringkasan anonim. Jangan commit atau mengunggah JSON ekstraksi.
