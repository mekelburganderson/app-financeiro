import type { LucideIcon } from 'lucide-react'

interface PlaceholderPageProps { title: string; description: string; icon: LucideIcon }

export function PlaceholderPage({ title, description, icon: Icon }: PlaceholderPageProps) {
  return (
    <div className="placeholder-page">
      <div className="page-heading"><div><p className="eyebrow">SEU ESPAÇO FINANCEIRO</p><h1>{title}</h1><p>{description}</p></div></div>
      <section className="placeholder-panel" aria-label={`Área de ${title}`}>
        <span className="placeholder-icon"><Icon size={28} strokeWidth={1.7} aria-hidden="true" /></span>
        <h2>Em breve por aqui</h2>
        <p>Esta área está pronta para receber as funcionalidades de {title.toLowerCase()}.</p>
      </section>
    </div>
  )
}
