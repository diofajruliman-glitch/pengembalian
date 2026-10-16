import React from 'react'
import {DISCIPLINE_CATEGORIES} from './analysis.js'
import {FOCUSED_ASSESSMENTS,TRANSACTION_AVAILABILITY_LABELS} from './availability.js'

const number=value=>value.toLocaleString('id-ID')
export default function DisciplineFilters({value,counts,total,sourceTotal,onChange,onReset,busy}){
 return <section className="panel"><h2>Populasi & filter</h2>
  <div className="judol-categories">{FOCUSED_ASSESSMENTS.map(status=><button key={status} className={'btn '+(value.assessment===status?'primary':'secondary')} aria-pressed={value.assessment===status} disabled={busy} onClick={()=>onChange({assessment:value.assessment===status?'':status})}>{status}: {number(counts[status]||0)}</button>)}<button className={'btn '+(!value.assessment?'primary':'secondary')} aria-pressed={!value.assessment} disabled={busy} onClick={()=>onChange({assessment:''})}>Kedua status: {number(total)}</button></div>
  <p>Fokus {number(total)} SDM Terbukti/Tidak Terbukti dari {number(sourceTotal)} SDM sumber. Ringkasan, daftar, audit SDM, dan ekspor mengikuti filter aktif.{sourceTotal>total&&` Sebanyak ${number(sourceTotal-total)} SDM di luar kedua status tetap disimpan pada sumber dan tidak masuk daftar ini.`}</p>
  <div className="judol-filters">
   <label>Cari nama / NIK / NIP<input disabled={busy} value={value.search} onChange={event=>onChange({search:event.target.value})} placeholder="Cari SDM…"/></label>
   <label>Hasil klarifikasi<select disabled={busy} value={value.assessment} onChange={event=>onChange({assessment:event.target.value})}><option value="">Kedua status</option>{FOCUSED_ASSESSMENTS.map(status=><option key={status}>{status}</option>)}</select></label>
   <label>Kelengkapan data<select disabled={busy} value={value.availability} onChange={event=>onChange({availability:event.target.value})}><option value="">Semua kelengkapan</option>{Object.entries(TRANSACTION_AVAILABILITY_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label>Periode filter kategori<select disabled={busy} value={value.period} onChange={event=>onChange({period:event.target.value})}><option value="historical">Pairing Sekjen</option><option value="before">Sebelum ASN</option><option value="after">Sesudah ASN</option></select></label>
   <label>Kategori dugaan pelanggaran<select disabled={busy} value={value.category} onChange={event=>onChange({category:event.target.value})}><option value="">Semua kategori</option>{DISCIPLINE_CATEGORIES.map(category=><option key={category}>{category}</option>)}</select></label>
  </div>
  <button className="btn secondary discipline-reset" disabled={busy} onClick={onReset}>Pulihkan filter Terbukti</button>
 </section>
}
