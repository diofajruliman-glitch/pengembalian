-- ==============================================================================
-- SKRIP PROVISIONING 19 AKUN PEWAWANCARA & ROOM ASSIGNMENT
-- Password untuk semua akun: CekJudol@321
-- Jalankan skrip ini langsung di Supabase SQL Editor.
-- ==============================================================================

begin;

-- 1. Pastikan ekstensi pgcrypto aktif
create extension if not exists pgcrypto with schema extensions;

-- 2. Pastikan role 'interviewer' diizinkan di public.profiles
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'editor', 'viewer', 'interviewer'));

-- 3. Pastikan tabel interviewer_assignments tersedia
create table if not exists public.interviewer_assignments (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  room_id text not null unique check (room_id ~ '^room-([1-9]|1[0-9])$'),
  created_at timestamptz not null default now()
);

alter table public.interviewer_assignments enable row level security;
revoke all on public.interviewer_assignments from anon, authenticated;
grant select on public.interviewer_assignments to authenticated;
grant all on public.interviewer_assignments to service_role;
drop policy if exists interviewer_assignment_read on public.interviewer_assignments;
create policy interviewer_assignment_read on public.interviewer_assignments
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.current_app_role()) = 'admin');

-- 4. Buat / Perbarui 19 Akun Pewawancara dengan Password CekJudol@321
do $$
declare
  r record;
  target_user_id uuid;
  enc_pw text;
begin
  enc_pw := extensions.crypt('CekJudol@321', extensions.gen_salt('bf'));

  for r in select * from (values
    ('room-1',  'Sekretariat Linjamsos',   'sekretariat.linjamsos@kemensos.go.id'),
    ('room-2',  'Sekretariat Linjamsos 2', 'sekretariat.linjamsos.2@kemensos.go.id'),
    ('room-3',  'TU 1',                    'tu.1@kemensos.go.id'),
    ('room-4',  'TU 2',                    'tu.2@kemensos.go.id'),
    ('room-5',  'Leo Suta',                'leo.suta@kemensos.go.id'),
    ('room-6',  'Indra Maulana',           'indra.maulana@kemensos.go.id'),
    ('room-7',  'Achmad Mustaqim',         'achmad.mustaqim@kemensos.go.id'),
    ('room-8',  'Tasria Efrizka',          'tasria.efrizka@kemensos.go.id'),
    ('room-9',  'Helmy',                   'helmy@kemensos.go.id'),
    ('room-10', 'Iwien',                   'iwien@kemensos.go.id'),
    ('room-11', 'Mahmud syahputra',        'mahmud.syahputra@kemensos.go.id'),
    ('room-12', 'Putri Angelina',          'putri.angelina@kemensos.go.id'),
    ('room-13', 'Prabasari',               'prabasari@kemensos.go.id'),
    ('room-14', 'Wawan Soedarso',          'wawan.soedarso@kemensos.go.id'),
    ('room-15', 'Ivo Nilasari',            'ivo.nilasari@kemensos.go.id'),
    ('room-16', 'Astri',                   'astri@kemensos.go.id'),
    ('room-17', 'Novie',                   'novie@kemensos.go.id'),
    ('room-18', 'Dede Soleh',              'dede.soleh@kemensos.go.id'),
    ('room-19', 'Abi Setiadi Halim',       'abi.setiadi.halim@kemensos.go.id')
  ) as t(room_id, nama, email)
  loop
    -- Cari apakah user sudah pernah dibuat
    select id into target_user_id from auth.users where lower(email) = lower(r.email);

    if target_user_id is null then
      target_user_id := gen_random_uuid();
      
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values (
        target_user_id,
        '00000000-0000-4000-8000-000000000000',
        'authenticated',
        'authenticated',
        lower(r.email),
        enc_pw,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('nama', r.nama),
        now(),
        now()
      );

      -- Masukkan ke auth.identities untuk dukungan login email GoTrue
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) values (
        target_user_id::text,
        target_user_id,
        jsonb_build_object('sub', target_user_id::text, 'email', lower(r.email)),
        'email',
        lower(r.email),
        now(),
        now(),
        now()
      ) on conflict (provider, provider_id) do nothing;
    else
      -- Perbarui password jika akun sudah ada
      update auth.users
      set encrypted_password = enc_pw,
          raw_user_meta_data = jsonb_build_object('nama', r.nama),
          updated_at = now()
      where id = target_user_id;
    end if;

    -- Upsert ke public.profiles
    insert into public.profiles (id, nama, role)
    values (target_user_id, r.nama, 'interviewer')
    on conflict (id) do update set nama = excluded.nama, role = 'interviewer';

    -- Upsert ke public.interviewer_assignments
    insert into public.interviewer_assignments (user_id, room_id)
    values (target_user_id, r.room_id)
    on conflict (user_id) do update set room_id = excluded.room_id;

  end loop;
end $$;

commit;

-- 5. Verifikasi hasil pembuatan 19 akun
select a.room_id, p.nama, u.email, p.role
from public.interviewer_assignments a
join public.profiles p on p.id = a.user_id
join auth.users u on u.id = a.user_id
order by substring(a.room_id from 6)::integer;
