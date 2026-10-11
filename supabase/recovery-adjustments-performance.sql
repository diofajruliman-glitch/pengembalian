-- Derived reporting columns; source JSON and snapshot history remain unchanged.
begin;
set local statement_timeout='120s';
create or replace function recovery_adjustments.automatic_reason(d jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare reason text;
begin
 if not coalesce((d->>'changed')::boolean,false) then return false; end if;
 reason=recovery_adjustments.primary_reason(d);
 return not(reason='TENDIK' and coalesce(d->>'note','') ~* '(^|[^A-Za-z])TENDIK([^A-Za-z]|$)') and not exists(select 1 from jsonb_array_elements(d->'evidence') e where e->>'reason'=reason and e->>'origin'='keterangan sumber');
end $$;
revoke all on function recovery_adjustments.automatic_reason(jsonb) from public,anon,authenticated;
alter table recovery_adjustments.records
 add column if not exists sp2d_old text generated always as(data->>'sp2dOld') stored,
 add column if not exists sp2d_updated text generated always as(data->>'sp2dUpdated') stored,
 add column if not exists send_bpk text generated always as(data->>'bpk') stored,
 add column if not exists period_month text generated always as(data->>'month') stored,
 add column if not exists amount_initial numeric generated always as((data->>'initial')::numeric) stored,
 add column if not exists amount_final numeric generated always as((data->>'final')::numeric) stored,
 add column if not exists amount_delta numeric generated always as((data->>'delta')::numeric) stored,
 add column if not exists amount_changed boolean generated always as((data->>'changed')::boolean) stored,
 add column if not exists status_changed boolean generated always as((data->>'statusChanged')::boolean) stored,
 add column if not exists reason_primary text generated always as(recovery_adjustments.primary_reason(data)) stored,
 add column if not exists source_preferred boolean generated always as(recovery_adjustments.primary_reason(data)<>recovery_adjustments.default_primary_reason(data)) stored,
 add column if not exists reason_automatic boolean generated always as(recovery_adjustments.automatic_reason(data)) stored;
create index if not exists adjustments_report_old on recovery_adjustments.records(import_id,sp2d_old);
create index if not exists adjustments_report_updated on recovery_adjustments.records(import_id,sp2d_updated);
create index if not exists adjustments_report_bpk on recovery_adjustments.records(import_id,send_bpk);
create index if not exists adjustments_report_reason on recovery_adjustments.records(import_id,reason_primary);

create or replace function public.recovery_adjustment_read(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set statement_timeout='30s' as $$
declare current_import recovery_adjustments.imports%rowtype; answer jsonb; requested_page integer; f jsonb; extra jsonb;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') not in ('admin','editor','viewer') then raise exception 'FORBIDDEN'; end if;
 if p_action='history' then
  if coalesce(p_payload->>'nip','') !~ '^[0-9]{18}$' then raise exception 'INVALID_NIP'; end if;
  select jsonb_build_object(
   'rows',coalesce((select jsonb_agg(r.data||jsonb_build_object('importId',i.id,'fileName',i.manifest->>'fileName','headers',i.manifest->'headers','importedAt',i.imported_at) order by i.id,(r.data->>'periodYear')::integer,array_position(array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'],r.period_month)) from recovery_adjustments.records r join recovery_adjustments.imports i on i.id=r.import_id where i.imported_at is not null and r.nip=p_payload->>'nip'),'[]'::jsonb),
   'imports',coalesce((select jsonb_agg(jsonb_build_object('importId',id,'fileName',manifest->>'fileName','sha256',sha256,'ruleVersion',rule_version,'importedAt',imported_at) order by id) from recovery_adjustments.imports i where imported_at is not null and exists(select 1 from recovery_adjustments.records r where r.import_id=i.id and r.nip=p_payload->>'nip')),'[]'::jsonb)
  ) into answer;
  return answer;
 end if;
 select * into current_import from recovery_adjustments.imports where active and imported_at is not null;
 if current_import.id is null then raise exception 'Lampiran belum diimpor ke Supabase.'; end if;
 if p_action='manifest' then return current_import.manifest||jsonb_build_object('source','database','importId',current_import.id,'importedAt',current_import.imported_at); end if;
 if p_action<>'query' then raise exception 'UNKNOWN_ACTION'; end if;
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into f from jsonb_each(coalesce(p_payload->'filters','{}'::jsonb)) where value<>'null'::jsonb and value<>'""'::jsonb;
 extra=f-array['sp2dOld','sp2dUpdated','bpk','month','primaryReason','sourcePriority','change'];
 requested_page=greatest(0,least(100000,coalesce((p_payload->>'page')::integer,0)));
 with selected as materialized (
  select source_row,nip,sp2d_old,sp2d_updated,send_bpk,period_month,amount_initial,amount_final,amount_delta,amount_changed,status_changed,reason_primary,source_preferred,reason_automatic
  from recovery_adjustments.records r where import_id=current_import.id
   and (not(f?'sp2dOld') or case when f->>'sp2dOld'='__EMPTY__' then coalesce(sp2d_old,'')='' else sp2d_old=f->>'sp2dOld' end)
   and (not(f?'sp2dUpdated') or case when f->>'sp2dUpdated'='__EMPTY__' then coalesce(sp2d_updated,'')='' else sp2d_updated=f->>'sp2dUpdated' end)
   and (not(f?'bpk') or case when f->>'bpk'='__EMPTY__' then coalesce(send_bpk,'')='' else send_bpk=f->>'bpk' end)
   and (not(f?'month') or case when f->>'month'='__EMPTY__' then coalesce(period_month,'')='' else period_month=f->>'month' end)
   and (not(f?'primaryReason') or reason_primary=f->>'primaryReason')
   and (f->>'sourcePriority' is distinct from 'changed' or source_preferred)
   and case f->>'change' when 'amount' then amount_changed when 'any' then amount_changed or status_changed when 'unchanged' then not amount_changed and not status_changed when 'missing' then amount_delta is null else true end
   and (extra='{}'::jsonb or recovery_adjustments.matches(r.data,extra))
 ), groups as (
  select grouping(sp2d_old) old_absent,grouping(sp2d_updated) update_absent,grouping(send_bpk) bpk_absent,sp2d_old old_year,sp2d_updated updated_year,send_bpk bpk,
   jsonb_build_object('rows',count(*),'people',count(distinct nip),'changed',count(*) filter(where amount_changed),'statusChanged',count(*) filter(where status_changed),
    'initial',coalesce(sum(amount_initial),0),'final',coalesce(sum(amount_final),0),'delta',coalesce(sum(amount_delta),0),
    'missingInitial',count(*) filter(where amount_initial is null),'missingFinal',count(*) filter(where amount_final is null),'missingDelta',count(*) filter(where amount_delta is null)) stats
  from selected group by grouping sets((),(sp2d_old,send_bpk),(sp2d_updated,send_bpk),(sp2d_old,sp2d_updated,send_bpk))
 ), reason_groups as (
  select reason_primary,period_month,
   jsonb_build_object('values',jsonb_build_array(reason_primary,period_month),'rows',count(*),'people',count(distinct nip),'changed',count(*) filter(where amount_changed),'statusChanged',count(*) filter(where status_changed),
    'initial',coalesce(sum(amount_initial),0),'final',coalesce(sum(amount_final),0),'delta',coalesce(sum(amount_delta),0),
    'reduction',coalesce(sum(greatest(0,-amount_delta)),0),'increase',coalesce(sum(greatest(0,amount_delta)),0),
    'automaticRows',count(*) filter(where reason_automatic),
    'missingInitial',count(*) filter(where amount_initial is null),'missingFinal',count(*) filter(where amount_final is null),'missingDelta',count(*) filter(where amount_delta is null)) stats
  from selected s group by reason_primary,period_month
 ), preference_groups as (
  select period_month,jsonb_build_object('values',jsonb_build_array(period_month),'rows',count(*),'people',count(distinct nip),'changed',count(*) filter(where amount_changed),'statusChanged',count(*) filter(where status_changed),
   'initial',coalesce(sum(amount_initial),0),'final',coalesce(sum(amount_final),0),'delta',coalesce(sum(amount_delta),0),
   'missingInitial',count(*) filter(where amount_initial is null),'missingFinal',count(*) filter(where amount_final is null),'missingDelta',count(*) filter(where amount_delta is null)) stats
  from selected where source_preferred group by period_month
 ), summary as (select stats,(stats->>'rows')::integer total from groups where old_absent=1 and update_absent=1 and bpk_absent=1), page_rows as (
  select s.* from selected s order by abs(coalesce(amount_delta,0)) desc,nip,period_month limit 25 offset least(requested_page,greatest(0,((select total from summary)-1)/25))*25
 ) select jsonb_build_object(
  'rows',coalesce((select jsonb_agg(r.data-'source' order by abs(coalesce(p.amount_delta,0)) desc,p.nip,p.period_month) from page_rows p join recovery_adjustments.records r on r.import_id=current_import.id and r.source_row=p.source_row),'[]'::jsonb),
  'summary',(select stats from summary),'page',least(requested_page,greatest(0,((select total from summary)-1)/25)),'pageSize',25,
  'recaps',jsonb_build_object(
   'reasons',coalesce((select jsonb_agg(stats order by reason_primary,period_month) from reason_groups),'[]'::jsonb),
   'sourcePriority',coalesce((select jsonb_agg(stats order by period_month) from preference_groups),'[]'::jsonb),
   'old',coalesce((select jsonb_agg(stats||jsonb_build_object('values',jsonb_build_array(case when old_year is null then null else old_year::integer end,bpk)) order by old_year,bpk) from groups where old_absent=0 and update_absent=1),'[]'::jsonb),
   'updated',coalesce((select jsonb_agg(stats||jsonb_build_object('values',jsonb_build_array(case when updated_year is null then null else updated_year::integer end,bpk)) order by updated_year,bpk) from groups where old_absent=1 and update_absent=0),'[]'::jsonb),
   'transition',coalesce((select jsonb_agg(stats||jsonb_build_object('values',jsonb_build_array(case when old_year is null then null else old_year::integer end,case when updated_year is null then null else updated_year::integer end,bpk)) order by old_year,updated_year,bpk) from groups where old_absent=0 and update_absent=0),'[]'::jsonb)
  )
 ) into answer;
 return answer;
end $$;
analyze recovery_adjustments.records;
commit;
