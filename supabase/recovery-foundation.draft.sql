-- DRAF TAHAP 1. Belum dijalankan pada database produksi.
-- Preview/staging imports need an atomic validation-and-commit RPC before activation.
begin;
create table public.recovery_people (
 nip text primary key check(nip ~ '^[0-9]{18}$'),
 nama text not null, provinsi text, bank text not null check(bank in ('Mandiri','BRI','BSI')),
 status_sdm text, archived_at timestamptz, created_at timestamptz not null default now()
);
create table public.recovery_sp2d (
 id bigint generated always as identity primary key,
 nomor text not null, tanggal date not null, tahun integer not null,
 jenis text not null check(jenis in ('TUKIN','UM')),
 unique(nomor,tahun,jenis)
);
create table public.recovery_imports (
 id uuid primary key default gen_random_uuid(), file_name text not null,
 file_sha256 text not null, source_cutoff date,
 status text not null default 'preview' check(status in ('preview','validated','committed','rejected')),
 actor uuid not null references auth.users(id), created_at timestamptz not null default now(),
 summary jsonb not null default '{}'
);
create table public.recovery_obligations (
 id bigint generated always as identity primary key,
 nip text not null references public.recovery_people(nip),
 bank text not null check(bank in ('Mandiri','BRI','BSI')),
 jenis text not null check(jenis in ('TUKIN','UM')), tahun_kewajiban integer not null,
 nominal bigint not null check(nominal>=0),
 source_import uuid not null references public.recovery_imports(id),
 unique(nip,bank,jenis,tahun_kewajiban)
);
-- SP2D allocations are separate: the workbook does not establish each SP2D yet.
create table public.recovery_sp2d_allocations (
 obligation_id bigint not null references public.recovery_obligations(id),
 sp2d_id bigint not null references public.recovery_sp2d(id),
 nominal bigint not null check(nominal>=0), primary key(obligation_id,sp2d_id)
);
create table public.recovery_payments (
 id bigint generated always as identity primary key,
 obligation_id bigint not null references public.recovery_obligations(id),
 tahap integer not null check(tahap>0),
 tanggal_pengembalian date, tahun_pengembalian integer,
 nominal bigint not null check(nominal>=0), bukti text,
 verification text not null default 'pending' check(verification in ('pending','verified','rejected')),
 verified_by uuid references auth.users(id), verified_at timestamptz,
 source_import uuid not null references public.recovery_imports(id),
 unique(obligation_id,tahap),
 check(verification<>'verified' or (nullif(btrim(bukti),'') is not null and tanggal_pengembalian is not null and verified_by is not null and verified_at is not null))
);
-- Immutable correction log must be written by the future atomic commit RPC.
create table public.recovery_changes (
 id bigint generated always as identity primary key,
 import_id uuid not null references public.recovery_imports(id),
 actor uuid not null references auth.users(id), entity text not null, record_key text not null,
 before_data jsonb, after_data jsonb not null, reason text not null,
 created_at timestamptz not null default now()
);
do $$ declare tbl text; begin
 foreach tbl in array array['recovery_people','recovery_sp2d','recovery_imports','recovery_obligations','recovery_sp2d_allocations','recovery_payments','recovery_changes'] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on public.%I from anon, authenticated',tbl);
  execute format('grant select on public.%I to authenticated',tbl);
  execute format('create policy authorized_read on public.%I for select to authenticated using ((select public.current_app_role()) in (''admin'',''editor'',''viewer''))',tbl);
 end loop;
end $$;
-- No browser write grants at this stage. Never enable writes until the commit RPC
-- validates full batches, locks corrections, checks balances and records audit data.
commit;
