import type { ReactNode } from 'react'

export function Stat({ label, value, sub, title }: { label: string; value: ReactNode; sub?: ReactNode; title?: string }) {
  return (
    <div className="rounded-[7px] border border-line bg-surface-2 px-3 py-2" title={title}>
      <div className="text-[10.5px] text-muted uppercase tracking-[0.04em]">{label}</div>
      <div className="mono text-[17px] mt-0.5">{value}</div>
      {sub && <div className="mono text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  )
}
