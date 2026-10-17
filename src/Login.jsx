import React, {useRef, useState} from 'react'
import {ArrowRight, CalendarDays, Eye, EyeOff, Fingerprint, LoaderCircle, LockKeyhole, Mail, ShieldCheck} from 'lucide-react'
import {BinaryBackdrop, HologramScene} from './LoginEffects'
import './login.css'

export default function Login({onSignIn, onReset, loginError, resetMessage, busy}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const pageRef = useRef(null)
  const shellRef = useRef(null)

  return <main className="login-screen" ref={pageRef}>
    <div className="login-shell" ref={shellRef}>
      <BinaryBackdrop containerRef={shellRef}/>
      <header className="login-header">
        <div className="login-brand">
          <span className="login-brand-mark"><ShieldCheck size={24} strokeWidth={1.6} aria-hidden="true"/></span>
          <div><strong>Pokja SD Tim TLHP</strong><span>DIREKTORAT PSNK</span></div>
        </div>
        <span className="login-header-note"><i aria-hidden="true"/>MONITORING TINDAK LANJUT</span>
      </header>

      <div className="login-layout">
        <section className="login-aside" aria-labelledby="login-intro-title">
          <div className="login-intro">
            <span className="login-kicker"><i aria-hidden="true"/> MONITORING TINDAK LANJUT</span>
            <h1 id="login-intro-title">Progres terpantau.<br/><em>Tindak lanjut{' '}<br/>lebih terarah.</em></h1>
            <p>Satu ruang untuk memantau pengembalian, validasi data, dan tindak lanjut permasalahan SDM, dari pemeriksaan hingga penyelesaian.</p>
          </div>

          <HologramScene pageRef={pageRef}/>
          <p className="login-flow-status"><i aria-hidden="true"/>DATA TERHUBUNG · TINDAK LANJUT TERARAH</p>
          <div className="login-deadline"><CalendarDays size={17} aria-hidden="true"/><span>Target penyelesaian <strong>31 Desember 2026</strong></span></div>
        </section>

        <section className="login-main" aria-labelledby="login-form-title">
          <div className="login-access-label"><i aria-hidden="true"/> PORTAL INTERNAL</div>
          <div className="login-welcome-icon" aria-hidden="true"><Fingerprint size={27} strokeWidth={1.4}/></div>
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
              {busy ? <><LoaderCircle className="login-spinner" size={19} aria-hidden="true"/><span>Memverifikasi akses...</span></> : <><span>Masuk aplikasi</span><ArrowRight size={19} aria-hidden="true"/></>}
            </button>
          </form>

          <div className="login-account-help">Belum memiliki akses? <span>Hubungi administrator.</span></div>
          <div className="login-security"><ShieldCheck size={20} aria-hidden="true"/><div><strong>Akses sesuai peran Anda</strong><p>Akun hanya untuk petugas berwenang. Jaga kerahasiaan akun dan data internal.</p></div></div>
          <div className="login-form-footer">DIT. PERLINDUNGAN SOSIAL NON KEBENCANAAN</div>
        </section>
      </div>
      <footer className="login-page-footer"><span>Pokja SD Tim TLHP · Monitoring Tindak Lanjut</span><span>DIREKTORAT PSNK</span></footer>
    </div>
  </main>
}
