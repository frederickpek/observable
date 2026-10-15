import { useMemo, useState } from 'react'
import { HistoryChart } from '../components/HistoryChart'
import { ResidualHeatmap } from '../components/ResidualHeatmap'
import { SignalsTable } from '../components/SignalsTable'
import { SmileChart, SmileLegend } from '../components/SmileChart'
import { Stat } from '../components/Stat'
import { TermStructure } from '../components/TermStructure'
import { useChain } from '../lib/data'
import { expLabel, money, num, pct, shortDate, volPts } from '../lib/format'
import type { IndexTicker, Summary } from '../lib/types'

export function TickerPage({ ticker, history }: { ticker: IndexTicker; history: Summary[] }) {
  const [date, setDate] = useState(ticker.dates[0])
  const { data: chain, error, loading } = useChain(ticker.symbol, date)

  const [exp, setExp] = useState<string | null>(null)
  const slices = useMemo(() => chain?.slices ?? [], [chain])
  const slice = useMemo(() => {
    if (!slices.length) return null
    return slices.find((s) => s.exp === exp) ?? slices.reduce((a, b) => (Math.abs(b.dte - 30) < Math.abs(a.dte - 30) ? b : a))
  }, [slices, exp])

  if (error) return <div className="card text-bad">Failed to load chain: {error}</div>
  if (!chain || !slice) return <div className="card blurb">{loading ? 'Loading chain…' : 'No data.'}</div>

  const s = chain.summary
  const vrp = s.atm30 != null && s.rv20 != null ? s.atm30 - s.rv20 : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">{chain.name}</div>
          <h2 className="text-[26px] font-bold mt-1">
            {chain.symbol} <span className="mono text-[20px] font-medium">{money(chain.spot)}</span>
          </h2>
        </div>
        <label className="text-[13px] text-muted inline-flex items-center gap-2">
          Close of
          <select className="ctl" value={date} onChange={(e) => setDate(e.target.value)}>
            {ticker.dates.map((d) => <option key={d} value={d}>{shortDate(d, true)}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Stat label="ATM IV 30d" value={pct(s.atm30)} sub={chain.cboeIv30 ? `Cboe IV30 ${chain.cboeIv30.toFixed(1)}%` : undefined} />
        <Stat label="Realized 20d" value={pct(s.rv20)} sub={`10d ${pct(s.rv10)} · 60d ${pct(s.rv60)}`} />
        <Stat label="IV − RV" value={volPts(vrp)} sub="vol pts, 30d vs 20d" title="Variance risk premium proxy: positive = options price more movement than recently realized" />
        <Stat label="25Δ risk reversal" value={volPts(s.rr25)} sub={`butterfly ${volPts(s.bf25)}`} title="30d 25Δ call vol minus 25Δ put vol. Negative = put skew" />
        <Stat label="Term 30→90d" value={volPts(s.atm90 != null && s.atm30 != null ? s.atm90 - s.atm30 : null)} sub={`90d ${pct(s.atm90)}`} title="Positive = contango (normal), negative = inverted / event risk" />
        <Stat label="IV rank (1y)" value={s.ivRank == null ? '–' : Math.round(s.ivRank * 100)} sub={s.ivRank == null ? `needs 20d · have ${s.histDays}` : `pct ${Math.round((s.ivPct ?? 0) * 100)}`} />
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h3 className="card-title !mb-0">Smile · {expLabel(slice.exp, slice.dte)}</h3>
          <select className="ctl" value={slice.exp} onChange={(e) => setExp(e.target.value)} aria-label="Expiry">
            {slices.map((x) => <option key={x.exp} value={x.exp}>{expLabel(x.exp, x.dte)}</option>)}
          </select>
        </div>
        <p className="blurb mb-2">
          Each dot is the mid-price implied vol of the out-of-the-money option at that strike; the grey bar is the bid–ask range.
          The amber curve is an arbitrage-aware <strong>SVI</strong> fit weighted by spread. Fit error{' '}
          <span className="mono">{(slice.rmse * 100).toFixed(2)}</span> vol pts across {slice.nFit} quotes
          {slice.butterflyMinG < 0 && <span className="text-bad"> · butterfly arbitrage in fit wings</span>}.
        </p>
        <SmileChart slice={slice} spot={chain.spot} />
        <SmileLegend />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="card-title">Term structure</h3>
          <TermStructure slices={slices} rv20={s.rv20} selected={slice.exp} onSelect={setExp} />
        </div>
        <div className="card">
          <h3 className="card-title">30d implied vs realized · history</h3>
          <HistoryChart history={history} />
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Rich / cheap map · expiry × delta</h3>
        <p className="blurb mb-3">
          Every expiry's residual against its own fit, aligned by delta. Clusters matter more than single cells: a whole
          column of red on the put wing means downside protection is bid across the curve, not one stale quote.
        </p>
        <ResidualHeatmap slices={slices} selected={slice.exp} onSelect={setExp} />
      </div>

      <div className="card">
        <h3 className="card-title">Signals</h3>
        <p className="blurb mb-3">
          <strong>z</strong> = residual ÷ half the bid–ask spread (in vol). |z| ≤ 1 means the fit sits inside the quote — no signal.{' '}
          <strong>Confidence</strong> scales |z| from 1→4 and weights by open interest and volume.{' '}
          <strong>Edge</strong> is what's left after crossing the spread against the fitted price; negative means the mispricing
          doesn't survive execution. This is relative value <em>within</em> the surface, not a directional call.
        </p>
        <SignalsTable slices={slices} onSelect={setExp} />
      </div>

      <div className="text-xs text-muted mono">
        median fit RMSE {num(s.fitRmse * 100, 2)} vol pts · butterfly-arb slices {s.butterflyArb} · calendar-arb pairs {s.calendarArb}
      </div>
    </div>
  )
}
