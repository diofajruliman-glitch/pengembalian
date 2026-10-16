# Tahap 28 — Status SDM sumber disimpan

Pada 10 Oktober 2026, workbook dasar `Rekap Master Pengembalian Uang Makan dan Tukin PPPK 2025 (22).xlsx` diperiksa melalui aplikasi produksi dengan akun admin. Seluruh delapan halaman batch server ditinjau sebelum penyimpanan.

- 117 NIP dan nama cocok: 38 Mengundurkan Diri, 43 Meninggal Dunia, 36 BUP.
- 9 perbedaan nama dan 139 belum cocok tidak disimpan.
- Status adalah status sumber Excel; tanggal mentah dipertahankan, bukan penetapan tanggal efektif atau keputusan kepegawaian.
- UI mengonfirmasi 117 status disimpan. Setelah reload, Monitoring SDM menampilkan revisi 2 dan ketiga kategori status pada filter.
- Pemeriksaan database: 32.779 orang, 27.048 pembayaran; kewajiban Rp5.837.623.999, pengembalian Rp3.641.947.218, sisa Rp2.195.676.781 tetap sama.
- Sidik data profil, rekap bank, kasus khusus, 15 rencana aksi dan 10 bottleneck sama dengan sebelum penyimpanan. Tidak dibuat kasus atau tautan tindak lanjut otomatis.
- 19 tabel privat tetap menggunakan RLS; anon dan authenticated tidak mendapat akses langsung ke schema privat.

Tidak ada perubahan kode atau deploy baru pada tahap ini. Berikutnya adalah memilih kegiatan dan kelompok SDM yang akan ditautkan secara eksplisit; data yang belum cocok perlu rekonsiliasi identitas tersendiri.
