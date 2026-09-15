import { StatusCard } from '../components/StatusCard'
import { useAuth } from '../hooks/useAuth'
import { supabaseConfigurationError } from '../lib/supabase'

export function HomePage() {
  const { user, loading, error } = useAuth()
  const authLabel = loading ? 'Carregando' : user ? 'Autenticado' : 'Sem sessão'

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="brand"><span className="brand-mark" aria-hidden="true">F</span> Finanças</div>
        <span className="version">BASE DO PROJETO · 0.1</span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Controle financeiro pessoal</p>
        <h1 id="page-title">Uma base para organizar<br />sua vida financeira.</h1>
        <p className="intro-description">
          Estrutura inicial do aplicativo. A integração com Supabase e a camada de
          autenticação estão preparadas para as próximas funcionalidades.
        </p>
      </section>

      <div className="status-grid">
        <StatusCard title="Aplicação" label="Pronta">
          <p>React, TypeScript e Vite configurados. Código organizado por componentes, funcionalidades e serviços.</p>
        </StatusCard>
        <StatusCard
          title="Supabase"
          label={supabaseConfigurationError ? 'Configuração pendente' : 'Client configurado'}
          tone={supabaseConfigurationError ? 'pending' : 'ready'}
        >
          {supabaseConfigurationError ? (
            <p>{supabaseConfigurationError} Reinicie o servidor após configurar.</p>
          ) : (
            <p>Client inicializado com as variáveis de ambiente. A disponibilidade do banco depende das migrations aplicadas.</p>
          )}
        </StatusCard>
        <StatusCard title="Autenticação" label={authLabel} tone={user ? 'ready' : 'pending'}>
          <div aria-live="polite">
            {error ? <p role="alert">{error}</p> : (
              <p>{user ? `Sessão ativa: ${user.email ?? user.id}.` : 'Serviços de cadastro, entrada e saída preparados. A interface de acesso será implementada na próxima etapa.'}</p>
            )}
          </div>
        </StatusCard>
      </div>

      <footer className="page-footer">
        <span>Etapa 01 · Estrutura e banco de dados</span>
        <span>React / TypeScript / Supabase</span>
      </footer>
    </main>
  )
}
