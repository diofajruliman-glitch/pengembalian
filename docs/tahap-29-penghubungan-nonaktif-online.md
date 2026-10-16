# Tahap 29 — Penghubungan kelompok nonaktif dengan sisa

10 Oktober 2026. Admin memilih 40 SDM dengan sisa menurut Excel positif, bukan seluruh 87 SDM nonaktif dengan kewajiban positif. Identitas berasal dari workbook dasar dan status tersimpan pada revisi master 2.

| Status sumber | SDM | Sisa Excel | Rencana Aksi | Bottleneck |
|---|---:|---:|---|---|
| Meninggal Dunia | 16 | Rp31.191.437 | 7. Verifikasi meninggal dunia | 1. Meninggal dunia |
| Mengundurkan Diri | 21 | Rp40.435.401 | 8. Tagihan SDM resign / pensiun | 2. Resign/PHK |
| BUP | 3 | Rp221.365 | 8. Tagihan SDM resign / pensiun | 3. Pensiun |

Total kelompok unik 40 SDM, sisa Rp71.848.203. Masing-masing ditautkan pada satu Rencana Aksi dan satu Bottleneck: 80 tautan, 80 audit, 6 permintaan tersimpan, revisi penghubungan 6. Saldo antar kegiatan tidak dijumlahkan karena orang yang sama tampil di beberapa kegiatan. Tautan adalah pengelompokan untuk peninjauan/tindak lanjut, bukan keputusan kepegawaian, penetapan tagihan resmi, atau verifikasi penerimaan.

Panel penghubungan ditambah filter status sumber dan sisa positif. Filter sisa mengikuti bank/tahun/jenis terpilih; ekspor menyertakan konteks kedua filter. Pemeriksaan 63 tes lulus, build lulus, browser lokal diuji. Preview READY dan halaman login aplikasi diperiksa melalui sesi browser; uji admin preview baru tidak dilakukan. Fetch preview lewat konektor terhalang izin 403, perlindungan tidak diubah.

Commit `de11c4e68278a266ed2eb8d7b597e5a7846f7319` dirilis melalui Git. Produksi `dpl_HspNxgJHyww3jBDswNZhefFMGBJA` READY di https://pengembalian.vercel.app/. Filter dan enam penyimpanan ditinjau/dijalankan melalui akun admin produksi; UI mengonfirmasi setiap penyimpanan. HTTP produksi 200 dan asset memuat filter baru. Console pada alur teruji tanpa error.

Pemeriksaan sesudah penghubungan: master tetap revisi 2, 32.779 orang, 27.048 pembayaran, kewajiban Rp5.837.623.999 dan pengembalian Rp3.641.947.218. Sidik seluruh profil, rekap bank, kasus khusus, rencana aksi dan bottleneck sama dengan sebelum penghubungan. Akses privat dan 19 tabel RLS tetap terjaga. Tidak dibuat kasus khusus, keputusan otomatis, pembayaran, atau data pegawai baru.
