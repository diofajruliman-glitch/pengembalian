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
  customAgenda = ''
}) {
  const isTagihan = template.category === 'keuangan'
  const isBeritaAcara = template.category === 'berita-acara'

  return (
    <article className="sheet-a4 printable-letter-sheet">
      {/* 1. KOP SURAT RESMI KEMENSOS */}
      <KemensosHeader />

      {/* 2. SIFAT / DERAJAT KEAMANAN */}
      <div className="doc-classification">{template.classification || 'RAHASIA'}</div>

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
            <strong>Saudara/i {recipient.nama || '«NAMA ASN»'}</strong><br />
            NIP/NIPPPK : {recipient.nip || '«NIP»'}<br />
            Jabatan : {recipient.jabatan || 'PPPK / Pegawai Dit. PSNK'}<br />
            di Tempat
          </div>

          <p className="doc-body-paragraph">
            Sehubungan dengan Hasil Pemeriksaan dan Rekonsiliasi Tindak Lanjut Pengembalian Kelebihan Pembayaran Tunjangan Kinerja dan Uang Makan PPPK TA 2025 pada Direktorat Perlindungan Sosial Non Kebencanaan, bersama ini kami sampaikan rincian kewajiban pengembalian yang masih tercatat sebagai berikut:
          </p>

          <table className="doc-invoice-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Uraian Kewajiban</th>
                <th>Kewajiban Awal</th>
                <th>Telah Disetor</th>
                <th>Sisa yang Wajib Disetor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{textAlign: 'center'}}>1</td>
                <td>Pengembalian Kelebihan Bayar Tukin & Uang Makan TA 2025</td>
                <td className="num">{fmtRp(recipient.kewajibanTotal || 0)}</td>
                <td className="num">{fmtRp(recipient.realisasiTotal || 0)}</td>
                <td className="num" style={{color: '#991b1b'}}>{fmtRp(recipient.sisaKewajiban || 0)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th colSpan="4" style={{textAlign: 'right'}}>Total Sisa Kewajiban :</th>
                <th className="num" style={{color: '#991b1b', fontSize: '10.5pt'}}>{fmtRp(recipient.sisaKewajiban || 0)}</th>
              </tr>
            </tfoot>
          </table>

          <p className="doc-body-paragraph">
            Mengingat batas waktu penyelesaian tindak lanjut sesuai rekomendasi pengawasan, diminta kepada Saudara untuk segera melakukan penyetoran sisa kewajiban tersebut ke Kas Negara melalui <strong>Kode Billing SIMPONI</strong> (Akun Penerimaan Pengembalian Belanja Pegawai TA Yang Lalu) selambat-lambatnya dalam jangka waktu <strong>14 (empat belas) hari kalender</strong> sejak surat ini diterima, dan segera menyampaikan bukti setor sah (NTPN/BPN) kepada Tim TLHP Direktorat PSNK.
          </p>

          <p className="doc-body-paragraph">
            Apabila terdapat ketidaksesuaian perhitungan data atau telah memiliki bukti setor yang belum terverifikasi, Saudara dapat segera berkoordinasi langsung dengan Tim Pokja Evkin/TLHP Direktorat PSNK.
          </p>

          <p className="doc-body-paragraph">
            Demikian surat penagihan ini disampaikan untuk menjadi perhatian dan dilaksanakan sebagaimana mestinya.
          </p>
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
              <tr>
                <td className="col-label">Pangkat/Gol</td>
                <td className="col-sep">:</td>
                <td className="col-val">{official.pangkat || official.pangkatSingkat}</td>
              </tr>
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
                <td className="col-val"><strong>{recipient.nama || '«NAMA ASN»'}</strong></td>
              </tr>
              <tr>
                <td className="col-label">NIP/NIPPPK</td>
                <td className="col-sep">:</td>
                <td className="col-val">{recipient.nip || '«NIP»'}</td>
              </tr>
              <tr>
                <td className="col-label">Pangkat/Gol</td>
                <td className="col-sep">:</td>
                <td className="col-val">{recipient.pangkat || 'Penata Muda (III/a)'}</td>
              </tr>
              <tr>
                <td className="col-label">Jabatan</td>
                <td className="col-sep">:</td>
                <td className="col-val">{recipient.jabatan || 'PPPK / Pegawai Dit. PSNK'}</td>
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
            Demikian Berita Acara ini dibuat dengan sebenarnya dalam rangkap 2 (dua) untuk dipergunakan sebagaimana mestinya.
          </p>
        </div>
      ) : (
        // ================= KONTEN SURAT PANGGILAN (FORMAT PERSIS CONTOH KEMENSOS) =================
        <div className="doc-body">
          <div className="doc-salutation">
            Bersama ini diminta dengan hormat kehadiran Saudara:
          </div>

          <table className="doc-entry-table">
            <tbody>
              <tr>
                <td className="col-label">Nama</td>
                <td className="col-sep">:</td>
                <td className="col-val"><strong>{recipient.nama || '«NAMA ASN»'}</strong></td>
              </tr>
              <tr>
                <td className="col-label">NIP/NIPPPK</td>
                <td className="col-sep">:</td>
                <td className="col-val">{recipient.nip || '«NIP »'}</td>
              </tr>
              <tr>
                <td className="col-label">Pangkat</td>
                <td className="col-sep">:</td>
                <td className="col-val">{recipient.pangkat || '«pangkat»'}</td>
              </tr>
              <tr>
                <td className="col-label">Jabatan</td>
                <td className="col-sep">:</td>
                <td className="col-val">{recipient.jabatan || '«Jabatan»'}</td>
              </tr>
              <tr>
                <td className="col-label">Unit Kerja</td>
                <td className="col-sep">:</td>
                <td className="col-val">{recipient.unitKerja || official.unitKerja}</td>
              </tr>
            </tbody>
          </table>

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
              <tr>
                <td className="col-label">Pangkat</td>
                <td className="col-sep">:</td>
                <td className="col-val">{official.pangkatSingkat || 'IV/c'}</td>
              </tr>
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
                  <td className="col-val">{venue.hari || 'Senin'}</td>
                </tr>
                <tr>
                  <td className="col-label">Tanggal</td>
                  <td className="col-sep">:</td>
                  <td className="col-val">{venue.tanggal || '26 Oktober 2026'}</td>
                </tr>
                <tr>
                  <td className="col-label">Jam</td>
                  <td className="col-sep">:</td>
                  <td className="col-val">{venue.jam || '10.00 WIB'}</td>
                </tr>
                <tr>
                  <td className="col-label">Tempat</td>
                  <td className="col-sep">:</td>
                  <td className="col-val">{venue.tempat || 'Kementerian Sosial Gedung A Lantai 3 Dit. Jamsos'}</td>
                </tr>
              </tbody>
            </table>

            {venue.linkZoom && (
              <>
                <div className="doc-session-heading" style={{marginTop: 6}}>Dan</div>
                <div className="doc-session-heading" style={{marginTop: 2}}>Pada sesi :</div>
                <table className="doc-entry-table" style={{margin: '2px 0 8px 18px'}}>
                  <tbody>
                    <tr>
                      <td className="col-label">Hari</td>
                      <td className="col-sep">:</td>
                      <td className="col-val">{venue.hari || 'Senin'}</td>
                    </tr>
                    <tr>
                      <td className="col-label">Tanggal</td>
                      <td className="col-sep">:</td>
                      <td className="col-val">{venue.tanggal || '26 Oktober 2026'}</td>
                    </tr>
                    <tr>
                      <td className="col-label">Jam</td>
                      <td className="col-sep">:</td>
                      <td className="col-val">{venue.jam || '10.00 WIB'}</td>
                    </tr>
                    <tr>
                      <td className="col-label">Link zoom</td>
                      <td className="col-sep">:</td>
                      <td className="col-val" style={{wordBreak: 'break-all'}}>{venue.linkZoom}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </div>

          <p className="doc-body-paragraph">
            {customAgenda || template.agendaDefault}
          </p>

          <p className="doc-body-paragraph" style={{marginTop: 10}}>
            Demikian untuk dilaksanakan.
          </p>
        </div>
      )}

      {/* 5. TITIMANGSA & BLOK TANDA TANGAN */}
      {isBeritaAcara ? (
        <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 30, pageBreakInside: 'avoid'}}>
          <div style={{width: 220}}>
            <div>Yang Diperiksa,</div>
            <div style={{height: 60}} />
            <div style={{fontWeight: 'bold', textDecoration: 'underline'}}>{recipient.nama}</div>
            <div>NIP. {recipient.nip}</div>
          </div>
          <div style={{width: 260}}>
            <div>{official.kota || 'Jakarta'}, {letterDate}</div>
            <div>Pemeriksa,</div>
            <div style={{height: 60}} />
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
