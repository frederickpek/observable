import { useMemo, useState } from 'react'
import { money, pct, volPts } from '../lib/format'
import type { IndexTicker } from '../lib/types'

type Key = 'symbol' | 'atm30' | 'vrp' | 'rr25' | 'term' | 'ivRank' | 'signals'

export function Overview({ tickers, onOpen }: { tickers: IndexTicker[]; onOpen: (s: string) => void }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'vrp', dir: -1 })
  const rows = useMemo(() => {
    const r = tickers
      .filter((t) => t.latest)
      .map((t) => {
        const s = t.latest!
        return {
          t,
          s,
          vrp: s.atm30 != null && s.rv20 != null ? s.atm30 - s.rv20 : null,
          term: s.atm90 != null && s.atm30 != null ? s.atm90 - s.atm30 : null,
          signals: s.signalsRich + s.signalsCheap,
        }
      })
    const v = (x: (typeof r)[number]) =>
      sort.key === 'symbol' ? 0 : sort.key === 'vrp' || sort.key === 'term' || sort.key === 'signals' ? x[sort.key] : x.s[sort.key]
    return r.sort((a, b) =>
      sort.key === 'symbol' ? sort.dir * a.t.symbol.localeCompare(b.t.symbol) : sort.dir * ((v(a) ?? -Infinity) - (v(b) ?? -Infinity)),
    )
  }, [tickers, sort])
  const th = (key: Key, label: string, title?: string) => (
    <th title={title}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }))}>
        {label}{sort.key === key ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.vrp ?? 0)), 0.01)

  return (
    <div className="card">
      <h3 className="card-title">Universe · last close</h3>
      <p className="blurb mb-3">
        Where is vol rich or cheap <em>across names</em>? <strong>IV − RV</strong> compares 30-day implied with 20-day
        realized; <strong>skew</strong> is the 25Δ risk reversal; <strong>signals</strong> counts contracts with ≥ 50%
        confidence of being mispriced versus their own smile. Click a row to open the ticker.
      </p>
      <div className="overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              {th('symbol', 'Ticker')}
              <th>Spot</th>
              {th('atm30', 'IV 30d')}
              <th>RV 20d</th>
              {th('vrp', 'IV − RV', 'vol pts')}
              {th('rr25', '25Δ RR', '30d call − put vol')}
              {th('term', '90d − 30d')}
              {th('ivRank', 'IV rank')}
              {th('signals', 'Signals', 'rich / cheap with confidence ≥ 50%')}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, s, vrp, term }) => (
              <tr key={t.symbol} onClick={() => onOpen(t.symbol)}>
                <td><span className="font-semibold">{t.symbol}</span> <span className="text-muted text-[11px] font-sans">{t.name}</span></td>
                <td>{money(s.spot)}</td>
                <td>{pct(s.atm30)}</td>
                <td>{pct(s.rv20)}</td>
                <td>
                  <span className="inline-flex items-center gap-2 justify-end">
                    <span className="relative inline-block w-16 h-2">
                      <span className="absolute left-1/2 top-0 bottom-0 w-px bg-line" />
                      {vrp != null && (
                        <span className="absolute top-0 bottom-0 rounded-sm" style={{
                          background: vrp > 0 ? 'var(--rich)' : 'var(--cheap)',
                          left: vrp > 0 ? '50%' : `${50 - (Math.abs(vrp) / maxAbs) * 50}%`,
                          width: `${(Math.abs(vrp) / maxAbs) * 50}%`,
                        }} />
                      )}
                    </span>
                    <span className="w-12">{volPts(vrp)}</span>
                  </span>
                </td>
                <td>{volPts(s.rr25)}</td>
                <td>{volPts(term)}</td>
                <td>{s.ivRank == null ? <span className="text-muted" title={`${s.histDays} of 20 days collected`}>{s.histDays}/20d</span> : Math.round(s.ivRank * 100)}</td>
                <td><span style={{ color: 'var(--rich)' }}>{s.signalsRich}</span> <span className="text-muted">/</span> <span style={{ color: 'var(--cheap)' }}>{s.signalsCheap}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
