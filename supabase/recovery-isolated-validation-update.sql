-- LOCAL PATCH: not applied to the server yet. No permission changes.
begin;
create or replace function recovery_test.recovery_validate(p_batch uuid) returns jsonb
language plpgsql security definer set search_path=recovery_test,pg_catalog as $$
declare b recovery_imports; actual jsonb; corrections bigint;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') not in ('admin','editor') then raise exception 'FORBIDDEN';end if;
 select * into b from recovery_imports where id=p_batch for update;
 if not found or b.actor<>auth.uid() or b.status not in ('preview','validated') then raise exception 'INVALID_BATCH';end if;
 if (select count(*) from recovery_staging where import_id=p_batch)<>b.expected_rows then raise exception 'INCOMPLETE_BATCH';end if;
 if b.base_revision<>(select revision from recovery_revision where id=1) then raise exception 'STALE_PREVIEW';end if;
 analyze recovery_test.recovery_staging;
 if exists(select 1 from recovery_staging s where s.import_id=p_batch and s.record_type<>'person' and not exists(select 1 from recovery_staging p where p.import_id=p_batch and p.record_type='person' and p.record_key=s.data->>'nip' and p.data->>'bank'=s.data->>'bank')) then raise exception 'MISSING_PERSON';end if;
 if exists(select 1 from recovery_staging s where s.import_id=p_batch and s.record_type='person' and exists(select 1 from recovery_people p where p.nip=s.data->>'nip' and p.bank<>s.data->>'bank')) then raise exception 'BANK_CHANGE_REQUIRES_REVIEW';end if;
 if exists(select 1 from recovery_staging s where s.import_id=p_batch and s.record_type='payment' and not exists(select 1 from recovery_staging o where o.import_id=p_batch and o.record_type='obligation' and o.record_key=concat_ws('|',s.data->>'nip',s.data->>'bank',s.data->>'kind',s.data->>'year'))) then raise exception 'MISSING_OBLIGATION';end if;
 if exists(select 1 from recovery_staging o join (
  select obligation_key,sum((data->>'amount')::bigint) nominal from recovery_staging where import_id=p_batch and record_type='payment' group by obligation_key
 ) p on p.obligation_key=o.record_key where o.import_id=p_batch and o.record_type='obligation' and p.nominal>(o.data->>'amount')::bigint) then raise exception 'OVERPAYMENT';end if;
 select jsonb_object_agg(bank,totals) into actual from (
  select data->>'bank' bank,jsonb_build_object('obligation',coalesce(sum((data->>'amount')::bigint) filter(where record_type='obligation'),0),'payment',coalesce(sum((data->>'amount')::bigint) filter(where record_type='payment'),0)) totals
  from recovery_staging where import_id=p_batch and record_type<>'person' group by data->>'bank') q;
 if actual is distinct from b.expected_totals then raise exception 'RECAP_MISMATCH';end if;
 -- Retaining an omitted positive payment would increase the ledger beyond the
 -- snapshot recap. Reject before review/commit instead of waiting for rollback.
 if exists(select 1 from recovery_payments p join recovery_obligations o on o.id=p.obligation_id
  where p.nominal>0 and b.expected_totals ? o.bank and not exists(
   select 1 from recovery_staging s where s.import_id=p_batch and s.record_type='payment'
    and s.record_key=concat_ws('|',o.nip,o.bank,o.jenis,o.tahun_kewajiban,p.tahap)
  )) then raise exception 'MISSING_HISTORY_REQUIRES_REVIEW';end if;
 select count(*) into corrections from recovery_staging s join recovery_obligations o on o.nip=s.data->>'nip' and o.bank=s.data->>'bank' and o.jenis=s.data->>'kind' and o.tahun_kewajiban=(s.data->>'year')::integer
 where s.import_id=p_batch and s.record_type='obligation' and o.nominal<>(s.data->>'amount')::bigint;
 update recovery_imports set status='validated',summary=jsonb_build_object('totals',actual,'obligationCorrections',corrections) where id=p_batch;
 return jsonb_build_object('totals',actual,'obligationCorrections',corrections);
end $$;
commit;
