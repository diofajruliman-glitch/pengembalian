-- Jalankan setelah kedua akun dibuat melalui Supabase Authentication.
-- Transaksi dibatalkan jika salah satu email belum tersedia atau tidak unik.
begin;

do $$
begin
  if (select count(*) from auth.users where lower(email) = 'timtlhp@gmail.com') <> 1
     or (select count(*) from auth.users where lower(email) = 'pimpinan@gmail.com') <> 1 then
    raise exception 'Buat kedua akun Authentication terlebih dahulu; setiap email harus memiliki tepat satu akun.';
  end if;
end $$;

insert into public.profiles (id, nama, role)
select u.id, requested.nama, requested.role
from (values
  ('timtlhp@gmail.com', 'Tim TLHP', 'editor'),
  ('pimpinan@gmail.com', 'Pimpinan', 'viewer')
) as requested(email, nama, role)
join auth.users u on lower(u.email) = requested.email
on conflict (id) do update set nama = excluded.nama, role = excluded.role;

commit;

select u.email, p.nama, p.role
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) in ('timtlhp@gmail.com', 'pimpinan@gmail.com')
order by u.email;
