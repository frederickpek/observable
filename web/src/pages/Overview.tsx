import { useMemo, useState, type ReactNode } from 'react'
import { money, pct, volPts } from '../lib/format'
import type { IndexTicker } from '../lib/types'

type Key = 'symbol' | 'atm30' | 'vrp' | 'rr25' | 'term' | 'signals'

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
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="card-title !mb-0">Universe · last close</h3>
        <span className="text-xs text-muted">Click a row to open the ticker</span>
      </div>
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
                <td><span style={{ color: 'var(--rich)' }}>{s.signalsRich}</span> <span className="text-muted">/</span> <span style={{ color: 'var(--cheap)' }}>{s.signalsCheap}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ColumnGuide />
    </div>
  )
}

const GUIDE: { col: string; measures: ReactNode; means: ReactNode; read: ReactNode }[] = [
  {
    col: 'IV 30d',
    measures: <>The annualised volatility the options market expects over the next 30 days, from at-the-money options interpolated to exactly 30 days.</>,
    means: <>A 1-month one-standard-deviation move of roughly IV × √(30/365). At 43%, the market is pricing about ±12% over the month (≈ 2.7% a day, using IV ÷ 16).</>,
    read: <>Don't compare raw levels across names: TSLA will always sit above SPY. It's informative relative to realized vol (the IV − RV column) and to its own history on the ticker page.</>,
  },
  {
    col: 'RV 20d',
    measures: <>Realized volatility: the annualised standard deviation of daily close-to-close returns over the last 20 trading days (about a month).</>,
    means: <>How much the underlying actually moved. It's backward-looking, while IV is forward-looking.</>,
    read: <>The ticker page also shows 10d and 60d realized. 10d above 60d means moves are speeding up; below means they're calming down.</>,
  },
  {
    col: 'IV − RV',
    measures: <>Implied minus realized, in vol points. This is a proxy for the <strong>volatility risk premium</strong>: what option buyers pay above the movement the underlying has actually delivered.</>,
    means: (
      <>
        It's usually positive. Investors pay up for protection, so on average options are priced above the moves that follow,
        and option sellers earn that gap as payment for taking the risk. A <strong>large positive</strong> value means options are
        expensive relative to recent behaviour. A <strong>negative</strong> value means options are pricing less movement than just
        happened: the market expects things to calm down, or it is underpricing risk.
      </>
    ),
    read: (
      <>
        It's the most direct "is vol expensive here?" number on the page, but the two halves cover different windows (next 30 days
        against the last 20), so an event explains a lot of gaps. An earnings date inside 30 days lifts IV legitimately, and a
        shock that has just passed inflates RV. Mid-October to early November is Q3 earnings season, so check the term-structure
        column before reading a big positive as "rich".
      </>
    ),
  },
  {
    col: '25Δ RR',
    measures: <>The 30-day 25-delta risk reversal: implied vol of the 25Δ call minus the 25Δ put. The two strikes sit about equally far out of the money on each side.</>,
    means: <>The relative price of upside versus downside, i.e. which way the smile tilts: negative is left-skewed, positive is right-skewed, near zero is symmetric. Negative means puts are bid over calls, i.e. demand for crash protection, which is normal for equities.</>,
    read: <>More negative means more hedging demand or fear. Index ETFs (SPY, QQQ) are usually the most negative because institutions hedge with them. Near zero or positive points to upside chasing; commodities like GLD and USO can flip positive when the risk is a spike up.</>,
  },
  {
    col: '90d − 30d',
    measures: <>The slope of the term structure: 90-day ATM IV minus 30-day ATM IV.</>,
    means: <>Positive (contango) is the normal state: more time means more uncertainty. Negative (inverted) means near-term vol is bid above longer-dated vol.</>,
    read: <>An inversion usually means something specific is priced into the next month, most often earnings, sometimes a macro event or ongoing stress. A deeply negative value plus a big positive IV − RV usually points to an event premium rather than generally expensive options.</>,
  },
  {
    col: 'Signals',
    measures: (
      <>
        Counts of individual contracts flagged <span style={{ color: 'var(--rich)' }}>rich</span> /{' '}
        <span style={{ color: 'var(--cheap)' }}>cheap</span> with ≥ 50% confidence. A flag means the mid-price IV sits off the
        ticker's own fitted smile by more than both the bid-ask spread and the fit's typical error, on a contract with enough
        open interest and volume.
      </>
    ),
    means: <>This is relative value <em>inside</em> one surface (this strike against its neighbours), not a view on whether the stock's vol overall is high or low.</>,
    read: (
      <>
        Zero is normal: a well-arbitraged chain should produce few flags. Rich currently outnumbers cheap, most likely because most flags
        are far out-of-the-money options priced at a few cents, where the minimum price tick props the mid above fair value.
        On those, the Edge column on the ticker page is usually only cents. Clusters across neighbouring strikes or expiries
        (visible in the ticker heatmap) mean more than isolated flags.
      </>
    ),
  },
]

function ColumnGuide() {
  return (
    <details className="guide mt-4 border-t border-line pt-3">
      <summary className="text-[13px] font-medium text-muted hover:text-ink cursor-pointer select-none">
        Column Definitions
      </summary>
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2 mt-4">
        {GUIDE.map((g) => (
          <section key={g.col} className="text-[13.5px] leading-[1.55]">
            <h4 className="mono text-[13px] font-semibold text-accent mb-1.5">{g.col}</h4>
            <dl className="grid grid-cols-[76px_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-[10.5px] uppercase tracking-[0.05em] text-muted pt-[3px]">Measures</dt>
              <dd className="text-ink">{g.measures}</dd>
              <dt className="text-[10.5px] uppercase tracking-[0.05em] text-muted pt-[3px]">Means</dt>
              <dd className="text-muted">{g.means}</dd>
              <dt className="text-[10.5px] uppercase tracking-[0.05em] text-muted pt-[3px]">Read it</dt>
              <dd className="text-muted">{g.read}</dd>
            </dl>
          </section>
        ))}
      </div>
    </details>
  )
}
