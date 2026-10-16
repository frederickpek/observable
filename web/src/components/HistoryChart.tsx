import { scaleLinear, scaleTime } from 'd3-scale'
import { line } from 'd3-shape'
import { useState } from 'react'
import { pct, shortDate } from '../lib/format'
import type { Summary } from '../lib/types'
import { svgPoint, useTooltip } from './Tooltip'

const W = 380
const H = 240
const M = { top: 24, right: 14, bottom: 34, left: 42 }

const SERIES = [
  { key: 'atm30', label: '30d ATM IV', color: 'var(--accent)', dash: undefined },
  { key: 'rv20', label: '20d realized', color: 'var(--accent-2)', dash: '4 3' },
] as const

export function HistoryChart({ history }: { history: Summary[] }) {
  const { wrapRef, show, hide, node } = useTooltip()
  const [hover, setHover] = useState<number | null>(null)

  if (history.length < 2) {
    const h = history[0]
    return (
      <div className="blurb py-6">
        History builds up one point per trading day. So far: <strong>{history.length} day</strong>
        {h && <> — 30d ATM IV <strong className="mono">{pct(h.atm30)}</strong> vs 20d realized <strong className="mono">{pct(h.rv20)}</strong></>}.
        IV rank and percentile switch on after 20 days.
      </div>
    )
  }

  const t = history.map((h) => new Date(h.date))
  // Ticks sit on real sessions only: always the first and last, plus up to 3 evenly spaced between.
  const tickIdx = [...new Set(Array.from({ length: 5 }, (_, j) => Math.round((j / 4) * (history.length - 1))))]
  const x = scaleTime().domain([t[0], t[t.length - 1]]).range([M.left, W - M.right])
  const vals = history.flatMap((h) => [h.atm30, h.rv20]).filter((v): v is number => v != null)
  const y = scaleLinear().domain([Math.min(...vals) * 0.9, Math.max(...vals) * 1.05]).range([H - M.bottom, M.top]).nice()

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const p = svgPoint(e, W, H)
    let i = 0
    t.forEach((d, j) => { if (Math.abs(x(d) - p.x) < Math.abs(x(t[i]) - p.x)) i = j })
    setHover(i)
    const h = history[i]
    show(e.clientX, e.clientY, <div>{shortDate(h.date, true)}<br />IV30 {pct(h.atm30)} · RV20 {pct(h.rv20)}<br />IV rank {h.ivRank == null ? '–' : Math.round(h.ivRank * 100)}</div>)
  }

  return (
    <div ref={wrapRef} className="relative">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="30 day implied vs realized volatility history">
        {y.ticks(4).map((v) => (
          <g key={v}>
            <line className="grid-line" x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} />
            <text className="tick" x={M.left - 8} y={y(v) + 3.5} textAnchor="end">{(v * 100).toFixed(0)}%</text>
          </g>
        ))}
        {tickIdx.map((i, j) => (
          <text key={history[i].date} className="tick" x={x(t[i])} y={H - M.bottom + 16}
            textAnchor={j === 0 ? 'start' : j === tickIdx.length - 1 ? 'end' : 'middle'}>
            {shortDate(history[i].date)}
          </text>
        ))}
        <line className="axis-line" x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} />
        {SERIES.map((s) => {
          const d = line<Summary>().defined((h) => h[s.key] != null).x((_, i) => x(t[i])).y((h) => y(h[s.key]!))(history)
          return <path key={s.key} d={d ?? ''} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} />
        })}
        {hover != null && (
          <g>
            <line x1={x(t[hover])} x2={x(t[hover])} y1={M.top} y2={H - M.bottom} stroke="var(--ink-muted)" strokeDasharray="2 2" />
            {SERIES.map((s) => history[hover][s.key] != null && (
              <circle key={s.key} cx={x(t[hover])} cy={y(history[hover][s.key]!)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
        <rect x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} fill="transparent"
          onPointerMove={onMove} onPointerLeave={() => { setHover(null); hide() }} />
      </svg>
      <div className="flex gap-4 text-xs text-muted mt-2">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg width="16" height="4"><line x1="0" x2="16" y1="2" y2="2" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} /></svg>{s.label}
          </span>
        ))}
      </div>
      {node}
    </div>
  )
}
