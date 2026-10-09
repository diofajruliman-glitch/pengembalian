-- Jalankan sekali untuk mengaktifkan penambahan nomor otomatis dan arsip.
begin;
alter table public.action_plans add column if not exists deleted_at timestamptz;
create sequence if not exists public.action_plans_no_seq;
select setval('public.action_plans_no_seq', greatest(
 coalesce((select max(no) from public.action_plans),0),
 (select last_value from public.action_plans_no_seq),1),true);
alter sequence public.action_plans_no_seq owned by public.action_plans.no;
alter table public.action_plans alter column no set default nextval('public.action_plans_no_seq');
grant usage on sequence public.action_plans_no_seq to authenticated;
commit;
