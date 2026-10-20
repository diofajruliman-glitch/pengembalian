-- Jalankan sekali di Supabase SQL Editor sebelum skrip provision-interviewers.mjs.
begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'editor', 'viewer', 'interviewer'));

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

-- Akun interviewer tidak mendapat akses tabel admin/editor/viewer yang ada.
-- Portal dan kebijakan data wawancara akan ditambahkan pada tahap berikutnya.
commit;
