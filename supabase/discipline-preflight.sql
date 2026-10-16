-- Read-only readiness check. Run before AND after discipline-module.sql.
-- Reads database metadata only; does not read SDM, transactions, or notes.
begin read only;

select requirement,
       present as ready,
       case when present then 'Tersedia' else 'Belum tersedia' end as detail
from (values
 ('Fungsi peran aplikasi',to_regprocedure('public.current_app_role()') is not null),
 ('Identitas akun Supabase',to_regprocedure('auth.uid()') is not null),
 ('Tabel akun Supabase',to_regclass('auth.users') is not null),
 ('Role authenticated',exists(select 1 from pg_roles where rolname='authenticated')),
 ('Role anon',exists(select 1 from pg_roles where rolname='anon'))
) prerequisites(requirement,present);

select expected.object_name,
       c.oid is not null as installed,
       coalesce(c.relrowsecurity,false) as rls_enabled,
       case when c.oid is null then 'Belum diaktifkan'
            when c.relrowsecurity then 'RLS aktif'
            else 'Periksa RLS sebelum aktivasi' end as detail
from (values ('discipline_datasets'),('discipline_followups'),('discipline_audit')) expected(object_name)
left join pg_namespace n on n.nspname='public'
left join pg_class c on c.relnamespace=n.oid and c.relname=expected.object_name and c.relkind='r'
order by expected.object_name;

-- All rows below must have direct_table_access=false when installed.
select c.relname as object_name, r.rolname as app_role,
       has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as direct_table_access
from pg_class c
join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
cross join pg_roles r
where c.relname in ('discipline_datasets','discipline_followups','discipline_audit')
  and c.relkind='r' and r.rolname in ('anon','authenticated')
order by c.relname,r.rolname;

select p.oid is not null as installed,
       coalesce(p.prosecdef,false) as security_definer,
       p.proconfig as function_settings,
       case when p.oid is not null then has_function_privilege('authenticated',p.oid,'EXECUTE') end as authenticated_can_call,
       case when p.oid is not null then has_function_privilege('anon',p.oid,'EXECUTE') end as anonymous_can_call
from (values (to_regprocedure('public.discipline_rpc(text,jsonb)'))) expected(function_oid)
left join pg_proc p on p.oid=expected.function_oid;

rollback;
