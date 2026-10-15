import { scaleLinear, scaleLog } from 'd3-scale'
import { line } from 'd3-shape'
import { expLabel, pct } from '../lib/format'
import type { Slice } from '../lib/types'
import { useTooltip } from './Tooltip'

const W = 380
const H = 240
const M = { top: 24, right: 14, bottom: 34, left: 42 }

export function TermStructure({ slices, rv20, selected, onSelect }: {
  slices: Slice[]; rv20: number | null; selected: string; onSelect: (exp: string) => void
}) {
  const { wrapRef, show, hide, node } = useTooltip()
  const x = scaleLog().domain([Math.max(1, slices[0].dte), slices[slices.length - 1].dte]).range([M.left, W - M.right])
  const vals = slices.map((s) => s.atmIv).concat(rv20 ?? [])
  const y = scaleLinear()
    .domain([Math.min(...vals) * 0.92, Math.max(...vals) * 1.05])
    .range([H - M.bottom, M.top])
    .nice()
  const path = line<Slice>().x((s) => x(s.dte)).y((s) => y(s.atmIv))(slices)
  const ticks = [7, 30, 90, 180, 365, 730].filter((t) => t >= x.domain()[0] && t <= x.domain()[1])

  return (
    <div ref={wrapRef} className="relative">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="ATM implied vol term structure">
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line className="grid-line" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text className="tick" x={M.left - 8} y={y(t) + 3.5} textAnchor="end">{(t * 100).toFixed(0)}%</text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t} className="tick" x={x(t)} y={H - M.bottom + 16} textAnchor="middle">{t >= 365 ? `${t / 365}y` : `${t}d`}</text>
        ))}
        <line className="axis-line" x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} />
        <text className="axis-label" x={W - M.right} y={H - 4} textAnchor="end">Days to expiry (log)</text>
        <text className="axis-label" x={M.left} y={M.top - 10}>ATM implied vol</text>
        {rv20 != null && (
          <g>
            <line x1={M.left} x2={W - M.right} y1={y(rv20)} y2={y(rv20)} stroke="var(--accent-2)" strokeWidth={1.75} strokeDasharray="4 3" />
            <text className="tick" x={W - M.right} y={y(rv20) - 5} textAnchor="end" style={{ fill: 'var(--ink-muted)' }}>20d realized {pct(rv20)}</text>
          </g>
        )}
        <path d={path ?? ''} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        {slices.map((s) => (
          <g key={s.exp}>
            <circle cx={x(Math.max(s.dte, x.domain()[0]))} cy={y(s.atmIv)} r={s.exp === selected ? 5.5 : 4}
              fill={s.exp === selected ? 'var(--accent)' : 'var(--surface)'} stroke="var(--accent)" strokeWidth={2} />
            <circle cx={x(Math.max(s.dte, x.domain()[0]))} cy={y(s.atmIv)} r={11} fill="transparent" className="cursor-pointer"
              onClick={() => onSelect(s.exp)}
              onPointerMove={(e) => show(e.clientX, e.clientY, <div>{expLabel(s.exp, s.dte)}<br />ATM {pct(s.atmIv, 2)}</div>)}
              onPointerLeave={hide} />
          </g>
        ))}
      </svg>
      {node}
    </div>
  )
}
