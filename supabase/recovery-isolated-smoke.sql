-- Synthetic data only, isolated from public application tables.
begin;
set local search_path=recovery_test,pg_catalog;
do $$
declare actor_id uuid; b uuid; correction uuid; bad uuid; records jsonb; added integer;
begin
 select id into actor_id from public.profiles where role='admin' order by id limit 1;
 if actor_id is null then raise exception 'NO_ADMIN_FOR_TEST';end if;
 perform set_config('request.jwt.claim.sub',actor_id::text,true);
 records='[{"type":"person","data":{"nip":"000000000000000901","nama":"SIMULASI PENGUJIAN","bank":"Mandiri"}},{"type":"obligation","data":{"nip":"000000000000000901","bank":"Mandiri","kind":"TUKIN","year":2025,"amount":100000}},{"type":"payment","data":{"nip":"000000000000000901","bank":"Mandiri","kind":"TUKIN","year":2025,"stage":1,"amount":25000}}]'::jsonb;
 b:=recovery_begin('SIMULASI-awal.xlsx',repeat('1',64),3,'{"Mandiri":{"obligation":100000,"payment":25000}}');
 perform recovery_append(b,records);added:=recovery_append(b,records);
 if added<>0 then raise exception 'RETRY_DUPLICATED';end if;
 perform recovery_validate(b);
 if (select count(*) from recovery_diff(b,0,50))<>2 then raise exception 'DIFF_MISMATCH';end if;
 perform recovery_commit(b,'Impor data simulasi pengujian');perform recovery_commit(b,'Uji pengulangan commit');
 if (select count(*) from recovery_payments)<>1 then raise exception 'COMMIT_DUPLICATED';end if;
 records:=jsonb_set(records,'{2,data,amount}','0'::jsonb);
 correction:=recovery_begin('SIMULASI-koreksi.xlsx',repeat('2',64),3,'{"Mandiri":{"obligation":100000,"payment":0}}');
 perform recovery_append(correction,records);perform recovery_validate(correction);
 if not exists(select 1 from recovery_diff(correction,0,50) where before_amount=25000 and after_amount=0) then raise exception 'CORRECTION_DIFF_FAILED';end if;
 perform recovery_commit(correction,'Uji koreksi penerimaan menjadi nol');
 if (select nominal from recovery_payments limit 1)<>0 then raise exception 'ZERO_CORRECTION_FAILED';end if;
 bad:=recovery_begin('SIMULASI-tidak-cocok.xlsx',repeat('3',64),3,'{"Mandiri":{"obligation":100000,"payment":1}}');
 perform recovery_append(bad,records);
 begin
  perform recovery_validate(bad);raise exception 'MISMATCH_NOT_REJECTED';
 exception when others then
  if sqlerrm not like '%RECAP_MISMATCH%' then raise;end if;
 end;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform recovery_begin('SIMULASI-tanpa-login.xlsx',repeat('4',64),3,'{}');raise exception 'ACCESS_NOT_REJECTED';
 exception when others then
  if sqlerrm not like '%FORBIDDEN%' then raise;end if;
 end;
end $$;
commit;
select 'PASS: retry, commit ulang, diff, koreksi nol, rekap gagal, tanpa login ditolak' as tests,
 (select count(*) from recovery_test.recovery_people) as test_people,
 (select sum(nominal) from recovery_test.recovery_payments) as test_payments,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='recovery_test' and c.relkind='r' and c.relrowsecurity) as tables_with_rls,
 has_schema_privilege('authenticated','recovery_test','usage') as app_access,
 (select count(*) from public.profiles) as profiles,
 (select count(*) from public.bottlenecks) as bottlenecks,
 (select count(*) from public.action_plans) as action_plans,
 (select count(*) from public.sdm_cases) as sdm_cases;
