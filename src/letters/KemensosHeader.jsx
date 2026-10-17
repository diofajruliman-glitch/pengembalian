import React from 'react'
import kopImage from '../assets/kop-kemensos.png'

export default function KemensosHeader({customKopUrl = null}) {
  const imgSrc = customKopUrl || kopImage || '/kop-kemensos.png'

  return (
    <header className="kemensos-header-wrap" role="banner" aria-label="Kop Surat Resmi Kementerian Sosial Republik Indonesia">
      <img
        src={imgSrc}
        alt="KEMENTERIAN SOSIAL REPUBLIK INDONESIA - DIREKTORAT JENDERAL PERLINDUNGAN DAN JAMINAN SOSIAL - Jl. Salemba Raya No. 28 Jakarta Pusat 10430 Telp. (021) 3103591 http://www.kemsos.go.id"
        className="kemensos-official-header-img"
        loading="eager"
      />
    </header>
  )
}
