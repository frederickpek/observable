import { useMemo, useState } from 'react'
import { zColor } from '../lib/color'
import { contracts } from '../lib/data'
import { int, money, num, pct, shortDate, signed, volPts } from '../lib/format'
import type { Contract, Slice } from '../lib/types'

type Key = 'conf' | 'z' | 'resid' | 'edge' | 'dte' | 'K' | 'oi'
const COLS: { key: Key | null; label: string; title?: string }[] = [
  { key: 'dte', label: 'Expiry' },
  { key: 'K', label: 'Strike' },
  { key: null, label: 'Δ' },
  { key: null, label: 'Bid / Ask' },
  { key: null, label: 'IV mid' },
  { key: null, label: 'IV fit' },
  { key: 'resid', label: 'Resid', title: 'Mid IV minus fitted IV, vol points' },
  { key: 'z', label: 'z', title: 'Residual ÷ half bid-ask spread in vol terms' },
  { key: 'edge', label: 'Edge $', title: 'Per share, after crossing the spread: sell rich at bid / buy cheap at ask vs fitted price' },
  { key: 'oi', label: 'OI' },
  { key: 'conf', label: 'Conf' },
]

type Row = Contract & { resid: number }

export function SignalsTable({ slices, onSelect }: { slices: Slice[]; onSelect: (exp: string) => void }) {
  const [side, setSide] = useState<'all' | 'rich' | 'cheap'>('all')
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'conf', dir: -1 })
  const [showAll, setShowAll] = useState(false)

  const rows = useMemo(() => {
    const all: Row[] = slices.flatMap((s) =>
      contracts(s)
        .filter((c) => c.z != null && c.ivMid != null && c.ivFit != null)
        .map((c) => ({ ...c, resid: c.ivMid! - c.ivFit! })),
    )
    const filtered = all.filter((r) =>
      (side === 'all' || (side === 'rich' ? r.z! > 0 : r.z! < 0)) && (showAll || (r.conf ?? 0) > 0),
    )
    const val = (r: Row) => {
      const v = sort.key === 'z' || sort.key === 'resid' ? Math.abs(r[sort.key] ?? 0) : r[sort.key] ?? 0
      return v as number
    }
    return filtered.sort((a, b) => sort.dir * (val(a) - val(b)) || b.conf! - a.conf!).slice(0, 200)
  }, [slices, side, sort, showAll])

  const toggle = (key: Key) => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="segmented" role="group" aria-label="Side">
          {(['all', 'rich', 'cheap'] as const).map((s) => (
            <button key={s} aria-pressed={side === s} onClick={() => setSide(s)}>{s === 'all' ? 'All' : s === 'rich' ? 'Rich' : 'Cheap'}</button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-[13px] text-muted">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} style={{ accentColor: 'var(--accent-2)' }} />
          include zero-confidence (inside spread / illiquid)
        </label>
        <span className="text-xs text-muted ml-auto mono">{rows.length}{rows.length === 200 ? '+' : ''} rows</span>
      </div>
      <div className="max-h-[440px] overflow-auto">
        <table className="data">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.label} title={c.title}>
                  {c.key ? (
                    <button onClick={() => toggle(c.key!)}>
                      {c.label}{sort.key === c.key ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.exp}${r.cp}${r.K}`} onClick={() => onSelect(r.exp)}>
                <td>{shortDate(r.exp, r.dte > 300)} <span className="text-muted">{r.dte}d</span></td>
                <td>{r.K} <span className="text-muted">{r.cp}</span></td>
                <td>{num(r.delta, 2)}</td>
                <td>{money(r.bid)} / {money(r.ask)}</td>
                <td>{pct(r.ivMid)}</td>
                <td>{pct(r.ivFit)}</td>
                <td>{volPts(r.resid, 2)}</td>
                <td>
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    <i className="inline-block w-2 h-2 rounded-full" style={{ background: zColor(r.z, r.conf) }} />
                    {signed(r.z, 1)} <span className="text-muted text-[11px] w-9 text-left">{r.z! > 0 ? 'rich' : 'cheap'}</span>
                  </span>
                </td>
                <td style={{ color: (r.edge ?? 0) > 0 ? 'var(--good)' : 'var(--ink-muted)' }}>{signed(r.edge, 2)}</td>
                <td>{int(r.oi)}</td>
                <td><ConfBar v={r.conf ?? 0} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ConfBar({ v }: { v: number }) {
  return (
    <span className="inline-flex items-center gap-2 justify-end">
      <span className="inline-block w-12 h-1.5 rounded bg-surface-2 overflow-hidden align-middle">
        <span className="block h-full rounded" style={{ width: `${v * 100}%`, background: 'var(--accent)' }} />
      </span>
      <span className="w-8">{Math.round(v * 100)}%</span>
    </span>
  )
}
