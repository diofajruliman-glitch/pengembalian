import React from 'react'
import kopImage from '../assets/kop-kemensos.png'

export default function KemensosHeader({customKopUrl = null}) {
  const imgSrc = customKopUrl || kopImage || '/kop-kemensos.png'

  return (
    <header className="kemensos-header-wrap" role="banner" aria-label="Kop Surat Resmi Kementerian Sosial Republik Indonesia - Direktorat Jenderal Perlindungan dan Jaminan Sosial - Direktorat Perlindungan Sosial Non Kebencanaan">
      <img
        src={imgSrc}
        alt="KEMENTERIAN SOSIAL REPUBLIK INDONESIA - DIREKTORAT JENDERAL PERLINDUNGAN DAN JAMINAN SOSIAL - DIREKTORAT PERLINDUNGAN SOSIAL NON KEBENCANAAN - Jl. Salemba Raya No. 28 Jakarta Pusat Tlp (021)22804288 http://kemensos.go.id/"
        className="kemensos-official-header-img"
        loading="eager"
      />
    </header>
  )
}
