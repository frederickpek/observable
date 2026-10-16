import { useMemo, useState } from 'react'
import { HistoryChart } from '../components/HistoryChart'
import { ResidualHeatmap } from '../components/ResidualHeatmap'
import { SignalsTable } from '../components/SignalsTable'
import { SmileChart, SmileLegend } from '../components/SmileChart'
import { InfoTip } from '../components/InfoTip'
import { Stat, type StatHelp } from '../components/Stat'
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
  // One standard deviation: IV scales with the square root of time.
  const move30 = s.atm30 == null ? null : s.atm30 * Math.sqrt(30 / 365)
  const move1d = s.atm30 == null ? null : s.atm30 / Math.sqrt(252)

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
        <Stat label="ATM IV 30d" value={pct(s.atm30)} align="left"
          sub={chain.cboeIv30 ? `Cboe IV30 ${chain.cboeIv30.toFixed(1)}%` : undefined} help={HELP.atm30} />
        <Stat label="Expected move 30d" value={move30 == null ? '–' : `±${pct(move30)}`}
          sub={move30 == null ? undefined : `±$${money(chain.spot * move30)} · ~${pct(move1d)}/day`} help={HELP.move} />
        <Stat label="Realized 20d" value={pct(s.rv20)} sub={`10d ${pct(s.rv10)} · 60d ${pct(s.rv60)}`} help={HELP.rv} />
        <Stat label="IV − RV" value={volPts(vrp)} sub="vol pts, 30d vs 20d" help={HELP.vrp} />
        <Stat label="25Δ risk reversal" value={volPts(s.rr25)} sub={`butterfly ${volPts(s.bf25)}`} help={HELP.rr} />
        <Stat label="Term 30→90d" value={volPts(s.atm90 != null && s.atm30 != null ? s.atm90 - s.atm30 : null)} align="right"
          sub={`90d ${pct(s.atm90)}`} help={HELP.term} />
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
          The amber curve is an arbitrage-aware{' '}
          <a href="https://arxiv.org/abs/1204.0646" target="_blank" rel="noreferrer" className="link">SVI</a> fit weighted by
          spread. Fit error{' '}
          <span className="mono">{(slice.rmse * 100).toFixed(2)}</span> vol pts across {slice.nFit} quotes
          {slice.butterflyMinG < 0 && <span className="text-bad"> · butterfly arbitrage in fit wings</span>}.
        </p>
        <SmileChart slice={slice} spot={chain.spot} />
        <SmileLegend />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="card-title flex items-center gap-1.5">
            Term structure
            <InfoTip label="Term structure">
              <span className="stat-pop-h block">What it shows</span>
              <span className="block">
                Each expiry's at-the-money implied vol plotted against days to expiry (log scale, so short dates get more
                room). It shows <em>when</em> the market expects volatility, where the smile shows <em>where</em>. The dashed
                line is 20-day realized vol. Click a point to load that expiry's smile.
              </span>
              <span className="stat-pop-h block mt-2">Reading the shape</span>
              <table>
                <thead>
                  <tr><th>Shape</th><th>Looks like</th><th>Usually means</th></tr>
                </thead>
                <tbody>
                  <tr><td>Contango</td><td>Rising: short low, long higher</td><td>Calm now; the normal state, as more time means more uncertainty</td></tr>
                  <tr><td>Inverted</td><td>Falling: short above long</td><td>Stress now, or an event coming soon</td></tr>
                  <tr><td>Humped</td><td>Rises, then falls</td><td>Risk concentrated in a specific window</td></tr>
                </tbody>
              </table>
              <span className="stat-pop-h block mt-2">Examples</span>
              <span className="block">
                <strong>SPY</strong> is typically in contango: calm near-term, more uncertainty priced further out.{' '}
                <strong>USO</strong> is often humped: near-term supply risk is high, and prices are expected to settle over the
                long run.
              </span>
            </InfoTip>
          </h3>
          <TermStructure slices={slices} rv20={s.rv20} selected={slice.exp} onSelect={setExp} />
        </div>
        <div className="card">
          <h3 className="card-title">30d implied vs 20d realized · history</h3>
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

const HELP: Record<string, StatHelp> = {
  atm30: {
    what: <>Implied volatility of at-the-money options (strike ≈ the forward), interpolated to exactly 30 days from the two listed expiries either side. The market's priced-in volatility for the next month, annualised.</>,
    read: <>On its own it only says how volatile this name is; compare it with realized vol (IV − RV) and with its own history. The sub-line is Cboe's own 30-day figure, an independent cross-check on our calculation.</>,
  },
  move: {
    what: <>The one-standard-deviation move implied by ATM IV 30d: IV × √(30/365) over the month, and IV ÷ √252 per trading day.</>,
    read: <>Roughly a 2-in-3 chance the stock finishes the month inside this range, if returns were normally distributed. Real returns have fatter tails, so bigger moves happen more often than that implies. It's what the options are priced for, not a forecast.</>,
  },
  rv: {
    what: <>Realized volatility: the annualised standard deviation of daily close-to-close returns over the last 20 trading days. The sub-line shows the 10- and 60-day windows.</>,
    read: <>What the stock actually did, looking back. 10d above 60d means moves are speeding up; below means things are calming down. Comparing windows matters when reading IV − RV.</>,
  },
  vrp: {
    what: <>ATM IV 30d minus Realized 20d, in vol points. A proxy for the volatility risk premium: how much option buyers pay above recently delivered movement.</>,
    read: <>Usually positive, since protection carries a premium. Large positive = options expensive relative to recent moves; negative = options pricing less than just happened. Check against the 60d realized and the term structure: a quiet month or an upcoming event (e.g. earnings) can inflate it.</>,
  },
  rr: {
    what: <>30-day implied vol of the 25Δ call minus the 25Δ put: comparable out-of-the-money strikes on each side. The sub-line butterfly is the average of those two minus ATM vol.</>,
    read: <>Negative = downside protection costs more than upside, which is normal for stocks; more negative = more hedging demand. The butterfly measures curvature: near zero means a mostly straight, sloped smile; higher means fatter wings priced on both sides.</>,
  },
  term: {
    what: <>90-day ATM implied vol minus 30-day ATM implied vol. The sub-line is the 90-day level.</>,
    read: <>Positive (contango) is normal: more time, more uncertainty. Negative (inverted) means the next month is priced riskier than the following quarter, usually a scheduled event such as earnings or a macro release.</>,
  },
}
