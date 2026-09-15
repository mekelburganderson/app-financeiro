import type { PropsWithChildren } from 'react'

interface StatusCardProps extends PropsWithChildren {
  title: string
  label: string
  tone?: 'ready' | 'pending'
}

export function StatusCard({ title, label, tone = 'ready', children }: StatusCardProps) {
  return (
    <section className="status-card">
      <div className="card-heading">
        <h2>{title}</h2>
        <span className={`badge badge-${tone}`}>{label}</span>
      </div>
      {children}
    </section>
  )
}
