// Fill only missing BAP source fields using the exact reference used by letters.
import {OFFICIAL_POPULATION_1057} from '../src/interviews/officialSchedule1057.js'
import {lookupNipPosition} from '../src/letters/nipPositionReference.js'
export const positions=OFFICIAL_POPULATION_1057.map(p=>{
 const reference=lookupNipPosition(p.nip)
 if(!reference?.pangkat||!reference?.jabatan)throw Error(`Referensi surat panggilan belum lengkap untuk NIP ${p.nip}`)
 return {nip:reference.nip,pangkat:reference.pangkat,jabatan:reference.jabatan}
})
export function positionBackfillSql(){
 const json=JSON.stringify(positions).replaceAll("'","''")
 return `with reference as (
 select * from jsonb_to_recordset('${json}'::jsonb) as r(nip text,pangkat text,jabatan text)
), updated as (
 update public.interview_cases c set
 person=c.person||jsonb_build_object(
  'pangkat',coalesce(nullif(btrim(c.person->>'pangkat'),''),r.pangkat),
  'jabatan',coalesce(nullif(btrim(c.person->>'jabatan'),''),r.jabatan)),
 revision=c.revision+1,updated_at=clock_timestamp()
 from reference r
 where regexp_replace(c.person->>'nip','[^0-9]','','g')=r.nip
 and c.status<>'Selesai'
 and (coalesce(btrim(c.person->>'pangkat'),'')='' or coalesce(btrim(c.person->>'jabatan'),'')='')
 returning c.nik
) select count(*) as updated_participants from updated;`
}
if(process.argv[1]?.endsWith('/prepare_interview_positions.mjs'))console.log(positionBackfillSql())
