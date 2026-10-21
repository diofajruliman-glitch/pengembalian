# Penyiapan akun pewawancara

Daftar akun mengikuti 19 room resmi pada `src/interviews/officialSchedule1057.js`.
Email menggunakan nama huruf kecil dengan titik sebagai pemisah kata, di domain
`kemensos.go.id`. Nama tampilan tetap mengikuti penugasan resmi, termasuk TU 1/2
dan Sekretariat Linjamsos. Alamat tersebut adalah identitas login yang ditentukan
pengelola; skrip tidak membuat kotak surat Kemensos.
Room 1 dan Room 2 sama-sama bernama tampilan `Sekretariat Linjamsos` sesuai
jadwal; hanya email Room 2 yang memakai akhiran `.2` agar alamat login berbeda.

1. Jalankan `supabase/interviewer-accounts.sql` di SQL Editor proyek Supabase aplikasi.
2. Jalankan `node scripts/provision-interviewers.mjs` untuk memeriksa 19 alamat.
3. Di terminal administrator, set `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`
   melalui pengelola rahasia/lingkungan lokal. Jangan gunakan variabel `VITE_`.
4. Masukkan sandi awal yang ditentukan pengelola tanpa menuliskannya pada history:

   ```bash
   read -r -s -p 'Sandi awal pewawancara: ' INTERVIEWER_INITIAL_PASSWORD
   export INTERVIEWER_INITIAL_PASSWORD
   node scripts/provision-interviewers.mjs --apply
   unset INTERVIEWER_INITIAL_PASSWORD
   ```

Skrip membuat akun Auth terkonfirmasi secara administratif, profil `interviewer`,
dan penugasan room. Tidak mengirim email/undangan dan tidak mereset sandi akun
yang sudah ada. Konfirmasi administratif bukan bukti kepemilikan mailbox.
Kegagalan dapat meninggalkan sebagian akun; jalankan ulang untuk melanjutkan.
Konflik peran atau penugasan yang sudah ada menghentikan proses sebelum mutasi.

Frontend menerima peran `interviewer` melalui portal khusus; lihat
[panduan portal](portal-pewawancara.md). Jangan memberikan peran editor/admin
sebagai jalan pintas. Kebijakan data modul yang ada tetap membatasi akses
interviewer; tabel penugasan hanya dapat dibaca akun sendiri dan admin.

## Daftar akun sesuai jadwal — 22 Oktober 2026

Seluruh 19 nama tampilan dan email login sudah dicocokkan dengan penugasan
26–29 Oktober 2026 pada database produksi. Room 2 memakai nama tampilan
Sekretariat Linjamsos; Room 10 diperbarui dari Asiafry Raynaldi menjadi Iwien;
Room 11 dari Donny Anugerah Perkasa menjadi Mahmud syahputra.
Email login Room 10 dan 11 mengikuti nama baru. ID akun, sandi, peran, penugasan
room, dan isian peserta dipertahankan. Nama pada profil aplikasi dan metadata
Auth serta email pada akun dan identitas email telah diselaraskan.

| Room | Nama sesuai jadwal | Email login |
|---|---|---|
| 1 | Sekretariat Linjamsos | sekretariat.linjamsos@kemensos.go.id |
| 2 | Sekretariat Linjamsos | sekretariat.linjamsos.2@kemensos.go.id |
| 3 | TU 1 | tu.1@kemensos.go.id |
| 4 | TU 2 | tu.2@kemensos.go.id |
| 5 | Leo Suta | leo.suta@kemensos.go.id |
| 6 | Indra Maulana | indra.maulana@kemensos.go.id |
| 7 | Achmad Mustaqim | achmad.mustaqim@kemensos.go.id |
| 8 | Tasria Efrizka | tasria.efrizka@kemensos.go.id |
| 9 | Helmy | helmy@kemensos.go.id |
| 10 | Iwien | iwien@kemensos.go.id |
| 11 | Mahmud syahputra | mahmud.syahputra@kemensos.go.id |
| 12 | Putri Angelina | putri.angelina@kemensos.go.id |
| 13 | Prabasari | prabasari@kemensos.go.id |
| 14 | Wawan Soedarso | wawan.soedarso@kemensos.go.id |
| 15 | Ivo Nilasari | ivo.nilasari@kemensos.go.id |
| 16 | Astri | astri@kemensos.go.id |
| 17 | Novie | novie@kemensos.go.id |
| 18 | Dede Soleh | dede.soleh@kemensos.go.id |
| 19 | Abi Setiadi Halim | abi.setiadi.halim@kemensos.go.id |
