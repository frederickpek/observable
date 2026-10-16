import { useMemo } from 'react'
import { zColor } from '../lib/color'
import { contracts } from '../lib/data'
import { expLabel } from '../lib/format'
import type { Contract, Slice } from '../lib/types'
import { ContractTip } from './SmileChart'
import { useTooltip } from './Tooltip'

// Columns in call-equivalent delta (puts mapped via 1 + Δput), left = OTM puts, right = OTM calls.
const COLS = [
  { d: 0.9, label: '10P' }, { d: 0.85, label: '15P' }, { d: 0.8, label: '20P' }, { d: 0.75, label: '25P' },
  { d: 0.7, label: '30P' }, { d: 0.6, label: '40P' }, { d: 0.5, label: 'ATM' }, { d: 0.4, label: '40C' },
  { d: 0.3, label: '30C' }, { d: 0.25, label: '25C' }, { d: 0.2, label: '20C' }, { d: 0.15, label: '15C' },
  { d: 0.1, label: '10C' },
]
const TOL = 0.035

export function ResidualHeatmap({ slices, selected, onSelect }: {
  slices: Slice[]; selected: string; onSelect: (exp: string) => void
}) {
  const { wrapRef, show, hide, node } = useTooltip()
  const rows = useMemo(
    () =>
      slices.map((s) => {
        const cs = contracts(s).filter((c) => c.delta != null && c.z != null)
        const cells = COLS.map(({ d }) => {
          let best: Contract | null = null
          let bestD = TOL
          for (const c of cs) {
            const cd = c.cp === 'C' ? c.delta! : 1 + c.delta!
            const dist = Math.abs(cd - d)
            if (dist <= bestD) {
              bestD = dist
              best = c
            }
          }
          return best
        })
        return { s, cells }
      }),
    [slices],
  )

  return (
    // The tooltip lives on the outer, non-scrolling wrapper; only the grid scrolls on narrow screens.
    // Otherwise a tooltip near the edge enlarges the scroll box and a scrollbar appears on hover.
    <div ref={wrapRef} className="relative">
      <div className="overflow-x-auto">
      <div className="grid gap-[2px] min-w-[560px]" style={{ gridTemplateColumns: `112px repeat(${COLS.length}, minmax(30px, 1fr))` }}>
        <div />
        {COLS.map((c) => (
          <div key={c.label} className="mono text-[10.5px] text-muted text-center pb-1">{c.label}</div>
        ))}
        {rows.map(({ s, cells }) => {
          const active = s.exp === selected
          return (
            <div key={s.exp} className="contents">
              <button
                onClick={() => onSelect(s.exp)}
                className={`mono text-[11px] text-left pr-2 truncate ${active ? 'text-accent font-semibold' : 'text-muted hover:text-ink'}`}
                aria-pressed={active}
              >
                {expLabel(s.exp, s.dte)}
              </button>
              {cells.map((c, i) => (
                <div
                  key={i}
                  onClick={() => onSelect(s.exp)}
                  onPointerMove={(e) => (c ? show(e.clientX, e.clientY, <ContractTip c={c} />) : hide())}
                  onPointerLeave={hide}
                  className="h-[18px] rounded-[3px] cursor-pointer"
                  style={{
                    background: c ? zColor(c.z, c.conf) : 'transparent',
                    border: c ? undefined : '1px dashed var(--line)',
                    opacity: c && c.conf != null && c.conf > 0 ? 0.35 + 0.65 * Math.min(1, c.conf * 1.6) : 1,
                    outline: active ? '1px solid var(--accent)' : undefined,
                  }}
                />
              ))}
            </div>
          )
        })}
      </div>
      </div>
      <div className="flex items-center gap-3 mt-3 text-xs text-muted flex-wrap">
        <span>cheap</span>
        <div className="flex h-2 w-40 rounded overflow-hidden">
          {[-4, -3, -2, -1.5, 0, 1.5, 2, 3, 4].map((z) => (
            <div key={z} className="flex-1" style={{ background: zColor(z) }} />
          ))}
        </div>
        <span>rich</span>
        <span className="ml-2">colour = z-score vs fit · opacity = confidence · dashed = no quote near that delta</span>
      </div>
      {node}
    </div>
  )
}
