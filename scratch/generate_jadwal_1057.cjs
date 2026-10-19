const fs = require('fs');
const readXlsxFile = require('read-excel-file/node');
const path = 'C:/Users/USER/.gemini/antigravity/brain/9de7498d-1a39-4a49-ba4e-2f4205b3bd7d/.user_uploaded/media_1792397436033_1a9e628e.xlsx';

function formatIndoDateStr(dateVal) {
  if (!dateVal) return '';
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const day = d.getUTCDate();
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return day + ' ' + months[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

function formatIndoTimeStr(startVal, endVal) {
  function toTimeStr(val) {
    if (!val) return '';
    if (val instanceof Date) {
      const h = String(val.getUTCHours()).padStart(2, '0');
      const m = String(val.getUTCMinutes()).padStart(2, '0');
      return h + '.' + m;
    }
    return String(val).replace(':', '.').slice(0, 5);
  }
  const s = toTimeStr(startVal);
  const e = toTimeStr(endVal);
  if (s && e) return s + '–' + e + ' WIB';
  if (s) return s + ' WIB';
  return '';
}

async function run() {
  const rows = await readXlsxFile(path, { sheet: 'Jadwal Wawancara' });
  const dataRows = rows.slice(5);
  const items = dataRows.map(r => {
    const nip = String(r[9] || '').trim();
    const tgl = formatIndoDateStr(r[2]);
    const jam = formatIndoTimeStr(r[4], r[5]);
    const mulai = r[4] instanceof Date ? r[4].toISOString().slice(11, 16) : String(r[4] || '');
    const selesai = r[5] instanceof Date ? r[5].toISOString().slice(11, 16) : String(r[5] || '');
    return {
      no: Number(r[0]),
      hari: String(r[1] || '').trim(),
      tanggal: tgl,
      sesi: String(r[3] || '').trim(),
      jam,
      mulai,
      selesai,
      room: String(r[6] || '').trim(),
      petugas: String(r[7] || '').trim(),
      nama: String(r[8] || '').trim(),
      nip,
      provinsi: String(r[10] || '').trim(),
      kabKota: String(r[11] || '').trim(),
      linkZoom: String(r[20] || '').trim()
    };
  });

  const content = `// Data Master Jadwal Pemanggilan & Wawancara 1.057 ASN (26–29 Oktober 2026)
// Sumber: Jadwal_Wawancara_1057_Revisi_Sesi_PSNK_26-29_Oktober_2026.xlsx

export const JADWAL_WAWANCARA_1057_REVISI = ${JSON.stringify(items, null, 2)}

const cleanNipKey = (val) => String(val || '').replace(/\\D/g, '').trim()

export const JADWAL_WAWANCARA_BY_NIP = new Map()
export const JADWAL_WAWANCARA_BY_NAME = new Map()

JADWAL_WAWANCARA_1057_REVISI.forEach(item => {
  const cleaned = cleanNipKey(item.nip)
  if (cleaned) {
    JADWAL_WAWANCARA_BY_NIP.set(cleaned, item)
    const unpadded = cleaned.replace(/^0+/, '')
    if (unpadded && unpadded !== cleaned) {
      JADWAL_WAWANCARA_BY_NIP.set(unpadded, item)
    }
  }
  if (item.nama) {
    JADWAL_WAWANCARA_BY_NAME.set(item.nama.trim().toLowerCase(), item)
  }
})

export function lookupJadwalWawancara1057(nipOrNik, nama = '') {
  if (nipOrNik) {
    const key = cleanNipKey(nipOrNik)
    if (JADWAL_WAWANCARA_BY_NIP.has(key)) {
      return JADWAL_WAWANCARA_BY_NIP.get(key)
    }
    const unpadded = key.replace(/^0+/, '')
    if (unpadded && JADWAL_WAWANCARA_BY_NIP.has(unpadded)) {
      return JADWAL_WAWANCARA_BY_NIP.get(unpadded)
    }
  }
  if (nama) {
    const cleanName = nama.trim().toLowerCase()
    if (JADWAL_WAWANCARA_BY_NAME.has(cleanName)) {
      return JADWAL_WAWANCARA_BY_NAME.get(cleanName)
    }
  }
  return null
}
`

  fs.writeFileSync('src/letters/jadwalWawancara1057Data.js', content, 'utf8');
  console.log('Successfully wrote src/letters/jadwalWawancara1057Data.js with', items.length, 'records');
}

run().catch(console.error);
