-- REVIEWED TEST ACTIVATION: existing project, admin-only, no updates to public.sdm_cases.
-- No real-case fixtures are inserted by this script.
begin;
do $$begin
 if to_regclass('recovery_test.recovery_people') is null or to_regprocedure('public.current_app_role()') is null then raise exception 'TEST_PREREQUISITES_MISSING';end if;
 if to_regclass('recovery_test.case_master_links') is not null then raise exception 'CASE_TEST_ALREADY_INITIALIZED_REVIEW_REQUIRED';end if;
end $$;
-- LOCAL DRAFT ONLY. Do not apply until the test reference flow is approved.
-- No public application table is updated; these references remain in recovery_test.

create table recovery_test.case_link_batches(
 id uuid primary key default gen_random_uuid(),actor uuid not null references auth.users(id),
 master_revision bigint not null,status text not null default 'preview' check(status in ('preview','committed')),
 reason text,summary jsonb,created_at timestamptz not null default now()
);
create table recovery_test.case_link_items(
 batch_id uuid not null references recovery_test.case_link_batches(id),case_id bigint not null,
 nip text not null,expected_case jsonb not null,primary key(batch_id,case_id)
);
create table recovery_test.case_master_links(
 case_id bigint primary key,nip text not null references recovery_test.recovery_people(nip),
 approved_by uuid not null references auth.users(id),master_revision bigint not null,
 batch_id uuid not null references recovery_test.case_link_batches(id),reason text not null,
 approved_at timestamptz not null default now()
);
create table recovery_test.case_link_audit(
 id bigint generated always as identity primary key,batch_id uuid not null references recovery_test.case_link_batches(id),
 case_id bigint not null,nip text not null,actor uuid not null references auth.users(id),
 case_at_approval jsonb not null,reason text not null,created_at timestamptz not null default now()
);
alter table recovery_test.case_link_batches enable row level security;
alter table recovery_test.case_link_items enable row level security;
alter table recovery_test.case_master_links enable row level security;
alter table recovery_test.case_link_audit enable row level security;
revoke all on all tables in schema recovery_test from public,anon,authenticated;
revoke all on all sequences in schema recovery_test from public,anon,authenticated;

