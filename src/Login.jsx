import React, {useState} from 'react'
import {ArrowRight, CalendarDays, Check, Eye, EyeOff, FileCheck2, LockKeyhole, Mail, Pause, Play, ShieldCheck, Users, LoaderCircle} from 'lucide-react'
import './login.css'

const dataRoutes = [
  'M131 66H161Q179 66 179 84V99Q179 115 195 115H230',
  'M343 111H299Q284 111 274 115H230',
  'M119 208V188Q119 174 135 174H197Q215 174 215 156V131Q215 115 230 115'
]
const mobileDataRoutes = [
  'M134 30H146Q160 30 160 46V100',
  'M209 30H189Q174 30 174 46V86Q174 100 160 100',
  'M160 176V100'
]

export default function Login({onSignIn, onReset, loginError, resetMessage, busy}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [animationPaused, setAnimationPaused] = useState(false)

  return <main className={`login-screen${animationPaused ? ' login-motion-paused' : ''}`}>
    <div className="login-shell">
      <section className="login-aside" aria-labelledby="login-intro-title">
        <div className="login-glow" aria-hidden="true"/>
        <div className="login-glow login-glow-secondary" aria-hidden="true"/>
        <div className="login-particles" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
        <div className="login-brand">
          <span className="login-brand-mark"><ShieldCheck size={25} aria-hidden="true"/><span className="login-brand-scan" aria-hidden="true"/><span className="login-mobile-flow" aria-hidden="true"><i/><i/><i/></span></span>
          <div className="login-brand-copy"><strong>Pokja SD Tim TLHP <span>— Monitoring Tindak Lanjut</span></strong><span className="login-brand-subtitle">DIREKTORAT PSNK</span></div>
          <button type="button" className="login-motion-toggle" aria-label={animationPaused ? 'Lanjutkan animasi' : 'Jeda animasi'} title={animationPaused ? 'Lanjutkan animasi' : 'Jeda animasi'} onClick={() => setAnimationPaused(value => !value)}>{animationPaused ? <Play size={15} aria-hidden="true"/> : <Pause size={15} aria-hidden="true"/>}</button>
        </div>

        <div className="login-intro">
          <span className="login-kicker"><span/> MONITORING TINDAK LANJUT</span>
          <h1 id="login-intro-title">Progres terpantau.<br/><em>Tindak lanjut{' '}<br/>lebih terarah.</em></h1>
          <p>Satu ruang untuk memantau pengembalian, validasi data, dan tindak lanjut permasalahan SDM, dari pemeriksaan hingga penyelesaian.</p>
        </div>

        <div className="login-illustration" aria-hidden="true">
          <svg className="login-data-flow login-data-flow-desktop" viewBox="0 0 460 230" preserveAspectRatio="none" fill="none" focusable="false">
            <g className="login-data-track">{dataRoutes.map(route => <path key={route} d={route} vectorEffect="non-scaling-stroke"/>)}</g>
            <g className="login-data-stream">{dataRoutes.map(route => <path key={route} d={route} pathLength="100" vectorEffect="non-scaling-stroke"/>)}</g>
          </svg>
          <svg className="login-data-flow login-data-flow-mobile" viewBox="0 0 320 200" preserveAspectRatio="none" fill="none" focusable="false">
            <g className="login-data-track">{mobileDataRoutes.map(route => <path key={route} d={route} vectorEffect="non-scaling-stroke"/>)}</g>
            <g className="login-data-stream">{mobileDataRoutes.map(route => <path key={route} d={route} pathLength="100" vectorEffect="non-scaling-stroke"/>)}</g>
          </svg>
          <div className="login-orbit login-orbit-outer"/>
          <div className="login-orbit login-orbit-inner"/>
          <div className="login-shield"><ShieldCheck size={47} strokeWidth={1.4}/><span className="login-shield-scan"/><span className="login-shield-check"><Check size={12} strokeWidth={3}/></span></div>
          <div className="login-float login-float-monitor"><span className="login-float-icon"><Users size={18}/></span><div><small>TERINTEGRASI</small><strong>Monitoring SDM</strong></div></div>
          <div className="login-float login-float-recap"><span className="login-float-icon"><FileCheck2 size={18}/></span><div><small>TERSTRUKTUR</small><strong>Rekonsiliasi</strong></div></div>
          <div className="login-float login-float-action"><span className="login-float-icon"><Check size={16}/></span><strong>Tindak lanjut</strong><span className="login-mini-dots"><i/><i/><i/></span></div>
        </div>

        <div className="login-deadline"><span><CalendarDays size={18} aria-hidden="true"/></span><div><small>TARGET PENYELESAIAN</small><strong>31 Desember 2026</strong></div><span className="login-deadline-line"/></div>
      </section>

      <section className="login-main" aria-labelledby="login-form-title">
        <div className="login-access-label"><span/> PORTAL INTERNAL</div>
        <div className="login-form-content">
          <div className="login-welcome-icon"><LockKeyhole size={25} strokeWidth={1.7} aria-hidden="true"/></div>
          <span className="login-form-kicker">SELAMAT DATANG KEMBALI</span>
          <h2 id="login-form-title">Masuk ke akun Anda</h2>
          <p className="login-description">Lanjutkan pemantauan dan tindak lanjut melalui akun yang diberikan administrator.</p>

          <form className="login-form" aria-busy={busy} onSubmit={event => {
            event.preventDefault()
            if (!busy) onSignIn(email.trim(), password)
          }}>
            <div className="login-field">
              <label htmlFor="login-email">Alamat email</label>
              <div className="login-input-wrap">
                <Mail size={18} aria-hidden="true"/>
                <input id="login-email" name="email" autoComplete="username" type="email" value={email} required onChange={event => setEmail(event.target.value)} placeholder="nama@kemensos.go.id" disabled={busy}/>
                <span className="login-input-signal" aria-hidden="true"/>
              </div>
            </div>

            <div className="login-field">
              <div className="login-field-heading"><label htmlFor="login-password">Kata sandi</label><button type="button" className="login-forgot" disabled={busy} onClick={() => onReset(email.trim())}>Lupa kata sandi?</button></div>
              <div className="login-input-wrap">
                <LockKeyhole size={18} aria-hidden="true"/>
                <input id="login-password" name="password" autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} required onChange={event => setPassword(event.target.value)} placeholder="Masukkan kata sandi" disabled={busy}/>
                <button type="button" className="login-password-toggle" aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} aria-pressed={showPassword} aria-controls="login-password" disabled={busy} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} aria-hidden="true"/> : <Eye size={18} aria-hidden="true"/>}</button>
                <span className="login-input-signal" aria-hidden="true"/>
              </div>
            </div>

            {loginError && <div className="login-message login-message-error" role="alert">{loginError}</div>}
            {resetMessage && <div className="login-message login-message-success" role="status">{resetMessage}</div>}

            <button type="submit" disabled={busy} className="login-submit">
              {busy ? <><LoaderCircle className="spin" size={19} aria-hidden="true"/><span>Memverifikasi akses...</span></> : <><span>Masuk aplikasi</span><ArrowRight size={19} aria-hidden="true"/></>}
            </button>
          </form>

          <div className="login-account-help">Belum memiliki akses? <span>Hubungi administrator.</span></div>
          <div className="login-security"><ShieldCheck size={20} aria-hidden="true"/><div><strong>Akses sesuai peran Anda</strong><p>Akun hanya untuk petugas berwenang. Jaga kerahasiaan akun dan data internal.</p></div></div>
        </div>
        <div className="login-form-footer">DIT. PERLINDUNGAN SOSIAL NON KEBENCANAAN</div>
      </section>
    </div>
    <p className="login-page-footer">Pokja SD Tim TLHP — Monitoring Tindak Lanjut <span>·</span> Ruang kerja internal Direktorat PSNK</p>
  </main>
}
