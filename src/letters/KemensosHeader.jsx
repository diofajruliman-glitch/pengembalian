import React from 'react'

export function KemensosLogo({size = 72, className = ''}) {
  return (
    <svg
      width={size * 1.3}
      height={size}
      viewBox="0 0 130 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Logo Kementerian Sosial Republik Indonesia"
      role="img"
    >
      {/* Bagian Bawah: Telapak Tangan Emas / Kuning Menopang */}
      <path
        d="M6 56 C 18 88, 52 98, 92 84 C 64 94, 28 88, 14 65 Z"
        fill="#E8A900"
      />
      <path
        d="M10 63 C 24 90, 60 97, 104 76 C 72 88, 34 84, 18 69 Z"
        fill="#F5B800"
      />
      <path
        d="M16 68 C 32 91, 70 94, 115 67 C 80 81, 42 79, 24 71 Z"
        fill="#FFC72C"
      />
      <path
        d="M22 72 C 40 92, 80 90, 122 58 C 86 73, 50 74, 30 73 Z"
        fill="#FFD147"
      />

      {/* Bagian Tengah: Sayap / Daun Hijau Bertingkat */}
      <path
        d="M25 45 L 85 4 Z M 25 45 C 45 32, 70 20, 95 12 C 72 26, 50 38, 30 48 Z"
        fill="#009A44"
      />
      <path
        d="M28 49 C 50 38, 76 28, 104 20 C 78 33, 54 44, 34 52 Z"
        fill="#00B04F"
      />
      <path
        d="M32 53 C 54 44, 80 36, 110 30 C 82 41, 58 50, 38 56 Z"
        fill="#10C05D"
      />

      {/* Bagian Kiri Atas: Sosok Manusia Biru */}
      <circle cx="28" cy="18" r="9" fill="#1565C0" />
      <path
        d="M16 38 C 16 28, 22 25, 30 25 C 38 25, 43 28, 42 38 C 36 34, 24 34, 16 38 Z"
        fill="#1565C0"
      />
      <path
        d="M19 36 C 24 35, 34 35, 39 37 C 35 55, 26 58, 22 55 C 20 48, 19 42, 19 36 Z"
        fill="#0D47A1"
      />
    </svg>
  )
}

export default function KemensosHeader({
  unitEselon1 = 'DIREKTORAT JENDERAL PERLINDUNGAN DAN JAMINAN SOSIAL',
  unitEselon2 = '',
  address = 'Jl. Salemba Raya No. 28 Jakarta Pusat 10430 Telp. (021) 3103591 http://www.kemsos.go.id'
}) {
  return (
    <div className="kemensos-header">
      <div className="kemensos-header-content">
        <div className="kemensos-header-logo">
          <KemensosLogo size={74} />
        </div>
        <div className="kemensos-header-text">
          <h1 className="kemensos-title-main">KEMENTERIAN SOSIAL REPUBLIK INDONESIA</h1>
          <h2 className="kemensos-title-sub">{unitEselon1}</h2>
          {unitEselon2 && <h3 className="kemensos-title-sub2">{unitEselon2}</h3>}
          <p className="kemensos-header-address">
            {address.includes('http://www.kemsos.go.id') ? (
              <>
                {address.replace('http://www.kemsos.go.id', '')}
                <span className="kemensos-link">http://www.kemsos.go.id</span>
              </>
            ) : (
              address
            )}
          </p>
        </div>
      </div>
      <div className="kemensos-header-separator" aria-hidden="true">
        <div className="kemensos-sep-thick" />
        <div className="kemensos-sep-thin" />
      </div>
    </div>
  )
}
