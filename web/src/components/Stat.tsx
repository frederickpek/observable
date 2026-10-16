import { useId, type ReactNode } from 'react'

export interface StatHelp {
  what: ReactNode
  read: ReactNode
}

export function Stat({ label, value, sub, help, align = 'center' }: {
  label: string
  value: ReactNode
  sub?: ReactNode
  help?: StatHelp
  /** Which way the popover opens; edge tiles anchor left/right so it stays on screen. */
  align?: 'left' | 'center' | 'right'
}) {
  const id = useId()
  return (
    <div
      className="stat group relative rounded-[7px] border border-line bg-surface-2 px-3 py-2"
      tabIndex={help ? 0 : undefined}
      aria-describedby={help ? id : undefined}
    >
      <div className="text-[10.5px] text-muted uppercase tracking-[0.04em] flex items-center gap-1">
        {label}
        {help && <span aria-hidden="true" className="stat-info">i</span>}
      </div>
      <div className="mono text-[17px] mt-0.5">{value}</div>
      {sub && <div className="mono text-[11px] text-muted mt-0.5">{sub}</div>}
      {help && (
        <div id={id} role="tooltip" className={`stat-pop stat-pop-${align}`}>
          <div className="stat-pop-h">What it is</div>
          <div>{help.what}</div>
          <div className="stat-pop-h mt-2">How to read it</div>
          <div>{help.read}</div>
        </div>
      )}
    </div>
  )
}
