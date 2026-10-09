-- LOCAL READ-ONLY DRAFT. Requires recovery-case-links.draft.sql.
-- Not exposed via the live application API.
begin;
create function recovery_test.linked_case_meta() returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 return jsonb_build_object('revision',(select revision from recovery_test.recovery_revision where id=1),
  'caseToken',md5(coalesce((select jsonb_agg(to_jsonb(c) order by c.id)::text from public.sdm_cases c),'[]')),
  'linkToken',md5(coalesce((select jsonb_agg(to_jsonb(l) order by l.case_id)::text from recovery_test.case_master_links l),'[]')),
  'cases',(select count(*) from public.sdm_cases where deleted_at is null));
end $$;
create function recovery_test.read_linked_cases(p_after bigint default 0,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 if p_after<0 or p_limit<1 or p_limit>100 then raise exception 'INVALID_PAGE';end if;
 return (
  with cases as materialized (select * from public.sdm_cases where deleted_at is null and id>p_after order by id limit p_limit),
  joined as (select c,to_jsonb(c)||jsonb_build_object('id',c.id::text) manual,to_jsonb(l) reference,
   l.case_id,l.nip link_nip,p.nip master_nip,p.nama master_name,p.bank master_bank,
   f.obligation,f.payment,f.verified
   from cases c left join recovery_test.case_master_links l on l.case_id=c.id
   left join recovery_test.recovery_people p on p.nip=l.nip and p.archived_at is null
   left join lateral (select sum(o.nominal) obligation,sum(coalesce(q.payment,0)) payment,sum(coalesce(q.verified,0)) verified
    from recovery_test.recovery_obligations o left join lateral (select sum(r.nominal) payment,sum(r.nominal) filter(where r.verification='verified') verified from recovery_test.recovery_payments r where r.obligation_id=o.id) q on true where o.nip=p.nip) f on true),
  checked as (select *,case_id is not null and link_nip=(c).nip and master_nip is not null and obligation is not null
    and master_bank=(c).bank and upper(regexp_replace(btrim(master_name),'\s+',' ','g'))=upper(regexp_replace(btrim((c).nama),'\s+',' ','g')) valid_reference from joined)
  select jsonb_build_object('revision',(select revision from recovery_test.recovery_revision where id=1),'rows',coalesce(jsonb_agg(
   jsonb_build_object('manual',manual,'reference',case when case_id is null then null else reference end,
    'source',case when case_id is null then 'Manual' when valid_reference then 'Master tersimpan' else 'Referensi perlu ditinjau' end,
    'finance',case when case_id is null then jsonb_build_object('obligation',(c).kewajiban_total,'payment',(c).realisasi_total,'remaining',(c).kewajiban_total-(c).realisasi_total,'verified',null)
      when valid_reference then jsonb_build_object('obligation',obligation,'payment',payment,'remaining',obligation-payment,'verified',verified) else null end,
    'warnings',case when case_id is not null and not coalesce(valid_reference,false) then jsonb_build_array('Referensi master berubah atau belum tersedia; periksa kembali')
      when valid_reference and (c).status='Lunas Terverifikasi' and (obligation>payment or verified<obligation) then jsonb_build_array('Status lunas manual belum didukung nominal/verifikasi master') else '[]'::jsonb end)
   order by (c).id),'[]'::jsonb)) from checked
 );
end $$;
revoke all on function recovery_test.linked_case_meta(),recovery_test.read_linked_cases(bigint,integer) from public,anon,authenticated;
commit;
