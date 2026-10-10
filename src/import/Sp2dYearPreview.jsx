import React from 'react'
const rp=n=>'Rp '+Number(n).toLocaleString('id-ID')
export default function Sp2dYearPreview({years=[]}) {
 return <section className="panel" style={{marginTop:20}}>
  <h2>Rekap tahun SP2D dari master bank</h2>
  <p>Tahun SP2D mengikuti kolom tahun pada kewajiban Tukin dan Uang Makan. Nominal positif berarti memiliki kewajiban pada tahun tersebut; sel kosong atau 0 berarti tidak memiliki kewajiban. SDM dapat masuk 2025 dan 2026 sekaligus.</p>
  {!years.length?<p>Belum ada tahun SP2D dengan kewajiban bernominal positif.</p>:<div className="table-scroll"><table>
   <thead><tr><th>Tahun SP2D</th><th>SDM</th><th>Kewajiban Tukin</th><th>Kewajiban Uang Makan</th><th>Pengembalian Excel</th><th>Sisa</th></tr></thead>
   <tbody>{years.map(s=><tr key={s.year}><td>{s.year}</td><td>{s.people.toLocaleString('id-ID')}</td><td>{rp(s.tukin)}</td><td>{rp(s.um)}</td><td>{rp(s.payment)}</td><td>{rp(s.remaining)}</td></tr>)}</tbody>
  </table></div>}
  <p>Pengembalian setiap tahap mengikuti jenis dan kolom tahun masing-masing. Jumlah SDM antar tahun tidak dijumlahkan sebagai SDM unik. Tahun SP2D ini bukan tanggal pengembalian atau verifikasi bukti penerimaan.</p>
 </section>
}
