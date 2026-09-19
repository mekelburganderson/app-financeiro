import { useState } from 'react'
import { ArrowRight, ShieldCheck, Wallet } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { signInWithGoogle } from '../services/auth'
import { supabaseConfigurationError } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const location = useLocation()
  const { error: sessionError } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [loginError, setLoginError] = useState(false)
  const callbackError = new URLSearchParams(window.location.hash.slice(1)).has('error') ||
    new URLSearchParams(window.location.search).has('error')

  async function handleLogin() {
    if (submitting || supabaseConfigurationError) return
    setLoginError(false)
    setSubmitting(true)
    try {
      const state = location.state as { from?: unknown } | null
      const returnPath = typeof state?.from === 'string' ? state.from : '/'
      const { url } = await signInWithGoogle(returnPath)
      if (!url) { setLoginError(true); setSubmitting(false) }
      // Supabase redirects the browser when url is provided.
    } catch {
      setLoginError(true)
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <div className="login-story">
          <div className="login-brand"><span className="brand-icon"><Wallet size={24} /></span><span>Finanças</span></div>
          <div className="login-story-copy">
            <p className="eyebrow">CONTROLE FINANCEIRO PESSOAL</p>
            <h1>Mais clareza para o seu dinheiro.</h1>
            <p>Organize suas despesas, receitas, contas e cartões em um só lugar.</p>
          </div>
          <div className="login-story-footer"><ShieldCheck size={18} aria-hidden="true" /> Seu acesso, no seu controle.</div>
        </div>
        <section className="login-card" aria-labelledby="login-title">
          <span className="login-card-icon"><Wallet size={25} /></span>
          <p className="eyebrow">BOAS-VINDAS</p>
          <h2 id="login-title">Entre na sua conta</h2>
          <p className="login-card-description">Use sua conta Google para acessar seu espaço financeiro.</p>
          {(loginError || callbackError || sessionError) && <p className="auth-alert" role="alert">Não foi possível realizar o login. Tente novamente.</p>}
          {supabaseConfigurationError && <p className="auth-alert" role="alert">Configure as variáveis Supabase no arquivo .env.local e reinicie o servidor.</p>}
          <button className="google-button" type="button" onClick={() => void handleLogin()}
            disabled={submitting || !!supabaseConfigurationError}>
            <span className="google-mark" aria-hidden="true">G</span>
            <span>{submitting ? 'Redirecionando…' : 'Entrar com Google'}</span>
            {submitting ? <span className="button-spinner" aria-hidden="true" /> : <ArrowRight size={19} aria-hidden="true" />}
          </button>
          <p className="login-note">Ao entrar, você será direcionado ao seu painel.</p>
        </section>
      </div>
    </main>
  )
}
