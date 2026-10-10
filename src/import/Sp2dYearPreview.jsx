import React from 'react'
export default function Sp2dYearPreview({sources=[]}) {
 return <section className="panel" style={{marginTop:20}}>
  <h2>Tahun SP2D — pemeriksaan sumber</h2>
  <p>Kolom Tahun SP2D pada sheet pendukung dibaca sebagai referensi tahun. Nomor dan tanggal penerbitan SP2D belum dipetakan. Tanggal proses debet merupakan informasi terpisah.</p>
  {!sources.length?<p>Tidak ditemukan sheet pendukung tahun SP2D yang dikenali pada workbook ini.</p>:<div className="table-scroll"><table>
   <thead><tr><th>Sheet sumber</th><th>Baris sumber</th><th>Tahun SP2D</th><th>Cocok dengan master</th><th>Perlu tinjauan</th></tr></thead>
   <tbody>{sources.map(s=><tr key={s.sheet}><td>{s.sheet}{s.missingHeaders&&<small>Kolom wajib belum lengkap</small>}</td><td>{s.rows.toLocaleString('id-ID')}</td><td>{Object.entries(s.years).map(([year,count])=>`${year}: ${count.toLocaleString('id-ID')} baris`).join(' • ')||'Belum tersedia'}</td><td>{s.matched.toLocaleString('id-ID')}</td><td>{(s.held+s.invalid).toLocaleString('id-ID')}<small>{s.invalid} identitas/tahun tidak valid • {s.duplicateRows} baris duplikat</small></td></tr>)}</tbody>
  </table></div>}
  <p>Hasil cocok memerlukan NIP, nama, bank dan tahun kewajiban bernominal positif yang sesuai. Sheet dapat memuat SDM yang sama pada tahap berbeda; jumlah baris tidak dijumlahkan sebagai jumlah SDM atau tagihan. Pemeriksaan ini tidak mengubah nominal, menetapkan dokumen SP2D, atau memverifikasi penerimaan.</p>
 </section>
}
