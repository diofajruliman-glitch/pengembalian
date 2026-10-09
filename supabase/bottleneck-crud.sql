-- Jalankan sekali untuk mengaktifkan penambahan nomor otomatis dan arsip.
begin;
alter table public.bottlenecks add column if not exists deleted_at timestamptz;
create sequence if not exists public.bottlenecks_no_seq;
select setval('public.bottlenecks_no_seq', greatest(
 coalesce((select max(no) from public.bottlenecks),0),
 (select last_value from public.bottlenecks_no_seq),1),true);
alter sequence public.bottlenecks_no_seq owned by public.bottlenecks.no;
alter table public.bottlenecks alter column no set default nextval('public.bottlenecks_no_seq');
grant usage on sequence public.bottlenecks_no_seq to authenticated;
commit;
