import { useMemo } from 'react'
import { contracts, sviVol } from '../lib/data'
import { expLabel, num, pct } from '../lib/format'
import type { Contract, Slice } from '../lib/types'
import { useTooltip } from './Tooltip'

// Columns in call-equivalent delta (puts mapped via 1 + Δput), left = OTM puts, right = OTM calls.
const COLS = [
  { d: 0.9, label: '10P' }, { d: 0.85, label: '15P' }, { d: 0.8, label: '20P' }, { d: 0.75, label: '25P' },
  { d: 0.7, label: '30P' }, { d: 0.6, label: '40P' }, { d: 0.5, label: 'ATM' }, { d: 0.4, label: '40C' },
  { d: 0.3, label: '30C' }, { d: 0.25, label: '25C' }, { d: 0.2, label: '20C' }, { d: 0.15, label: '15C' },
  { d: 0.1, label: '10C' },
]
// A quoted contract within this delta of the bucket is shown alongside the fitted vol.
const TOL = 0.035
const STEPS = 7

interface Cell {
  iv: number
  k: number
  strike: number
  contract: Contract | null
}

/** Normal CDF via the Abramowitz–Stegun erf approximation (error < 1.5e-7). */
function ndtr(x: number) {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2))
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) *
    Math.exp(-(x * x) / 2)
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

/** Fitted vol at a target forward call delta, searched over the strike range the fit actually saw. */
function fitAtDelta(s: Slice, target: number): { iv: number; k: number } | null {
  const [lo, hi] = s.kFit
  let best: { iv: number; k: number; err: number } | null = null
  for (let i = 0; i <= 400; i++) {
    const k = lo + ((hi - lo) * i) / 400
    const iv = sviVol(s.svi, k, s.T)
    const sd = iv * Math.sqrt(s.T)
    const err = Math.abs(ndtr(-k / sd + 0.5 * sd) - target)
    if (!best || err < best.err) best = { iv, k, err }
  }
  return best && best.err < 0.02 ? best : null
}

export function VolSurface({ slices, selected, onSelect }: {
  slices: Slice[]; selected: string; onSelect: (exp: string) => void
}) {
  const { wrapRef, show, hide, node } = useTooltip()

  const { rows, lo, hi } = useMemo(() => {
    const rows = slices.map((s) => {
      const quoted = contracts(s).filter((c) => c.delta != null && c.z != null)
      const cells: (Cell | null)[] = COLS.map(({ d }) => {
        const fit = fitAtDelta(s, d)
        if (!fit) return null
        let contract: Contract | null = null
        let bestD = TOL
        for (const c of quoted) {
          const dist = Math.abs((c.cp === 'C' ? c.delta! : 1 + c.delta!) - d)
          if (dist <= bestD) {
            bestD = dist
            contract = c
          }
        }
        return { iv: fit.iv, k: fit.k, strike: s.F * Math.exp(fit.k), contract }
      })
      return { s, cells }
    })
    // Per-ticker scale on the 5th–95th percentile, so one extreme wing cell can't wash out the rest.
    const all = rows.flatMap((r) => r.cells.filter((c): c is Cell => c != null).map((c) => c.iv)).sort((a, b) => a - b)
    const q = (p: number) => all[Math.min(all.length - 1, Math.max(0, Math.round(p * (all.length - 1))))]
    return { rows, lo: q(0.05), hi: q(0.95) }
  }, [slices])

  const shade = (iv: number) => {
    const t = Math.min(1, Math.max(0, (iv - lo) / Math.max(hi - lo, 1e-6)))
    return `color-mix(in oklab, var(--seq-hi) ${Math.round(t * 100)}%, var(--seq-lo))`
  }

  return (
    // The tooltip lives on the outer, non-scrolling wrapper; only the grid scrolls on narrow screens.
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
                    onPointerMove={(e) => (c ? show(e.clientX, e.clientY, <CellTip s={s} col={COLS[i].label} c={c} />) : hide())}
                    onPointerLeave={hide}
                    className="relative h-[18px] rounded-[3px] cursor-pointer"
                    style={{
                      background: c ? shade(c.iv) : 'transparent',
                      border: c ? undefined : '1px dashed var(--line)',
                      outline: active ? '1px solid var(--accent)' : undefined,
                    }}
                  >
                    {c?.contract?.conf != null && c.contract.conf >= 0.5 && (
                      <span className="surface-flag" style={{ background: c.contract.z! > 0 ? 'var(--rich)' : 'var(--cheap)' }} />
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3 text-xs text-muted flex-wrap">
        <span className="mono">{pct(lo)}</span>
        <div className="flex h-2 w-40 rounded overflow-hidden">
          {Array.from({ length: STEPS }, (_, i) => (
            <div key={i} className="flex-1" style={{ background: shade(lo + ((hi - lo) * i) / (STEPS - 1)) }} />
          ))}
        </div>
        <span className="mono">{pct(hi)}</span>
        <span className="ml-2">implied vol, this ticker's range</span>
        <span className="ml-2">dashed = outside the quoted strikes</span>
      </div>
      {node}
    </div>
  )
}

function CellTip({ s, col, c }: { s: Slice; col: string; c: Cell }) {
  const q = c.contract
  return (
    <div>
      <div style={{ fontWeight: 600 }}>{col} · {expLabel(s.exp, s.dte)}</div>
      <div>fitted IV {pct(c.iv, 2)}</div>
      <div>strike   ≈ {num(c.strike, 2)} ({c.k >= 0 ? '+' : ''}{(c.k * 100).toFixed(1)}% vs fwd)</div>
      {q ? (
        <>
          <div>nearest  {q.K} {q.cp === 'C' ? 'call' : 'put'}: mid IV {pct(q.ivMid, 2)}</div>
          <div>signal   {q.z == null || Math.abs(q.z) <= 1 ? 'inside spread' : q.z > 0 ? `rich (z ${num(q.z, 1)})` : `cheap (z ${num(q.z, 1)})`}
            {q.conf ? ` · conf ${Math.round(q.conf * 100)}%` : ''}</div>
        </>
      ) : (
        <div>no quoted contract near this delta</div>
      )}
    </div>
  )
}
