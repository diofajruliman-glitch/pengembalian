import {JADWAL_WAWANCARA_1057_REVISI as schedule} from '../src/letters/jadwalWawancara1057Data.js'
// Only enrich missing contact fields; never change existing statement responses.
const contacts=schedule.map(r=>({nip:r.nip,provinsi:r.provinsi||'',kabKota:r.kabKota||'',noHp:r.noHp||''}))
console.log(`with contacts as (select * from jsonb_to_recordset('${JSON.stringify(contacts).replaceAll("'","''")}'::jsonb) as r(nip text,provinsi text,"kabKota" text,"noHp" text)), updated as (
 update public.interview_statements s set details=s.details||jsonb_build_object(
 'provinsi',coalesce(nullif(s.details->>'provinsi',''),r.provinsi),
 'kabKota',coalesce(nullif(s.details->>'kabKota',''),r."kabKota"),
 'noHp',coalesce(nullif(s.details->>'noHp',''),r."noHp")),revision=s.revision+1,updated_at=clock_timestamp()
 from public.interview_cases c join contacts r on r.nip=regexp_replace(c.person->>'nip','[^0-9]','','g')
 where s.nik=c.nik and s.confirmed_at is null and ((coalesce(s.details->>'provinsi','')='' and r.provinsi<>'') or (coalesce(s.details->>'kabKota','')='' and r."kabKota"<>'') or (coalesce(s.details->>'noHp','')='' and r."noHp"<>''))
 returning s.nik) select count(*) as enriched_contacts from updated;`)