create function recovery_test.check_link_case(p_case bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare c public.sdm_cases; p recovery_test.recovery_people; total bigint; paid bigint; verified bigint;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 select * into c from public.sdm_cases where id=p_case for share;
 if not found then raise exception 'CASE_NOT_FOUND';end if;
 if c.deleted_at is not null then raise exception 'CASE_ARCHIVED';end if;
 select * into p from recovery_test.recovery_people where nip=c.nip and archived_at is null;
 if not found then raise exception 'MASTER_PERSON_NOT_FOUND';end if;
 if upper(regexp_replace(btrim(c.nama),'\s+',' ','g'))<>upper(regexp_replace(btrim(p.nama),'\s+',' ','g')) then raise exception 'CASE_NAME_MISMATCH';end if;
 if c.bank<>p.bank then raise exception 'CASE_BANK_MISMATCH';end if;
 select sum(nominal) into total from recovery_test.recovery_obligations where nip=c.nip;
 if total is null then raise exception 'MASTER_OBLIGATION_NOT_FOUND';end if;
 select coalesce(sum(q.nominal),0),coalesce(sum(q.nominal) filter(where q.verification='verified'),0) into paid,verified
 from recovery_test.recovery_payments q join recovery_test.recovery_obligations o on o.id=q.obligation_id where o.nip=c.nip;
 if c.status='Lunas Terverifikasi' and (total<=0 or paid<total or verified<total) then raise exception 'CASE_VERIFICATION_REQUIRES_REVIEW';end if;
 return to_jsonb(c);
end $$;
create function recovery_test.prepare_case_links(p_revision bigint,p_cases jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare revision bigint; batch uuid; item jsonb; image jsonb; n integer;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 if jsonb_typeof(p_cases) is distinct from 'array' then raise exception 'INVALID_CASE_SELECTION';end if;
 n:=jsonb_array_length(p_cases);if n<1 or n>500 then raise exception 'INVALID_CASE_SELECTION';end if;
 if (select count(distinct value->>'caseId') from jsonb_array_elements(p_cases))<>n then raise exception 'DUPLICATE_CASE_SELECTION';end if;
 select r.revision into revision from recovery_test.recovery_revision r where id=1 for share;
 if p_revision is distinct from revision then raise exception 'STALE_MASTER';end if;
 insert into recovery_test.case_link_batches(actor,master_revision) values(auth.uid(),revision) returning id into batch;
 for item in select value from jsonb_array_elements(p_cases) order by (value->>'caseId')::bigint loop
  if nullif(item->>'expectedUpdatedAt','') is null then raise exception 'CASE_SNAPSHOT_REQUIRED';end if;
  image:=recovery_test.check_link_case((item->>'caseId')::bigint);
  if (image->>'updated_at')::timestamptz<>(item->>'expectedUpdatedAt')::timestamptz then raise exception 'STALE_CASE';end if;
  insert into recovery_test.case_link_items values(batch,(item->>'caseId')::bigint,image->>'nip',image);
 end loop;
 return batch;
end $$;
create function recovery_test.commit_case_links(p_batch uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare b recovery_test.case_link_batches; item record; image jsonb; revision bigint; old_nip text; linked integer:=0; existing integer:=0; result jsonb;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 select * into b from recovery_test.case_link_batches where id=p_batch for update;
 if not found or b.actor<>auth.uid() then raise exception 'FORBIDDEN';end if;
 if b.status='committed' then return b.summary;end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'REASON_REQUIRED';end if;
 select r.revision into revision from recovery_test.recovery_revision r where id=1 for share;
 if revision<>b.master_revision then raise exception 'STALE_MASTER';end if;
 for item in select * from recovery_test.case_link_items where batch_id=p_batch order by case_id loop
  image:=recovery_test.check_link_case(item.case_id);
  if image is distinct from item.expected_case then raise exception 'STALE_CASE';end if;
  select nip into old_nip from recovery_test.case_master_links where case_id=item.case_id for update;
  if found then
   if old_nip<>item.nip then raise exception 'EXISTING_LINK_CONFLICT';end if;
   existing:=existing+1;continue;
  end if;
  insert into recovery_test.case_master_links values(item.case_id,item.nip,auth.uid(),revision,p_batch,p_reason,now()) on conflict(case_id) do nothing returning nip into old_nip;
  if not found then
   select nip into old_nip from recovery_test.case_master_links where case_id=item.case_id;
   if old_nip<>item.nip then raise exception 'EXISTING_LINK_CONFLICT';end if;
   existing:=existing+1;continue;
  end if;
  insert into recovery_test.case_link_audit(batch_id,case_id,nip,actor,case_at_approval,reason) values(p_batch,item.case_id,item.nip,auth.uid(),image,p_reason);
  linked:=linked+1;
 end loop;
 result:=jsonb_build_object('linked',linked,'alreadyLinked',existing,'masterRevision',revision);
 update recovery_test.case_link_batches set status='committed',reason=p_reason,summary=result where id=p_batch;
 return result;
end $$;
revoke all on function recovery_test.check_link_case(bigint),recovery_test.prepare_case_links(bigint,jsonb),recovery_test.commit_case_links(uuid,text) from public,anon,authenticated;

-- LOCAL READ-ONLY DRAFT. Requires recovery-case-links.draft.sql.
-- Not exposed via the live application API.

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

-- LOCAL DRAFT. Adds an admin-only API for test references; no public case updates.

create function public.recovery_case_test_rpc(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'')<>'admin' then raise exception 'FORBIDDEN';end if;
 case p_action
 when 'case_prepare' then return to_jsonb(recovery_test.prepare_case_links((p_payload->>'p_revision')::bigint,p_payload->'p_cases'));
 when 'case_commit' then return recovery_test.commit_case_links((p_payload->>'p_batch')::uuid,p_payload->>'p_reason');
 when 'recovery_linked_meta' then return recovery_test.linked_case_meta();
 when 'recovery_linked_cases' then return recovery_test.read_linked_cases(coalesce((p_payload->>'p_after')::bigint,0),coalesce((p_payload->>'p_limit')::integer,100));
 else raise exception 'INVALID_CASE_ACTION';
 end case;
end $$;
revoke all on function public.recovery_case_test_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.recovery_case_test_rpc(text,jsonb) to authenticated;

commit;
