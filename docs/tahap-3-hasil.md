# Tahap 3 — staging dan commit atomik

Status: pengembangan dan pengujian lokal. Tidak ada push, deployment, perubahan Supabase produksi, atau unggahan workbook ke layanan eksternal.

## Mekanisme yang sudah dibuat

- Manifest batch: nama file, SHA-256, jumlah baris, nominal rekap dan revisi master awal.
- Staging per chunk, hanya untuk pembuat batch dengan role admin/editor. Pengiriman ulang chunk identik aman; isi berbeda dengan kunci yang sama ditolak.
- Validasi kelengkapan, format identitas/nominal, hubungan SDM–kewajiban–pembayaran, bank, jumlah pembayaran dan kesesuaian rekap.
- Query detail perubahan per NIP di database dengan halaman maksimal 100 baris.
- Commit dalam satu transaksi: master, pembayaran, audit, status batch dan revisi. Koreksi wajib mempunyai alasan. Koreksi pembayaran kembali pending dan tidak otomatis menjadi verified.
- Data tidak muncul/kosong tidak otomatis dihapus. Jika mempertahankan histori menyebabkan saldo akhir tidak cocok rekap, seluruh commit dibatalkan untuk ditinjau.
- Pratinjau kedaluwarsa ditolak jika batch lain telah mengubah master. File dengan hash yang sudah committed ditolak; retry commit batch yang sama tidak menggandakan data.
- Detail koreksi workbook per NIP sudah tersedia pada pratinjau lokal, maksimal 50 baris per jenis. Jalur penyimpanan belum dihubungkan ke tombol UI.

## Pengujian PostgreSQL lokal

Menggunakan PostgreSQL WASM PGlite dalam memori; akun dan data unit test adalah sintetis. Bukan simulasi array JavaScript dan bukan database produksi.

Pengujian meliputi batch belum lengkap, retry identik/konflik, rekap salah, koreksi ke nol, alasan kosong, kelebihan bayar, pratinjau kedaluwarsa, detail sebelum/sesudah per NIP, larangan role viewer dan larangan tulis langsung. Kegagalan setelah penulisan master terbukti membatalkan master dan audit serta mempertahankan status validated.

Uji skala penuh dengan workbook asli dilakukan melalui `scripts/test_full_batch.mjs`. Ringkasan anonim disimpan dalam `.local-analysis/full-batch-result.json` jika seluruh langkah berhasil. Data individual tidak dicetak atau diunggah.

## Hasil uji penuh 9 Oktober 2026

Uji berhasil setelah optimasi penyimpanan chunk dan rencana query validasi. 158.164 baris staging dari 32.779 SDM disimpan pada PostgreSQL lokal dalam memori. Validasi 821 ms; commit atomik 11.398 ms; total 51.535 ms termasuk pembacaan Excel dan staging. Angka ini pengukuran lokal, bukan jaminan waktu Supabase.

| Bank | Kewajiban setelah commit | Pembayaran setelah commit |
|---|---:|---:|
| Mandiri | 4.764.218.371 | 3.474.149.260 |
| BRI | 803.116.138 | 64.490.329 |
| BSI | 270.289.490 | 103.307.629 |

Seluruh nominal cocok dengan rekap workbook asli. 19 pengujian otomatis lulus, termasuk histori tidak muncul yang dipertahankan dan commit ditolak jika rekap tidak cocok. Build aplikasi lulus. Dua hambatan performa yang ditemukan saat pengujian telah diperbaiki secara lokal; tidak diteruskan ke deployment.

## Gerbang produksi yang belum dilalui

- Pengujian migrasi dan timeout pada Supabase staging sesungguhnya.
- Pengujian konkurensi lintas koneksi; uji stale preview lokal saat ini berjalan secara berurutan.
- Integrasi UI staging/commit dan pemuatan detail koreksi lengkap dari database.
- Integrasi Monitoring SDM, impor nonaktif, pemetaan SP2D/bukti/tanggal, ekspor XLSX.

Tidak mengaktifkan penyimpanan produksi hanya karena build berhasil.
