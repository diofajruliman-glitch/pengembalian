import React from 'react'
import KemensosHeader from './KemensosHeader'

const fmtRp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID', {maximumFractionDigits: 0})

export default function LetterDocument({
  template,
  recipient,
  official,
  venue,
  letterNumber = '       /3.3/KP.06.04/10/2026',
  letterDate = '15 Oktober 2026',
  customAgenda = '',
  customOpening = '',
  customCoordination = '',
  customClosing = '',
  showClassification = true,
  classificationPosition = 'left',
  classificationText = '',
  showRank = true
}) {
  const isTagihan = template.category === 'keuangan' && !template.id?.startsWith('panggilan')
  const isBeritaAcara = template.category === 'berita-acara'
  const effectiveShowClassification = showClassification ?? template.showClassification ?? true
  const effectivePosition = classificationPosition || template.classificationPosition || 'left'
  const effectiveClassification = classificationText || template.classification || 'RAHASIA'
  const effectiveShowRank = showRank ?? template.showRank ?? true

  const openingText = customOpening || template.openingText || 'Sehubungan dengan Hasil Pemeriksaan dan Rekonsiliasi Tindak Lanjut Pengembalian Kelebihan Pembayaran Tunjangan Kinerja dan Uang Makan PPPK TA 2025 pada Direktorat Perlindungan Sosial Non Kebencanaan, bersama ini kami sampaikan rincian kewajiban pengembalian yang masih tercatat sebagai berikut:'
  const agendaText = customAgenda || template.agendaDefault
  const coordText = customCoordination || template.coordinationText || 'Apabila terdapat ketidaksesuaian perhitungan data atau telah memiliki bukti setor yang belum terverifikasi, Saudara dapat segera berkoordinasi langsung dengan Pokja SD Tim TLHP Direktorat PSNK.'
  const closingText = customClosing || template.closingText || 'Demikian surat penagihan ini disampaikan untuk menjadi perhatian dan dilaksanakan sebagaimana mestinya.'

  return (
    <article className="sheet-a4 printable-letter-sheet">
      {/* 1. KOP SURAT RESMI KEMENSOS (GAMBAR RESMI YANG DIUNGGAH PENGGUNA) */}
      <KemensosHeader />

      {/* 2. SIFAT / DERAJAT KEAMANAN (BISA DIATUR POSISI: KIRI, TENGAH, KANAN, ATAU DISEMBUNYIKAN) */}
      {effectiveShowClassification && (
        <div
          className="doc-classification"
          style={{
            textAlign: effectivePosition === 'center' ? 'center' : (effectivePosition === 'right' ? 'right' : 'left'),
            width: '100%'
          }}
        >
          {effectiveClassification}
        </div>
      )}

      {/* 3. JUDUL & NOMOR SURAT */}
      <div className="doc-heading-center">
        <h2 className="doc-heading-title">{template.title}</h2>
        <div className="doc-heading-number">NOMOR : {letterNumber}</div>
      </div>

      {/* 4. KONTEN DOKUMEN SESUAI KATEGORI */}
      {isTagihan ? (
        // ================= KONTEN SURAT TAGIHAN =================
        <div className="doc-body">
          <div className="doc-salutation">
            Kepada Yth.<br />
            <strong>Saudara/i {recipient.nama || '—'}</strong><br />
            NIP/NIPPPK : {recipient.nip || '—'}<br />
            Jabatan : {recipient.jabatan || 'PPPK Direktorat PSNK'}<br />
            di Tempat
          </div>

          <p className="doc-body-paragraph">
            {openingText}
          </p>

          <table className="doc-invoice-table">
            <colgroup>
              <col style={{width: '32px'}} />
              <col style={{width: 'auto'}} />
              <col style={{width: '110px'}} />
              <col style={{width: '110px'}} />
              <col style={{width: '185px'}} />
            </colgroup>
            <thead>
              <tr>
                <th style={{width: '32px', textAlign: 'center'}}>No</th>
                <th style={{textAlign: 'center'}}>Uraian Kewajiban</th>
                <th style={{width: '110px', textAlign: 'center'}}>Kewajiban Awal</th>
                <th style={{width: '110px', textAlign: 'center'}}>Telah Disetor</th>
                <th className="col-sisa" style={{width: '185px', textAlign: 'center', whiteSpace: 'nowrap'}}>Sisa yang Wajib Disetor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{textAlign: 'center', fontWeight: 'bold'}}>1</td>
                <td>
                  <div style={{fontWeight: 'bold'}}>Pengembalian Kelebihan Pembayaran Tukin & Uang Makan</div>
                  <div style={{fontSize: '9pt', color: '#475569', marginTop: '2px', lineHeight: 1.25}}>
                    {recipient.kategori ? `Status/Kategori: ${recipient.kategori}` : 'PPPK TA 2025 Dit. PSNK'}
                    {recipient.bank ? ` · Payroll Bank ${recipient.bank}` : ''}
                  </div>
                </td>
                <td className="num">{fmtRp(recipient.kewajibanTotal || 0)}</td>
                <td className="num">{fmtRp(recipient.realisasiTotal || 0)}</td>
                <td className="num remaining-val col-sisa">{fmtRp(recipient.sisaKewajiban || 0)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th colSpan="4" style={{textAlign: 'right', fontWeight: 'bold', padding: '6px 8px'}}>
                  Total Sisa Kewajiban :
                </th>
                <th className="num remaining-val col-sisa" style={{textAlign: 'right', fontSize: '10pt', padding: '6px 8px'}}>
                  {fmtRp(recipient.sisaKewajiban || 0)}
                </th>
              </tr>
            </tfoot>
          </table>

          {agendaText && (
            <p className="doc-body-paragraph">
              {agendaText}
            </p>
          )}

          {coordText && (
            <p className="doc-body-paragraph">
              {coordText}
            </p>
          )}

          {closingText && (
            <p className="doc-body-paragraph">
              {closingText}
            </p>
          )}
        </div>
      ) : isBeritaAcara ? (
        // ================= KONTEN BERITA ACARA =================
        <div className="doc-body">
          <p className="doc-body-paragraph">
            Pada hari ini <strong>{venue.hari || 'Senin'}</strong>, tanggal <strong>{venue.tanggal || '26 Oktober 2026'}</strong>, bertempat di <strong>{venue.tempat}</strong>, kami yang bertanda tangan di bawah ini:
          </p>

          <table className="doc-entry-table">
            <tbody>
              <tr>
                <td className="col-label">1. Nama</td>
                <td className="col-sep">:</td>
                <td className="col-val"><strong>{official.nama}</strong></td>
              </tr>
              <tr>
                <td className="col-label">NIP</td>
                <td className="col-sep">:</td>
                <td className="col-val">{official.nip}</td>
              </tr>
              {effectiveShowRank && (
                <tr>
                  <td className="col-label">Pangkat/Gol</td>
                  <td className="col-sep">:</td>
                  <td className="col-val">{official.pangkat || official.pangkatSingkat}</td>
                </tr>
              )}
              <tr>
                <td className="col-label">Jabatan</td>
                <td className="col-sep">:</td>
                <td className="col-val">{official.jabatan}</td>
              </tr>
            </tbody>
          </table>
          <p style={{margin: '4px 0 4px 18px'}}>Selaku <strong>Pemeriksa</strong>, telah melakukan pemeriksaan/permintaan keterangan terhadap:</p>

          <table className="doc-entry-table">
            <tbody>
              <tr>
                <td className="col-label">2. Nama</td>
                <td className="col-sep">:</td>
                <td className="col-val"><strong>{recipient.nama || '—'}</strong></td>
              </tr>
              <tr>
                <td className="col-label">NIP/NIPPPK</td>
                <td className="col-sep">:</td>
                <td className="col-val">{recipient.nip || '—'}</td>
              </tr>
              {effectiveShowRank && (
                <tr>
                  <td className="col-label">Pangkat / Golongan</td>
                  <td className="col-sep">:</td>
                  <td className="col-val">{recipient.pangkat || 'Golongan IX'}</td>
                </tr>
              )}
              <tr>
                <td className="col-label">Jabatan</td>
                <td className="col-sep">:</td>
                <td className="col-val">{recipient.jabatan || 'Penata Layanan Operasional'}</td>
              </tr>
              <tr>
                <td className="col-label">Unit Kerja</td>
                <td className="col-sep">:</td>
                <td className="col-val">{recipient.unitKerja || official.unitKerja}</td>
              </tr>
            </tbody>
          </table>

          <p className="doc-body-paragraph">
            Pemeriksaan/permintaan keterangan dilakukan sehubungan dengan: <em>{customAgenda || template.agendaDefault}</em>. Seluruh keterangan dan pernyataan yang diberikan telah dicatat secara benar, tanpa ada paksaan dari pihak manapun.
          </p>

          <p className="doc-body-paragraph">
            {customClosing || template.closingText || 'Demikian Berita Acara ini dibuat dengan sebenarnya dalam rangkap 2 (dua) untuk dipergunakan sebagaimana mestinya.'}
          </p>
        </div>
      ) : (
        // ================= KONTEN SURAT PANGGILAN (FORMAT RESMI KEMENSOS) =================
        <div className="doc-body">
          <div className="doc-salutation">
            {customOpening || template.openingText || 'Bersama ini diminta dengan hormat kehadiran Saudara:'}
          </div>

          <table className="doc-entry-table">
            <tbody>
              <tr>
                <td className="col-label">Nama</td>
                <td className="col-sep">:</td>
                <td className="col-val"><strong>{recipient.nama || '—'}</strong></td>
              </tr>
              <tr>
                <td className="col-label">NIP/NIPPPK</td>
                <td className="col-sep">:</td>
                <td className="col-val">{recipient.nip || '—'}</td>
              </tr>
              {effectiveShowRank && (
                <tr>
                  <td className="col-label">Pangkat / Golongan</td>
                  <td className="col-sep">:</td>
                  <td className="col-val">{recipient.pangkat || 'Golongan IX'}</td>
                </tr>
              )}
              <tr>
                <td className="col-label">Jabatan</td>
                <td className="col-sep">:</td>
                <td className="col-val">{recipient.jabatan || 'Penata Layanan Operasional'}</td>
              </tr>
              <tr>
                <td className="col-label">Unit Kerja</td>
                <td className="col-sep">:</td>
                <td className="col-val">{recipient.unitKerja || official.unitKerja}</td>
              </tr>
              {Number(recipient.sisaKewajiban || 0) > 0 && (
                <tr>
                  <td className="col-label">Sisa yang Wajib Disetor</td>
                  <td className="col-sep">:</td>
                  <td className="col-val" style={{fontWeight: 'bold', color: '#b91c1c'}}>
                    {fmtRp(recipient.sisaKewajiban)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {Number(recipient.sisaKewajiban || 0) > 0 && (
            <div style={{margin: '8px 0 10px 0'}}>
              <div style={{fontSize: '11pt', fontWeight: 600, color: '#1e293b', marginBottom: '4px'}}>
                Rincian Kewajiban Pengembalian yang Masih Tercatat :
              </div>
              <table className="doc-invoice-table">
                <colgroup>
                  <col style={{width: '32px'}} />
                  <col style={{width: 'auto'}} />
                  <col style={{width: '110px'}} />
                  <col style={{width: '110px'}} />
                  <col style={{width: '185px'}} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{width: '32px', textAlign: 'center'}}>No</th>
                    <th style={{textAlign: 'center'}}>Uraian Kewajiban</th>
                    <th style={{width: '110px', textAlign: 'center'}}>Kewajiban Awal</th>
                    <th style={{width: '110px', textAlign: 'center'}}>Telah Disetor</th>
                    <th className="col-sisa" style={{width: '185px', textAlign: 'center', whiteSpace: 'nowrap'}}>Sisa yang Wajib Disetor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{textAlign: 'center', fontWeight: 'bold'}}>1</td>
                    <td>
                      <div style={{fontWeight: 'bold'}}>Pengembalian Kelebihan Pembayaran Tukin & Uang Makan</div>
                      <div style={{fontSize: '9pt', color: '#475569', marginTop: '2px', lineHeight: 1.25}}>
                        {recipient.kategori ? `Status/Kategori: ${recipient.kategori}` : 'PPPK Dit. PSNK'}
                        {recipient.bank ? ` · Payroll Bank ${recipient.bank}` : ''}
                      </div>
                    </td>
                    <td className="num">{fmtRp(recipient.kewajibanTotal || 0)}</td>
                    <td className="num">{fmtRp(recipient.realisasiTotal || 0)}</td>
                    <td className="num remaining-val col-sisa">{fmtRp(recipient.sisaKewajiban || 0)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan="4" style={{textAlign: 'right', fontWeight: 'bold', padding: '6px 8px'}}>
                      Total Sisa Kewajiban :
                    </th>
                    <th className="num remaining-val col-sisa" style={{textAlign: 'right', fontSize: '10pt', padding: '6px 8px'}}>
                      {fmtRp(recipient.sisaKewajiban || 0)}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div style={{margin: '10px 0 4px 0'}}>
            Untuk menghadap kepada:
          </div>

          <table className="doc-entry-table">
            <tbody>
              <tr>
                <td className="col-label">Nama</td>
                <td className="col-sep">:</td>
                <td className="col-val"><strong>{official.nama}</strong></td>
              </tr>
              <tr>
                <td className="col-label">NIP</td>
                <td className="col-sep">:</td>
                <td className="col-val">{official.nip}</td>
              </tr>
              {effectiveShowRank && (
                <tr>
                  <td className="col-label">Pangkat</td>
                  <td className="col-sep">:</td>
                  <td className="col-val">{official.pangkatSingkat || 'IV/c'}</td>
                </tr>
              )}
              <tr>
                <td className="col-label">Jabatan</td>
                <td className="col-sep">:</td>
                <td className="col-val">{official.jabatan}</td>
              </tr>
            </tbody>
          </table>

          <div className="doc-schedule-block">
            <div className="doc-session-heading">Pada :</div>
            <table className="doc-entry-table" style={{margin: '2px 0 4px 18px'}}>
              <tbody>
                <tr>
                  <td className="col-label">Hari</td>
                  <td className="col-sep">:</td>
                  <td className="col-val">{recipient.hari || venue.hari || 'Senin'}</td>
                </tr>
                <tr>
                  <td className="col-label">Tanggal</td>
                  <td className="col-sep">:</td>
                  <td className="col-val">{recipient.tanggal || venue.tanggal || '26 Oktober 2026'}</td>
                </tr>
                <tr>
                  <td className="col-label">Jam</td>
                  <td className="col-sep">:</td>
                  <td className="col-val">{recipient.jam || venue.jam || '10.00 WIB'}</td>
                </tr>
                <tr>
                  <td className="col-label">Tempat</td>
                  <td className="col-sep">:</td>
                  <td className="col-val">{recipient.tempat || venue.tempat || 'Kementerian Sosial Gedung A Lantai 3 Dit. Jamsos'}</td>
                </tr>
                {(recipient.linkZoom || venue.linkZoom) && (
                  <tr>
                    <td className="col-label">Link Zoom</td>
                    <td className="col-sep">:</td>
                    <td className="col-val" style={{wordBreak: 'break-all'}}>{recipient.linkZoom || venue.linkZoom}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="doc-body-paragraph">
            {customAgenda || template.agendaDefault}
          </p>

          {(customCoordination || template.coordinationText) && (
            <p className="doc-body-paragraph">
              {customCoordination || template.coordinationText}
            </p>
          )}

          <p className="doc-body-paragraph" style={{marginTop: 10}}>
            {customClosing || template.closingText || 'Demikian untuk dilaksanakan.'}
          </p>
        </div>
      )}

      {/* 5. TITIMANGSA & BLOK TANDA TANGAN */}
      {isBeritaAcara ? (
        <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 24, pageBreakInside: 'avoid', fontSize: '12pt'}}>
          <div style={{width: 220, fontSize: '12pt'}}>
            <div>Yang Diperiksa,</div>
            <div style={{height: 50}} />
            <div style={{fontWeight: 'bold', textDecoration: 'underline'}}>{recipient.nama}</div>
            <div>NIP. {recipient.nip}</div>
          </div>
          <div style={{width: 260, fontSize: '12pt'}}>
            <div>{official.kota || 'Jakarta'}, {letterDate}</div>
            <div>Pemeriksa,</div>
            <div style={{height: 50}} />
            <div style={{fontWeight: 'bold', textDecoration: 'underline'}}>{official.nama}</div>
            <div>NIP. {official.nip}</div>
          </div>
        </div>
      ) : (
        <div className="doc-signoff-block">
          <div className="doc-signoff-wrap">
            <div className="doc-signoff-date">{official.kota || 'Jakarta'}, {letterDate}</div>
            <div className="doc-signoff-role">{official.jabatan}</div>
            <h3 className="doc-signoff-name">{official.nama}</h3>
            <div className="doc-signoff-nip">NIP. {official.nip}</div>
          </div>
        </div>
      )}

      {/* 6. TEMBUSAN RESMI */}
      {template.tembusan && template.tembusan.length > 0 && (
        <div className="doc-copies-block">
          <div className="doc-copies-title">Tembusan Yth:</div>
          <ol className="doc-copies-list">
            {template.tembusan.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ol>
        </div>
      )}
    </article>
  )
}
