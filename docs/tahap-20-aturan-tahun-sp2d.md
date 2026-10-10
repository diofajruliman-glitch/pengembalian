# Tahap 20 — Tahun SP2D mengikuti nominal master bank

Pengguna mengonfirmasi: nominal positif pada kolom 2025 berarti kewajiban SP2D 2025; nominal positif pada kolom 2026 berarti kewajiban SP2D 2026. Kosong dan nol tidak menunjukkan kewajiban tahun tersebut. Satu SDM dapat memiliki kedua tahun. Aturan ini menggantikan pendekatan sheet pendukung pada tahap 19.

Rekap tahun SP2D pada pratinjau kini langsung dihitung dari kewajiban Tukin dan UM di tiga master bank. Worker tidak lagi membaca sheet pendukung untuk menentukan tahun. Monitoring menggunakan kewajiban positif untuk keanggotaan tahun dan jenis; pengembalian setiap tahap mengikuti kunci NIP/bank/jenis/tahun yang sama. Rincian dan ekspor tidak memasukkan tahun/jenis yang seluruh kewajibannya nol. Ekspor mencantumkan tahun SP2D; pilihan tahun di monitoring memakai istilah yang telah disepakati.

Nilai nol di ledger impor tetap dipertahankan untuk koreksi dan audit; penghilangan dari tampilan tahun tidak menghapus data sumber atau mengubah payload impor. Tidak ada perubahan database pada tahap ini.

Hasil workbook dasar:

| Tahun SP2D | SDM berkewajiban positif | Kewajiban | Pengembalian | Sisa |
|---|---:|---:|---:|---:|
| 2025 | 17.321 | 3.891.595.790 | 2.911.320.431 | 980.275.359 |
| 2026 | 5.486 | 1.946.028.209 | 730.626.787 | 1.215.401.422 |

Master sumber tetap memiliki 32.779 SDM. SDM unik dengan kewajiban positif berjumlah 20.176; sebanyak 2.631 masuk kedua tahun, dan 12.603 tidak memiliki nominal kewajiban positif. Jumlah SDM antar tahun tidak dijumlahkan sebagai jumlah unik. Total kewajiban 5.837.623.999 dan pengembalian 3.641.947.218 tetap sama. BRI tahun 2025 memiliki 0 SDM berkewajiban positif, sesuai sumber.

50 tes lulus, build berhasil. Tes memastikan keanggotaan berdasarkan nominal positif, kosong/nol dikecualikan, kedua tahun tetap terpisah, filter jenis/tahap mengikuti tahun, ekspor memakai tahun SP2D dan ledger/payload tetap utuh. Target rilis adalah preview yang sudah digunakan, bukan migrasi master produksi. Tanggal pembayaran dan verifikasi bukti tetap merupakan informasi terpisah.

Deployment dpl_4TUzukyqVCSgPU3Q7D67K18eyxQg READY, commit ad3e7eb. Browser dengan sesi admin asli berhasil membaca workbook dasar dan menampilkan rekap sesuai tabel. Filter BRI/2025 menunjukkan 0 SDM; ekspor BRI/2026/TUKIN/Tahap I dibaca kembali: 171 SDM dan transaksi, pengembalian 60.978.029, seluruh NIP teks 18 digit, tahun SP2D pada kedua sheet sesuai. Tidak ditemukan console error pada alur yang diuji. Bukti layar lokal .local-analysis/sp2d-master-rule-online.jpg. URL preview tetap https://pengembalian-git-feature-master-imp-780419-diofajruliman-glitch.vercel.app/.
