# Tahap 30 — Pemeriksaan sumber status SDM dan NTPN

Pemeriksaan lokal, 10 Oktober 2026. Workbook asli tidak diubah; tidak ada deploy atau perubahan database produksi.

## Lokasi sumber

- `BNBA PENGEMBALIAN MANDIRI`: BY, label `STATUS AKTIF` di BY5. Status pada baris dengan NIP sah: BUP 41, Mengundurkan Diri 38, Meninggal Dunia 42.
- `BNBA PENGEMBALIAN BRI`: BA tanpa judul, Mengundurkan Diri 1 dan 426 nilai error `#N/A`. Error bukan kosong dan tidak boleh dipetakan menjadi Aktif/nonaktif.
- `Sheet1`: R memuat 28 `Sudah pensiun`, cocok NIP dan nama dengan master bank. Satu bertentangan dengan sumber Mengundurkan Diri, baris 16504; keputusan kategori ditahan.
- Sheet debet memuat STATUS REK/Aktif, yaitu status rekening, bukan status pegawai; dikecualikan dari pemetaan SDM.

## Perbandingan lokal dengan sumber sebelumnya

Rekonsiliasi dengan 117 kecocokan NIP+nama pada sheet master tidak aktif menghasilkan 125 calon identitas berstatus nonaktif dari gabungan sumber. Perhitungan menggunakan ledger kewajiban positif dan seluruh tahap pembayaran yang sama dengan master dasar; bukan kolom sisa lama.

Calon sisa positif 42 SDM: 22 Mengundurkan Diri (Rp47.725.943), 17 Meninggal Dunia (Rp31.296.887), 3 Sudah pensiun (Rp221.365). Total Rp79.244.195. Ini hasil pemetaan lokal, belum status/tautan produksi. Status yang bertentangan belum ditimpa dan tetap menggunakan kategori sebelumnya pada perhitungan. Perbedaan BUP/Sudah pensiun dipertahankan sebagai sumber, meskipun jalur tindak lanjut pensiun sama.

## NTPN

17 sel berformat kode NTPN ditemukan pada baris 3 Mandiri: Y3–AF3, AH3–AI3, AY3–BA3, BC3–BF3. Baris ini tidak memiliki NIP pegawai. Kode merupakan referensi di atas kolom tahap/tahun pengembalian, bukan kolom pelunasan per orang. BRI/BSI tidak memuat kode serupa pada sheet bank yang diperiksa.

Pemetaan yang diperlukan: simpan kode beserta sheet/sel, bank, jenis, tahun dan tahap dari kolom pembayaran; hanya hubungkan sebagai referensi sumber bagi pembayaran bernilai positif. Kode di header tidak mengisi penerimaan terverifikasi dan tidak membuat semua SDM lunas.

## Aturan implementasi berikutnya

1. Pertahankan status asli dan lokasi sumber; normalisasi Resign/Mengundurkan Diri untuk jalur tindak lanjut, BUP/Pensiun pada kategori pensiun.
2. Kosong pada kolom status SDM yang memang dikenali berarti Aktif menurut aturan pengguna, tetapi jangan menghapus kategori dari sumber nonaktif lain yang cocok. Error/konflik menjadi Perlu pemeriksaan.
3. Monitoring tindak lanjut berjalan hanya menampilkan nonaktif dan sisa positif; SDM aktif memiliki tampilan terpisah, saldo nol tersedia dalam riwayat.
4. Tag saldo Lunas menurut saldo/Belum Lunas ditentukan dari ledger. Referensi NTPN sumber dan hasil verifikasi bukti merupakan indikator terpisah.
5. Rencana Aksi dan Bottleneck memakai kelompok sasaran yang sama. Riwayat tautan tetap disimpan saat saldo menjadi nol, tanpa mengubah PIC, tenggat atau status pelaksanaan otomatis.
6. Tinjau batch metadata dan rekonsiliasi status sebelum mengaktifkan perubahan produksi; jangan menambahkan ledger pembayaran atau kewajiban dari NTPN saja.

Kesimpulan: parser aplikasi saat ini belum membaca status pada kolom bank atau NTPN header; paket berikutnya memerlukan pemetaan metadata sumber dan tampilan kelompok terpadu. Kolom error/konflik ditahan untuk peninjauan, bukan diimpor sebagai status.
