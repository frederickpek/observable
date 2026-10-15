import { scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'
import { useMemo, useState } from 'react'
import { zColor } from '../lib/color'
import { contracts, sviVol } from '../lib/data'
import { int, money, num, pct, volPts } from '../lib/format'
import type { Contract, Slice } from '../lib/types'
import { svgPoint, useTooltip } from './Tooltip'

const W = 760
const H = 360
const M = { top: 26, right: 18, bottom: 40, left: 46 }

export function SmileChart({ slice, spot }: { slice: Slice; spot: number }) {
  const { wrapRef, show, hide, node } = useTooltip()
  const [hover, setHover] = useState<number | null>(null)

  const { pts, x, y, curve, r } = useMemo(() => {
    const all = contracts(slice).filter((c) => c.ivMid != null)
    // Show the fitted region plus a margin; far wings are mostly untradeable noise.
    const [k0, k1] = slice.kFit
    const pad = 0.2 * (k1 - k0)
    const pts = all.filter((c) => c.k >= k0 - pad && c.k <= k1 + pad)
    const kx = (c: Contract) => c.K
    const x = scaleLinear()
      .domain([Math.min(...pts.map(kx)), Math.max(...pts.map(kx))])
      .range([M.left, W - M.right])
      .nice()
    const grid = x.ticks(120).length > 1
      ? Array.from({ length: 200 }, (_, i) => x.domain()[0] + (i / 199) * (x.domain()[1] - x.domain()[0]))
      : []
    const fitPts = grid.map((K) => [K, sviVol(slice.svi, Math.log(K / slice.F), slice.T)] as const)
    const ys = [
      ...pts.flatMap((c) => [c.ivMid!, c.ivFit ?? c.ivMid!]),
      ...pts.filter((c) => c.z != null).flatMap((c) => [c.ivBid ?? c.ivMid!, c.ivAsk ?? c.ivMid!]),
    ]
    const lo = Math.min(...ys)
    const hi = Math.max(...ys)
    const y = scaleLinear()
      .domain([Math.max(0, lo - 0.08 * (hi - lo)), hi + 0.08 * (hi - lo)])
      .range([H - M.bottom, M.top])
      .nice()
    const curve = line<readonly [number, number]>()
      .x((d) => x(d[0]))
      .y((d) => y(Math.min(Math.max(d[1], y.domain()[0]), y.domain()[1])))(fitPts)
    // Dense chains (SPY has $1 strikes) need smaller dots so neighbours don't merge.
    const gap = (x.range()[1] - x.range()[0]) / Math.max(pts.length, 1)
    const r = Math.max(2, Math.min(4.25, gap * 0.42))
    return { pts, x, y, curve, r }
  }, [slice])

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const p = svgPoint(e, W, H)
    let best = -1
    let bestD = Infinity
    pts.forEach((c, i) => {
      const d = Math.abs(x(c.K) - p.x)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    if (best < 0 || bestD > 30) return leave()
    setHover(best)
    const c = pts[best]
    show(e.clientX, e.clientY, <ContractTip c={c} />)
  }
  const leave = () => {
    setHover(null)
    hide()
  }

  const h = hover != null ? pts[hover] : null
  return (
    <div ref={wrapRef} className="relative">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Implied volatility smile, ${slice.exp}`}>
        {y.ticks(5).map((t) => (
          <g key={t}>
            <line className="grid-line" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text className="tick" x={M.left - 8} y={y(t) + 3.5} textAnchor="end">{(t * 100).toFixed(0)}%</text>
          </g>
        ))}
        {x.ticks(8).map((t) => (
          <text key={t} className="tick" x={x(t)} y={H - M.bottom + 16} textAnchor="middle">{t}</text>
        ))}
        <line className="axis-line" x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} />
        <text className="axis-label" x={W - M.right} y={H - 6} textAnchor="end">Strike</text>
        <text className="axis-label" x={M.left} y={M.top - 12}>Implied vol</text>

        {/* forward & spot markers */}
        {[
          { v: slice.F, label: `F ${money(slice.F)}` },
          { v: spot, label: 'spot' },
        ].map(({ v, label }, i) =>
          v >= x.domain()[0] && v <= x.domain()[1] ? (
            <g key={label}>
              <line x1={x(v)} x2={x(v)} y1={M.top} y2={H - M.bottom} stroke="var(--ink-muted)" strokeDasharray={i ? '1 3' : '3 3'} />
              {i === 0 && <text className="tick" x={x(v) + 5} y={M.top + 8}>{label}</text>}
            </g>
          ) : null,
        )}

        {/* bid–ask IV bars */}
        {pts.map((c, i) =>
          c.ivBid != null || c.ivAsk != null ? (
            <line
              key={`b${i}`}
              x1={x(c.K)} x2={x(c.K)}
              y1={y(Math.max(c.ivBid ?? y.domain()[0], y.domain()[0]))}
              y2={y(Math.min(c.ivAsk ?? y.domain()[1], y.domain()[1]))}
              stroke="var(--ink-muted)" strokeWidth={2} strokeLinecap="round" opacity={c.z == null ? 0.25 : 0.45}
            />
          ) : null,
        )}

        <path d={curve ?? ''} fill="none" stroke="var(--accent)" strokeWidth={2.25} strokeLinejoin="round" />

        {pts.map((c, i) => {
          const fitted = c.z != null
          return (
            <circle
              key={`m${i}`}
              cx={x(c.K)} cy={y(c.ivMid!)} r={i === hover ? r + 2 : r}
              fill={fitted ? zColor(c.z, c.conf) : 'var(--surface)'}
              stroke={fitted ? 'var(--surface)' : 'var(--ink-muted)'}
              strokeWidth={fitted ? (r < 3.5 ? 0.75 : 2) : 1.25}
            />
          )
        })}

        {h && <line x1={x(h.K)} x2={x(h.K)} y1={M.top} y2={H - M.bottom} stroke="var(--ink-muted)" strokeDasharray="2 2" />}
        <rect x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} fill="transparent"
          onPointerMove={onMove} onPointerLeave={leave} />
      </svg>
      {node}
    </div>
  )
}

export function ContractTip({ c }: { c: Contract }) {
  const verdict =
    c.z == null ? 'not fitted (illiquid / wide)' : Math.abs(c.z) <= 1 ? 'inside spread' : c.z > 0 ? 'rich vs fit' : 'cheap vs fit'
  return (
    <div>
      <div style={{ fontWeight: 600 }}>{c.K} {c.cp === 'C' ? 'call' : 'put'} · {c.exp}</div>
      <div>bid/ask  {money(c.bid)} / {money(c.ask)}</div>
      <div>IV mid   {pct(c.ivMid)}  (fit {pct(c.ivFit)})</div>
      <div>resid    {volPts(c.ivMid != null && c.ivFit != null ? c.ivMid - c.ivFit : null, 2)} vol pts</div>
      <div>z        {num(c.z, 2)}  · {verdict}</div>
      <div>conf     {c.conf == null ? '–' : `${Math.round(c.conf * 100)}%`}</div>
      <div>Δ {num(c.delta, 2)} · OI {int(c.oi)} · vol {int(c.vol)}</div>
    </div>
  )
}

export function SmileLegend() {
  const item = 'inline-flex items-center gap-1.5'
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted mt-3">
      <span className={item}><i className="inline-block w-4 h-[2.5px] rounded" style={{ background: 'var(--accent)' }} />SVI fit</span>
      <span className={item}><i className="inline-block w-[2px] h-3 rounded" style={{ background: 'var(--ink-muted)' }} />bid–ask IV</span>
      <span className={item}><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--rich)' }} />rich (mid above fit)</span>
      <span className={item}><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--cheap)' }} />cheap (mid below fit)</span>
      <span className={item}><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--neutral)' }} />inside spread</span>
      <span className={item}><i className="inline-block w-2.5 h-2.5 rounded-full border" style={{ borderColor: 'var(--ink-muted)' }} />not fitted</span>
    </div>
  )
}
