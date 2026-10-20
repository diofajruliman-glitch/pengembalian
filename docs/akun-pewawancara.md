# Penyiapan akun pewawancara

Daftar akun mengikuti 19 room resmi pada `src/interviews/officialSchedule1057.js`.
Email menggunakan nama huruf kecil dengan titik sebagai pemisah kata, di domain
`kemensos.go.id`. Nama tampilan tetap mengikuti penugasan resmi, termasuk TU 1/2
dan Sekretariat Linjamsos. Alamat tersebut adalah identitas login yang ditentukan
pengelola; skrip tidak membuat kotak surat Kemensos.

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
