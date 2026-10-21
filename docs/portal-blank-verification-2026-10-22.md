# Pemeriksaan halaman blank portal wawancara

Pemeriksaan dilakukan 22 Oktober 2026 (Asia/Jakarta).

## Penyebab dan versi online

Commit `522fb08` memakai ikon `Video` pada deklarasi menu di `src/main.jsx`
tanpa mengimpornya dari `lucide-react`. Deklarasi ini dievaluasi sebelum
aplikasi ditampilkan, sehingga kesalahan dapat menyebabkan seluruh halaman blank.

Perbaikan sudah tersedia pada commit `eaeea5efc8277f8785db93c052b6268a60a91bac`.
Vercel mengonfirmasi deployment produksi `dpl_HAJFo8NiDaNvop4DYfXx2C63Ri9o`
berstatus READY dan terhubung ke <https://pengembalian.vercel.app/>.
Browser menampilkan halaman login dan tidak mencatat error console saat pemeriksaan.

## Akun dan data

- Terdapat 19 akun dengan peran `interviewer`, seluruhnya terkonfirmasi dan tidak diblokir.
- Terdapat 19 penugasan room dan 1.057 peserta. Semua peserta memiliki objek identitas,
  nama, NIP, tanggal dan waktu yang diperlukan tampilan antrean.
- Pembacaan database diuji untuk setiap UID akun dengan role `authenticated` dan
  konteks JWT akun tersebut. Room 1–7 masing-masing dapat membaca 55 peserta;
  room 8–19 masing-masing 56 peserta. Setiap akun membaca nol peserta room lain.
- Pemeriksaan tidak mereset sandi, mengubah penugasan, atau mengubah isian BAP.

Validasi akses database tersebut tidak menguji sandi atau login browser masing-masing
akun. Browser yang masih memuat versi lama dapat memuat ulang dengan Ctrl+Shift+R.

## Pencegahan regresi

`tests/appEntry.test.js` mengevaluasi entry aplikasi sebenarnya melalui Vite dan
memeriksa pemanggilan mount React. Uji ini mendeteksi simbol menu yang tidak
diimpor; kontrol negatif tanpa impor `Video` gagal dengan `Video is not defined`.
Uji entry, akun dan BAP lulus 10/10; build produksi juga lulus.
