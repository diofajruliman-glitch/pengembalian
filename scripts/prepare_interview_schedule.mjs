// Emits a reviewable, additive SQL seed. No credentials or passwords are used.
import {OFFICIAL_POPULATION_1057,buildOfficialEntries} from '../src/interviews/officialSchedule1057.js'
import {JADWAL_WAWANCARA_1057_REVISI} from '../src/letters/jadwalWawancara1057Data.js'
const entries=buildOfficialEntries()
const byNip=new Map(JADWAL_WAWANCARA_1057_REVISI.map(r=>[r.nip,r]))
const rows=OFFICIAL_POPULATION_1057.map(p=>({nik:p.nik,room_id:entries[p.nik].roomId,scheduled_date:entries[p.nik].date,scheduled_time:entries[p.nik].time,nomor_surat:byNip.get(p.nip)?.nomorSurat||''}))
const json=JSON.stringify(rows).replaceAll("'","''")
console.log(`-- Import only new cases matching the latest active saved discipline dataset.
-- Existing BAP answers, identities and schedules are never overwritten.
with dataset as (select id,result from public.discipline_datasets where status='active' order by created_at desc limit 1),
schedule as (select * from jsonb_to_recordset('${json}'::jsonb) as x(nik text,room_id text,scheduled_date date,scheduled_time time,nomor_surat text)),
inserted as (
 insert into public.interview_cases(nik,dataset_id,person,room_id,scheduled_date,scheduled_time)
 select s.nik,d.id,jsonb_build_object('nik',s.nik,'nama',r->>'nama','nip',r->>'nip','pangkat',coalesce(r->>'pangkat',''),'jabatan',coalesce(r->>'jabatan',''),'unitKerja',coalesce(r->>'unitKerja','Direktorat Perlindungan Sosial Non Kebencanaan'),'nomorSurat',s.nomor_surat,'tanggalSurat','2026-10-15'),s.room_id,s.scheduled_date,s.scheduled_time
 from dataset d cross join lateral jsonb_array_elements(d.result->'rows') r join schedule s on s.nik=r->>'nik'
 where r->>'hasilPenilaian'='Terbukti'
 on conflict(nik) do nothing returning nik
) select count(*) as inserted_schedule_entries from inserted;`)
