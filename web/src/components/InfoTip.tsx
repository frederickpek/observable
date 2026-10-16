import { useId, type ReactNode } from 'react'

/** An ⓘ marker that reveals an explanatory popover on hover or keyboard focus. */
export function InfoTip({ label, children, align = 'left', width = 380 }: {
  label: string
  children: ReactNode
  align?: 'left' | 'center' | 'right'
  width?: number
}) {
  const id = useId()
  return (
    <span className="infotip relative inline-flex align-middle">
      <button type="button" className="stat-info" aria-label={`About ${label}`} aria-describedby={id}>i</button>
      <span id={id} role="tooltip" className={`stat-pop stat-pop-${align} normal-case`} style={{ width }}>
        {children}
      </span>
    </span>
  )
}
