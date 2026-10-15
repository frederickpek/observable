import { useEffect, useState } from 'react'
import { useIndex, useMetrics } from './lib/data'
import { Overview } from './pages/Overview'
import { TickerPage } from './pages/TickerPage'

const readHash = () => decodeURIComponent(location.hash.replace(/^#\/?/, '')) || null

export default function App() {
  const { data: index, error } = useIndex()
  const { data: metrics } = useMetrics()
  const [route, setRoute] = useState<string | null>(readHash)
  useEffect(() => {
    const on = () => setRoute(readHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = (sym: string | null) => (location.hash = sym ? `/${sym}` : '')
  const ticker = index?.tickers.find((t) => t.symbol === route) ?? null

  return (
    <div className="px-4 pt-7 pb-16">
      <div className="max-w-[1120px] mx-auto">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-1.5">End-of-day options analytics · S&amp;P 500 leaders</p>
            <h1 className="text-[28px] font-bold mb-2"><button onClick={() => go(null)}>Vol Surface Observatory</button></h1>
            <p className="blurb max-w-[64ch]">
              Every US close, each chain is cleaned, re-implied off its put–call-parity forward, and fitted with an SVI smile.
              Quotes that sit outside their own bid–ask relative to the fit are flagged <strong>rich</strong> or{' '}
              <strong>cheap</strong>, with a confidence that accounts for spread and liquidity.
            </p>
          </div>
          <ThemeToggle />
        </header>

        {error && <div className="card text-bad">Could not load data/index.json — run the pipeline first. ({error})</div>}

        {index && (
          <>
            <nav className="tabs flex gap-0.5 border-b border-line mb-5 overflow-x-auto" role="tablist">
              <Tab active={!ticker} onClick={() => go(null)}>Overview</Tab>
              {index.tickers.map((t) => (
                <Tab key={t.symbol} active={ticker?.symbol === t.symbol} onClick={() => go(t.symbol)}>{t.symbol}</Tab>
              ))}
            </nav>
            {ticker ? (
              <TickerPage key={ticker.symbol} ticker={ticker} history={metrics?.[ticker.symbol] ?? (ticker.latest ? [ticker.latest] : [])} />
            ) : (
              <Overview tickers={index.tickers} onOpen={go} />
            )}
            <footer className="mt-8 pt-4 border-t border-line text-xs text-muted leading-relaxed max-w-[75ch]">
              Source: Cboe delayed quotes, snapshotted after the close. Data as of{' '}
              <span className="mono">{new Date(index.generatedAt).toLocaleString()}</span>; full chains kept for{' '}
              {index.retentionDays} trading days, daily metrics kept indefinitely.
              {index.missing?.length > 0 && <> <span className="text-bad">Missing for the {index.session} close: {index.missing.join(', ')}</span> — showing their previous snapshot.</>}{' '}
              Not investment advice — residuals are relative to a model fit, and closing quotes can be stale.
            </footer>
          </>
        )}
      </div>
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-3.5 py-2.5 text-[13.5px] font-semibold -mb-px border-b-2 whitespace-nowrap transition-colors ${
        active ? 'text-accent border-accent' : 'text-muted border-transparent hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(() => document.documentElement.dataset.theme ?? null)
  const apply = (t: string | null) => {
    setTheme(t)
    if (t) {
      document.documentElement.dataset.theme = t
      localStorage.setItem('theme', t)
    } else {
      delete document.documentElement.dataset.theme
      localStorage.removeItem('theme')
    }
  }
  return (
    <div className="segmented" role="group" aria-label="Theme">
      {([['Auto', null], ['Light', 'light'], ['Dark', 'dark']] as const).map(([label, v]) => (
        <button key={label} aria-pressed={theme === v} onClick={() => apply(v)}>{label}</button>
      ))}
    </div>
  )
}
